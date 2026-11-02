/**
 * Step 4 of the pipeline, the model half: ask SAM 3.1 to find and track one item in
 * one clip, and read back every object it tracked.
 *
 * SAM finds; it does not count. This module returns what SAM saw, object by object
 * and frame by frame. Turning that into a count is deterministic code elsewhere.
 */
import { frameIndexOf, parseVideoStream, type SegmentationMask } from "@meta-sam/parser";
import { basename } from "node:path";
import { z } from "zod";

export interface SamConfig {
  apiKey: string;
  baseUrl: string;
  /** How long SAM's reply may go silent before the call fails. Tests shorten it. */
  idleTimeoutMs?: number;
}

/*
 * Without limits a stalled call hangs the job for good: on 2 November a 62 MB clip
 * held one connection open for over ten minutes with nothing coming back. Measured
 * the same day: a 12.5 MB clip uploaded in 31 s (about 0.4 MB/s) and SAM's reply
 * never went quiet for more than 9 s. The limits allow for half that upload speed
 * and twenty times that silence.
 */
const UPLOAD_BASE_MS = 60_000;
const UPLOAD_MS_PER_MB = 5_000;
const IDLE_TIMEOUT_MS = 180_000;

/** Read from backend/.env. Never logged. */
export function samConfigFromEnv(): SamConfig {
  const apiKey = process.env.META_API_KEY;
  const baseUrl = process.env.META_API_BASE_URL;
  if (!apiKey || !baseUrl) throw new Error("META_API_KEY and META_API_BASE_URL must be set in backend/.env");
  return { apiKey, baseUrl };
}

