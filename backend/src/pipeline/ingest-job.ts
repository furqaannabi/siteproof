/**
 * The ingest_clip job: one uploaded clip, through placement, coverage and counting,
 * to the segments and detections the comparison engine reads.
 *
 * Every decision is in the pure steps (`segments.ts`, `sweep.ts`, `count.ts`,
 * `plan.ts`); this is the shell around them: storage, ffmpeg, zbar and SAM 3.1.
 */
import { decodeMaskToRaster } from "@meta-sam/parser";
import type { ItemKind } from "@siteproof/contract";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { IngestError, ingestClip } from "./ingest";
import { planClip, type PlannedDetection } from "./plan";
import type { Segmentation } from "./sam";
import { segmentsFromTags } from "./segments";
import { panShifts } from "./sweep";
import { decodeTags } from "./tags";

/**
 * The prompt SAM 3.1 is given for each item, fixed in code and chosen by testing on
 * labelled clips, never taken from a document: "glass window" found none of three
 * windows that "window" found. See docs/decisions/2026-10-29-how-a-count-is-made-and-judged.md.
 */
export const SAM_PROMPTS: Record<ItemKind, string> = { window: "window", door: "door" };

const SAMPLE_FPS = 2;

/** Like the extract job's JobError: a code, and whether another attempt could differ. */
export class ClipJobError extends Error {
  constructor(
    readonly code: string,
    readonly retry: boolean,
  ) {
    super(code);
    this.name = "ClipJobError";
  }
}

export interface ClipRow {
  id: string;
  project_id: string;
  object_key: string;
  status: string;
}

export interface SavedDetection {
  room_id: string;
  item: ItemKind;
  track_id: string;
  best_frame_key: string;
  mask_key: string;
}

export interface IngestStore {
  load(clipId: string): Promise<ClipRow | null>;
  /** This project's rooms by tag code. */
  roomsByTag(projectId: string): Promise<Map<string, string>>;
  markProcessing(clipId: string): Promise<void>;
  /** In one transaction, replacing anything an earlier attempt saved. */
  save(
    clipId: string,
    result: {
      captured_at: string | null;
      segments: { room_id: string | null; t_start: number; t_end: number; full_sweep: boolean }[];
      detections: SavedDetection[];
    },
  ): Promise<void>;
  markFailed(clipId: string): Promise<void>;
}

export interface IngestDeps {
  store: IngestStore;
  files: {
    get(key: string): Promise<Uint8Array>;
    put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  };
  /** SAM 3.1 on one clip for one prompt. */
  segment(clipPath: string, prompt: string): Promise<Segmentation>;
}

const Payload = z.object({ clip_id: z.string().min(1) });

async function run(cmd: string[], stdin?: Uint8Array): Promise<Uint8Array> {
  const proc = Bun.spawn(cmd, { stdin: stdin ?? "ignore", stdout: "pipe", stderr: "pipe" });
  const [out, code] = await Promise.all([new Response(proc.stdout).arrayBuffer(), proc.exited]);
  if (code !== 0) throw new Error(`${cmd[0]} exited ${code}`);
  return new Uint8Array(out);
}

/** The frame SAM numbered `frame`, as a JPEG, and its size. */
async function cutFrame(clip: string, frame: number) {
  const jpeg = await run([
    "ffmpeg", "-v", "error", "-i", clip, "-vf", `select=eq(n\\,${frame})`, "-frames:v", "1",
    "-q:v", "3", "-f", "image2", "-c:v", "mjpeg", "-",
  ]);
  const probe = JSON.parse(
    new TextDecoder().decode(
      await run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-i", "pipe:0"], jpeg),
    ),
  );
  const { width, height } = probe.streams[0] as { width: number; height: number };
  return { jpeg, width, height };
}

