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
}

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
    readonly code: "upload_failed" | "request_failed" | "incomplete" | "unreadable",
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

  const res = await fetch(`${baseUrl}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new SamError("upload_failed", `clip upload failed with HTTP ${res.status}`);
  const parsed = UploadedFile.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new SamError("upload_failed", "clip upload returned no file id");
  return parsed.data.id;
}

/** Server-sent events, one parsed JSON object per `data:` block. */
async function* serverSentEvents(body: ReadableStream<Uint8Array>): AsyncIterable<{ readonly type: string }> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
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
  const fileId = await uploadClip(clip, config);

  const res = await fetch(`${config.baseUrl}/responses`, {
    method: "POST",
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
  });
  if (!res.ok || !res.body) throw new SamError("request_failed", `SAM request failed with HTTP ${res.status}`);

  return readSegmentation(serverSentEvents(res.body));
}
