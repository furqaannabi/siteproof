import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestClipJob, type IngestStore } from "./ingest-job";
import type { Segmentation } from "./sam";

// Generated video only: a textured wall, a steady pan, and a printed tag fixture.
const TAG = join(import.meta.dir, "../../fixtures/tags/SPKTCHN001.png");
let dir: string;
let taggedSweep: Uint8Array;
let untagged: Uint8Array;

async function ffmpeg(...args: string[]) {
  const proc = Bun.spawn(["ffmpeg", "-v", "error", "-y", ...args], { stderr: "pipe" });
  if ((await proc.exited) !== 0) throw new Error(await new Response(proc.stderr).text());
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "siteproof-ingest-job-"));
  const wall = join(dir, "wall.png");
  await ffmpeg("-f", "lavfi", "-i", "nullsrc=s=160x36,format=gray,geq=lum='random(1)*255'", "-frames:v", "1", "-vf", "scale=1600:360:flags=bicubic", wall);
  const pan = ["-loop", "1", "-framerate", "24", "-t", "6", "-i", wall];
  await ffmpeg(...pan, "-i", TAG, "-filter_complex", "[0]crop=640:360:'t*120':0[v];[1]scale=150:150[q];[v][q]overlay=20:100:enable='lt(t,1.5)'", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(dir, "tagged.mp4"));
  await ffmpeg(...pan, "-vf", "crop=640:360:'t*120':0", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(dir, "untagged.mp4"));
  taggedSweep = new Uint8Array(await Bun.file(join(dir, "tagged.mp4")).arrayBuffer());
  untagged = new Uint8Array(await Bun.file(join(dir, "untagged.mp4")).arrayBuffer());
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function fakes(video: Uint8Array) {
  const saved: Parameters<IngestStore["save"]>[1][] = [];
  const uploads: { key: string; bytes: Uint8Array; type: string }[] = [];
  const prompts: string[] = [];
  const store: IngestStore = {
    load: async (id) => ({ id, project_id: "prj", object_key: "siteproof/clips/abc.mp4", status: "uploaded" }),
    roomsByTag: async () => new Map([["SPKTCHN001", "room_kitchen"]]),
    markProcessing: async () => {},
    save: async (_id, result) => void saved.push(result),
    markFailed: async () => {},
  };
  // One window, seen from 2 s to 3 s, with a 20×10 mask at (100, 50).
  const window: Segmentation = {
    objects: [
      {
        track_id: "0",
        sightings: Array.from({ length: 25 }, (_, i) => ({
          frame: 48 + i,
          box: { left: 100, top: 50, right: 120, bottom: 60 },
          confidence: 0.9,
        })),
      },
    ],
  };
  const job = ingestClipJob({
    store,
    files: { get: async () => video, put: async (key, bytes, type) => void uploads.push({ key, bytes, type }) },
    segment: async (_path, prompt) => {
      prompts.push(prompt);
      return prompt === "window" ? window : { objects: [] };
    },
  });
  return { job, saved, uploads, prompts };
}

test("a tagged one-way sweep is placed, covered and counted, with its evidence frame and mask stored", async () => {
  const { job, saved, uploads, prompts } = fakes(taggedSweep);

  await job.run({ clip_id: "clip_1" });

  expect(prompts).toEqual(["window", "door"]);
  expect(saved).toHaveLength(1);
  expect(saved[0]!.segments).toEqual([{ room_id: "room_kitchen", t_start: 0, t_end: expect.any(Number), full_sweep: true }]);
  expect(saved[0]!.detections).toEqual([
    { room_id: "room_kitchen", item: "window", track_id: "0/0/0", best_frame_key: expect.stringMatching(/^siteproof\/frames\/[0-9a-f]{32}\.jpg$/), mask_key: expect.stringMatching(/^siteproof\/masks\/[0-9a-f]{32}\.png$/) },
  ]);
  const [frame, mask] = uploads;
  expect([frame!.type, mask!.type]).toEqual(["image/jpeg", "image/png"]);
  expect(Array.from(frame!.bytes.subarray(0, 2))).toEqual([0xff, 0xd8]);
  expect(Array.from(mask!.bytes.subarray(1, 4))).toEqual([0x50, 0x4e, 0x47]);
});

test("a clip that passes no room tag is stored as unplaced, and never sent to SAM", async () => {
  const { job, saved, prompts } = fakes(untagged);

  await job.run({ clip_id: "clip_2" });

  expect(prompts).toEqual([]);
  expect(saved[0]!.segments.map((s) => [s.room_id, s.full_sweep])).toEqual([[null, false]]);
  expect(saved[0]!.detections).toEqual([]);
});

test("a phone's capture time with an offset like +0530 is read, not lost", async () => {
  const { captureTime } = await import("./ingest-store");

  expect(captureTime("2026-10-26T10:12:00+0530")?.toISOString()).toBe("2026-10-26T04:42:00.000Z");
  expect(captureTime("2026-10-27T09:15:00.000000Z")?.toISOString()).toBe("2026-10-27T09:15:00.000Z");
  expect(captureTime("not a date")).toBeNull();
  expect(captureTime(null)).toBeNull();
});