export interface Box {
  /** Source pixels, half-open: `right` and `bottom` are one past the last pixel. */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** One object on one frame. */
export interface Sighting {
  frame: number;
  box: Box;
  confidence?: number;
  mask?: SegmentationMask;
}

/**
 * One object as SAM tracked it within one clip. `track_id` holds only while the
 * object stays in frame: SAM may give an object that leaves and comes back a new id.
 */
export interface TrackedObject {
  track_id: string;
  sightings: Sighting[];
}

export interface Segmentation {
  objects: TrackedObject[];
}

/**
 * SAM could not give a whole answer. Never turned into a count: a partial answer
 * read as a full one is a silent undercount, and an undercount can become Short.
 */
export class SamError extends Error {
  constructor(
    readonly code: "upload_failed" | "request_failed" | "timed_out" | "incomplete" | "unreadable",
    message: string,
  ) {
    super(message);
    this.name = "SamError";
  }
}

/** Read a SAM video response, as Responses API stream events, into tracked objects. */
export async function readSegmentation(events: AsyncIterable<{ readonly type: string }>): Promise<Segmentation> {
  const result = await parseVideoStream(events).finalResult;
  if (result.outcome.status !== "completed") {
    throw new SamError("incomplete", `SAM stopped early (${result.outcome.reason})`);
  }
  // The parser drops a line it cannot read and reports it. Every object on that line
  // would go uncounted without a word, so any error-level diagnostic fails the read.
  const unreadable = result.diagnostics.filter((d) => d.severity === "error");
  if (unreadable.length > 0) {
    throw new SamError("unreadable", `${unreadable.length} line(s) of SAM output could not be read`);
  }

  const objects = new Map<string, Map<number, Sighting>>();
  for (const record of result.records) {
    if (record.kind === "text") continue;
    const frame = frameIndexOf(record) ?? 0;
    const frames = objects.get(record.objectId) ?? new Map<number, Sighting>();
    objects.set(record.objectId, frames);
    const sighting = frames.get(frame) ?? { frame, box: { left: 0, top: 0, right: 0, bottom: 0 } };
    frames.set(frame, sighting);

    if (record.kind === "box") {
      sighting.box = { left: record.left, top: record.top, right: record.right, bottom: record.bottom };
    }
    if (record.kind === "mask") {
      sighting.mask = record.mask;
      sighting.box = { ...record.bounds };
    }
    if (record.confidence !== undefined) sighting.confidence = record.confidence;
  }

  return {
    objects: [...objects].map(([track_id, frames]) => ({
      track_id,
      sightings: [...frames.values()].sort((a, b) => a.frame - b.frame),
    })),
  };
}

const SAM_MODEL = "sam-3.1";

const UploadedFile = z.object({ id: z.string().min(1) });

/** Upload one clip through the Files API. Returns the file id SAM reads it by. */
async function uploadClip(clip: string, { apiKey, baseUrl }: SamConfig): Promise<string> {
  const form = new FormData();
  form.set("purpose", "user_data");
  form.set("file", Bun.file(clip), basename(clip));

  const limitMs = UPLOAD_BASE_MS + (Bun.file(clip).size / 1e6) * UPLOAD_MS_PER_MB;
  const res = await fetch(`${baseUrl}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(limitMs),
  }).catch((e) => {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new SamError("timed_out", `clip upload took longer than ${Math.round(limitMs / 1000)} s`);
    }
    throw e;
  });
  if (!res.ok) throw new SamError("upload_failed", `clip upload failed with HTTP ${res.status}`);
  const parsed = UploadedFile.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new SamError("upload_failed", "clip upload returned no file id");
  return parsed.data.id;
}

/**
 * Server-sent events, one parsed JSON object per `data:` block. `chunks` resets the
 * idle timer on every chunk it hands over.
 */
async function* serverSentEvents(chunks: AsyncIterable<Uint8Array>): AsyncIterable<{ readonly type: string }> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of chunks) {
    buffer += decoder.decode(chunk, { stream: true }).replaceAll("\r\n", "\n");
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data && data !== "[DONE]") yield JSON.parse(data);
    }
  }
}

/**
 * Ask SAM 3.1 to find and track `prompt` (a short noun phrase, such as "window")
 * through one clip.
 */
export async function segmentClip(clip: string, prompt: string, config: SamConfig): Promise<Segmentation> {
  return segmentUploaded(await uploadClip(clip, config), prompt, config);
}

/**
 * `segmentClip` for a job that asks for several items in the same clip: the clip is
 * uploaded once and every prompt reuses it, instead of one upload per item. Only the
 * last clip is remembered, and a failed upload is not, so a retry uploads afresh.
 * The config is read on every call, as `segmentClip` callers do.
 */
export function samSegmenter(config: () => SamConfig): (clip: string, prompt: string) => Promise<Segmentation> {
  let last: { clip: string; fileId: Promise<string> } | undefined;
  return async (clip, prompt) => {
    if (last?.clip !== clip) last = { clip, fileId: uploadClip(clip, config()) };
    const upload = last;
    const fileId = await upload.fileId.catch((e) => {
      if (last === upload) last = undefined;
      throw e;
    });
    return segmentUploaded(fileId, prompt, config());
  };
}

/** Ask SAM 3.1 about a clip already uploaded through the Files API. */
async function segmentUploaded(fileId: string, prompt: string, config: SamConfig): Promise<Segmentation> {
  // One timer for the whole reply, restarted by every chunk: silence for longer than
  // the limit aborts the request, and the read fails rather than waiting for ever.
  const idleMs = config.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const rearm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => abort.abort(), idleMs);
  };
  const timedOut = (e: unknown) => {
    if (abort.signal.aborted) throw new SamError("timed_out", `SAM sent nothing for ${Math.round(idleMs / 1000)} s`);
    throw e;
  };
  async function* watched(body: ReadableStream<Uint8Array>) {
    for await (const chunk of body) {
      rearm();
      yield chunk;
    }
  }

  rearm();
  try {
    const res = await fetch(`${config.baseUrl}/responses`, {
      method: "POST",
      signal: abort.signal,
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: SAM_MODEL,
        input: [
          {
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_video", file_id: fileId },
            ],
          },
        ],
        stream: true,
        metadata: { include_confidence: "true" },
      }),
    }).catch(timedOut);
    if (!res.ok || !res.body) throw new SamError("request_failed", `SAM request failed with HTTP ${res.status}`);

    return await readSegmentation(serverSentEvents(watched(res.body))).catch(timedOut);
  } finally {
    clearTimeout(timer);
  }
}