/** The object's mask, white on black at the frame's own size, as a PNG. */
async function drawMask(d: PlannedDetection, width: number, height: number): Promise<Uint8Array> {
  const canvas = new Uint8Array(width * height);
  if (d.mask) {
    const raster = decodeMaskToRaster(d.mask);
    for (let y = 0; y < d.mask.height; y++) {
      for (let x = 0; x < d.mask.width; x++) {
        const fx = d.box.left + x;
        const fy = d.box.top + y;
        if (raster[y * d.mask.width + x] && fx < width && fy < height) canvas[fy * width + fx] = 255;
      }
    }
  }
  return run(
    ["ffmpeg", "-v", "error", "-f", "rawvideo", "-pix_fmt", "gray", "-s", `${width}x${height}`, "-i", "pipe:0", "-f", "image2", "-c:v", "png", "-"],
    canvas,
  );
}

const evidenceKey = (kind: "frames" | "masks", ext: string) =>
  `siteproof/${kind}/${crypto.randomUUID().replaceAll("-", "")}.${ext}`;

export function ingestClipJob({ store, files, segment }: IngestDeps) {
  return {
    kind: "ingest_clip" as const,

    async run(payload: unknown): Promise<void> {
      const parsed = Payload.safeParse(payload);
      if (!parsed.success) throw new ClipJobError("bad_payload", false);
      const clip = await store.load(parsed.data.clip_id);
      // Already finished, or gone: a job delivered twice does nothing and costs nothing.
      if (!clip || clip.status === "done" || clip.status === "failed") return;

      await store.markProcessing(clip.id);
      const bytes = await files.get(clip.object_key).catch(() => {
        throw new ClipJobError("storage_unavailable", true);
      });

      const dir = await mkdtemp(join(tmpdir(), "siteproof-ingest-"));
      try {
        const path = join(dir, "clip");
        await Bun.write(path, bytes);
        // A clip that can't be read won't read on a second attempt either.
        const ingested = await ingestClip(path, { fps: SAMPLE_FPS, outDir: join(dir, "frames") }).catch((e) => {
          throw e instanceof IngestError ? new ClipJobError(`clip_${e.code}`, false) : e;
        });

        const planned = segmentsFromTags(await decodeTags(ingested.frames), ingested.duration_s);
        const steps = await panShifts(ingested.frames.map((f) => f.path));
        const shifts = steps.map((shift, i) => ({ t: ingested.frames[i + 1]!.t, shift }));
        const roomsByTag = await store.roomsByTag(clip.project_id);
        const placed = planClip({ planned, roomsByTag, shifts, tracks: { window: [], door: [] }, fps: ingested.source_fps });

        // SAM is paid per frame. Footage that passed no room tag of this project can
        // never back a claim, so it is not sent at all.
        const tracks: Record<ItemKind, Segmentation["objects"]> = { window: [], door: [] };
        if (placed.segments.some((s) => s.room_id !== null)) {
          for (const item of Object.keys(SAM_PROMPTS) as ItemKind[]) {
            tracks[item] = (
              await segment(path, SAM_PROMPTS[item]).catch(() => {
                throw new ClipJobError("counter_unavailable", true);
              })
            ).objects;
          }
        }
        const plan = planClip({ planned, roomsByTag, shifts, tracks, fps: ingested.source_fps });

        const detections: SavedDetection[] = [];
        for (const d of plan.detections) {
          const { jpeg, width, height } = await cutFrame(path, d.frame);
          const best_frame_key = evidenceKey("frames", "jpg");
          const mask_key = evidenceKey("masks", "png");
          await files.put(best_frame_key, jpeg, "image/jpeg");
          await files.put(mask_key, await drawMask(d, width, height), "image/png");
          detections.push({ room_id: d.room_id, item: d.item, track_id: d.track_id, best_frame_key, mask_key });
        }

        // Ids and counts only: never a key or a URL.
        console.log(
          `ingest_clip ${clip.id}: ${plan.segments.length} segment(s), ${plan.segments.filter((s) => s.full_sweep).length} full sweep(s), ${detections.length} detection(s)`,
        );
        await store.save(clip.id, { captured_at: ingested.captured_at, segments: plan.segments, detections });
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },

    /** Called by the runner when it will try no more: the clip fails. */
    async giveUp(payload: unknown): Promise<void> {
      const parsed = Payload.safeParse(payload);
      if (!parsed.success) return;
      const clip = await store.load(parsed.data.clip_id);
      if (!clip || clip.status === "done" || clip.status === "failed") return;
      await store.markFailed(clip.id);
    },
  };
}
