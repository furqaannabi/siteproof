/**
 * The ingest_clip job's store, backed by Postgres through Prisma, and the job wired
 * to R2 and SAM 3.1 for the runner. The Prisma client is imported on first use, as in
 * the route stores.
 */
import { r2Files } from "../r2";
import { ingestClipJob, type IngestStore } from "./ingest-job";
import { askMuseSpark, MuseSparkError, museSparkConfigFromEnv } from "../documents/muse-spark";
import { crossCheckRequest, readCount } from "./cross-check";
import { samConfigFromEnv, segmentClip } from "./sam";

/**
 * A capture time from the file's metadata as a Date, or null. Phones write offsets
 * like "+0530", which Date does not read; never replaced with the upload time.
 */
export function captureTime(raw: string | null): Date | null {
  if (!raw) return null;
  const date = new Date(raw.trim().replace(/([+-]\d\d)(\d\d)$/, "$1:$2"));
  return Number.isNaN(date.getTime()) ? null : date;
}

export const prismaIngestStore: IngestStore = {
  async load(id) {
    const { db } = await import("../db");
    return db.clip.findUnique({ where: { id }, select: { id: true, project_id: true, object_key: true, status: true } });
  },

  async roomsByTag(projectId) {
    const { db } = await import("../db");
    const rooms = await db.room.findMany({ where: { flat: { project_id: projectId } }, select: { id: true, qr_code: true } });
    return new Map(rooms.map((r) => [r.qr_code, r.id]));
  },

  async markProcessing(id) {
    const { db } = await import("../db");
    await db.clip.update({ where: { id }, data: { status: "processing" } });
  },

  async save(id, { captured_at, segments, detections, crossChecks }) {
    const { db } = await import("../db");
    // One transaction: a re-run replaces what an earlier attempt saved, and a crash
    // part-way leaves the clip as it was.
    await db.$transaction([
      db.segment.deleteMany({ where: { clip_id: id } }),
      db.detection.deleteMany({ where: { clip_id: id } }),
      db.crossCheck.deleteMany({ where: { clip_id: id } }),
      db.segment.createMany({ data: segments.map((s) => ({ clip_id: id, ...s })) }),
      db.detection.createMany({ data: detections.map((d) => ({ clip_id: id, ...d })) }),
      db.crossCheck.createMany({ data: crossChecks.map((c) => ({ clip_id: id, ...c })) }),
      db.clip.update({ where: { id }, data: { status: "done", captured_at: captureTime(captured_at) } }),
    ]);
  },

  async markFailed(id) {
    const { db } = await import("../db");
    await db.clip.update({ where: { id }, data: { status: "failed" } });
  },
};

/** The job with its real store, R2 and SAM 3.1, for the runner. */
export const ingestClip = ingestClipJob({
  store: prismaIngestStore,
  files: r2Files,
  segment: (path, prompt) => segmentClip(path, prompt, samConfigFromEnv()),
  count: async (item, framePaths) => {
    try {
      const answer = await askMuseSpark(crossCheckRequest(item, framePaths), museSparkConfigFromEnv());
      return readCount(answer.text);
    } catch (e) {
      // A refusal, a cut-off or an empty answer is no count: the room stays Not seen
      // yet. Only failing to reach Muse Spark is worth a retry.
      if (e instanceof MuseSparkError && e.code !== "request_failed") return null;
      throw e;
    }
  },
});
