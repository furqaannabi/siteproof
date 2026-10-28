/**
 * The clip routes' store, backed by Postgres through Prisma. The client is imported
 * on first use, as in the other stores, so loading the app never needs a database.
 */
import type { ClipStore } from "./clips";

const FIELDS = { id: true, project_id: true, object_key: true, captured_at: true, status: true } as const;

export const prismaClipStore: ClipStore = {
  async projectExists(projectId) {
    const { db } = await import("../db");
    return (await db.project.count({ where: { id: projectId } })) > 0;
  },

  async findById(id) {
    const { db } = await import("../db");
    return db.clip.findUnique({ where: { id }, select: FIELDS });
  },

  async findByKey(objectKey) {
    const { db } = await import("../db");
    return db.clip.findUnique({ where: { object_key: objectKey }, select: FIELDS });
  },

  async createWithJob({ project_id, object_key }) {
    const { db } = await import("../db");
    const id = crypto.randomUUID();
    try {
      const [clip] = await db.$transaction([
        db.clip.create({ data: { id, project_id, object_key }, select: FIELDS }),
        // Ids only in the payload, never the object key: a job row is safe to log.
        db.job.create({ data: { kind: "ingest_clip", payload: { clip_id: id } } }),
      ]);
      return clip;
    } catch (e) {
      // Two completes at once: object_key is unique, so the second insert fails and
      // the clip the first one saved is the answer.
      const existing = await db.clip.findUnique({ where: { object_key }, select: FIELDS });
      if (existing) return existing;
      throw e;
    }
  },
};
