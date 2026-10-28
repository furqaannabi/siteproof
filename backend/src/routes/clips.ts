/**
 * The clip endpoints. A clip uploads in two steps so it is never registered before
 * its video is in R2:
 *
 *   POST /clips            an upload link and a signed ticket; nothing is saved
 *   (the phone sends the video straight to R2)
 *   POST /clips/complete   checks the video arrived, then saves the clip and its job
 *   GET /clips/:id/status  what the upload screen polls
 *
 * See docs/decisions/2026-10-27-clips-upload-in-two-steps-with-a-signed-ticket.md
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Clip, ClipStatus, ClipUpload, ClipUploadRequest, CompleteClip } from "@siteproof/contract";
import { api } from "@siteproof/contract";
import { readTicket, signTicket } from "./upload-ticket";

/** A clip as the database holds it: the contract's fields, less the link, plus the key. */
export interface ClipRecord {
  id: string;
  project_id: string;
  /** The R2 object key. Never in a response except inside a presigned link. */
  object_key: string;
  captured_at: Date | null;
  status: ClipStatus;
}

export interface ClipStore {
  projectExists(projectId: string): Promise<boolean>;
  findById(id: string): Promise<ClipRecord | null>;
  findByKey(objectKey: string): Promise<ClipRecord | null>;
  /**
   * Inserts the clip and its ingest_clip job in one transaction. If the key is
   * already registered, returns that clip instead: a key never holds two clips.
   */
  createWithJob(input: { project_id: string; object_key: string }): Promise<ClipRecord>;
}

export interface ClipFiles {
  presignUpload(key: string, contentType: string, expiresInSeconds: number): string;
  presignRead(key: string, expiresInSeconds: number): string;
  /** The stored file's size in bytes, or null when nothing has arrived at that key. */
  sizeOf(key: string): Promise<number | null>;
  /** The stored file's first bytes, read with a ranged request rather than a download. */
  headOf(key: string, bytes: number): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}

export interface ClipRouteDeps {
  store: ClipStore;
  files: ClipFiles;
  ticketSecret(): string;
  now(): number;
}

// What phones and WhatsApp make, and what SAM accepts. The type goes into the link,
// but R2 does not enforce it (checked live: a WebM sent to an MP4 link was stored),
// so the file's own first bytes are what decide, at /clips/complete.
const VIDEO_TYPES = { "video/mp4": "mp4", "video/quicktime": "mov" } as const;

const LINK_SECONDS = 30 * 60;
// Outlives the link, so a slow upload that just made it can still be completed.
const TICKET_MS = 60 * 60 * 1000;
const READ_SECONDS = 15 * 60;
const MAX_BYTES = 250 * 1024 * 1024;

const UploadRequest = z.object({
  project_id: z.string().min(1),
  content_type: z.enum(Object.keys(VIDEO_TYPES) as [keyof typeof VIDEO_TYPES]),
}) satisfies z.ZodType<ClipUploadRequest>;
const CompleteRequest = z.object({ ticket: z.string() }) satisfies z.ZodType<CompleteClip>;

// MP4 and MOV share one container format: boxes, each a 4-byte size then a 4-byte
// type. A phone's file opens with "ftyp"; an older QuickTime file may open with one
// of the others. WebM, and anything else, does not.
const OPENING_BOXES = new Set(["ftyp", "moov", "mdat", "wide", "free", "skip"]);
const isMp4OrMov = (head: Uint8Array) =>
  head.byteLength >= 8 && OPENING_BOXES.has(new TextDecoder("latin1").decode(head.subarray(4, 8)));

export function clipRoutes({ store, files, ticketSecret, now }: ClipRouteDeps) {
  const routes = new Hono();

  /** The contract's Clip: named fields only, the key only inside a fresh viewing link. */
  const toContract = (clip: ClipRecord): Clip => ({
    id: clip.id,
    project_id: clip.project_id,
    url: files.presignRead(clip.object_key, READ_SECONDS),
    captured_at: clip.captured_at ? clip.captured_at.toISOString() : null,
    status: clip.status,
  });

  routes.post(api.createClip(), async (c) => {
    const request = UploadRequest.safeParse(await c.req.json().catch(() => null));
    if (!request.success) {
      return c.json({ error: "invalid", message: "Send an MP4 or MOV video, and the project it belongs to." }, 400);
    }
    const { project_id, content_type } = request.data;
    if (!(await store.projectExists(project_id))) return c.json({ error: "not_found" }, 404);

    const object_key = `siteproof/clips/${crypto.randomUUID().replaceAll("-", "")}.${VIDEO_TYPES[content_type]}`;
    const issued = now();
    const upload: ClipUpload = {
      upload_url: files.presignUpload(object_key, content_type, LINK_SECONDS),
      ticket: signTicket({ project_id, object_key, content_type, expires_at: issued + TICKET_MS }, ticketSecret()),
      expires_at: new Date(issued + LINK_SECONDS * 1000).toISOString(),
    };
    return c.json(upload);
  });

  routes.post(api.completeClip(), async (c) => {
    const request = CompleteRequest.safeParse(await c.req.json().catch(() => null));
    const ticket = readTicket(request.success ? request.data.ticket : "", ticketSecret(), now());
    if (!ticket.ok) {
      return ticket.reason === "expired"
        ? c.json({ error: "expired", message: "This upload took too long: upload the clip again." }, 400)
        : c.json({ error: "invalid", message: "This upload ticket is not valid: upload the clip again." }, 400);
    }
    const { project_id, object_key } = ticket.body;

    // A phone that lost the first reply asks again: same ticket, same clip.
    const existing = await store.findByKey(object_key);
    if (existing) return c.json(toContract(existing), 200);

    const size = await files.sizeOf(object_key);
    if (size === null) {
      return c.json({ error: "not_uploaded", message: "The clip hasn't finished uploading. Try again when it has." }, 400);
    }
    // An upload link cannot cap its own size, so the cap is enforced here.
    if (size > MAX_BYTES) {
      await files.remove(object_key);
      return c.json({ error: "too_large", message: "This clip is over 250 MB. Film at 1080p rather than 4K." }, 400);
    }
    // By its contents, not by the type it was sent as: the link does not enforce that.
    if (!isMp4OrMov(await files.headOf(object_key, 12))) {
      await files.remove(object_key);
      return c.json({ error: "not_a_video", message: "This isn't an MP4 or MOV video." }, 400);
    }

    return c.json(toContract(await store.createWithJob({ project_id, object_key })), 201);
  });

  routes.get(api.clipStatus(":id"), async (c) => {
    const id = c.req.param("id");
    const clip = id ? await store.findById(id) : null;
    if (!clip) return c.json({ error: "not_found" }, 404);
    return c.json(toContract(clip));
  });

  return routes;
}
