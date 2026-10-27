/**
 * The extract_document job's store, backed by Postgres through Prisma, and the job
 * wired to its real dependencies for the runner to call.
 *
 * The Prisma client is imported on first use, as in the route stores, so loading
 * this never needs a database.
 */
import { r2Files } from "../r2";
import { extractDocumentJob, type ExtractStore } from "./extract-job";
import { askMuseSpark, museSparkConfigFromEnv } from "./muse-spark";

export const prismaExtractStore: ExtractStore = {
  async load(id) {
    const { db } = await import("../db");
    return db.document.findUnique({
      where: { id },
      select: { id: true, project_id: true, flat_id: true, status: true, object_key: true },
    });
  },

  async projectRooms(projectId) {
    const { db } = await import("../db");
    const rooms = await db.room.findMany({
      where: { flat: { project_id: projectId } },
      select: { id: true, name: true, flat_id: true, flat: { select: { name: true } } },
      orderBy: [{ flat: { name: "asc" } }, { name: "asc" }],
    });
    return rooms.map((r) => ({ id: r.id, name: r.name, flat_id: r.flat_id, flat_name: r.flat.name }));
  },

  async markProcessing(id) {
    const { db } = await import("../db");
    await db.document.update({ where: { id }, data: { status: "processing" } });
  },

  async saveClaims(id, claims) {
    const { db } = await import("../db");
    // One transaction: a re-run replaces the claims instead of doubling them, and a
    // crash part-way leaves the document as it was.
    await db.$transaction([
      db.claim.deleteMany({ where: { doc_id: id } }),
      db.claim.createMany({ data: claims.map((c) => ({ doc_id: id, ...c })) }),
      db.document.update({ where: { id }, data: { status: "done" } }),
    ]);
  },

  async markFailed(id, _reason) {
    const { db } = await import("../db");
    // The reason is not stored yet: Document has no reason column until Furqaan adds
    // it. The status still tells the builder it failed.
    await db.document.update({ where: { id }, data: { status: "failed" } });
  },
};

/** The job with its real store, R2 and Muse Spark, for Furqaan's runner to call. */
export const extractDocument = extractDocumentJob({
  store: prismaExtractStore,
  files: r2Files,
  ask: (request) => askMuseSpark(request, museSparkConfigFromEnv()),
});
