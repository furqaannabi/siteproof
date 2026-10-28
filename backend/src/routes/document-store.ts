/**
 * The documents route's store, backed by Postgres through Prisma.
 *
 * The Prisma client is imported on first use, not when this module loads: `db.ts`
 * refuses to load without DATABASE_URL, and `app.ts` mounts this route, so a plain
 * import would make every test of the app need a database.
 */
import type { DocumentStore } from "./documents";

const CONTRACT_FIELDS = { id: true, project_id: true, flat_id: true, kind: true, status: true, reason: true } as const;

export const prismaDocumentStore: DocumentStore = {
  async findById(id) {
    const { db } = await import("../db");
    // Prisma's enums are the contract's own values, so the row is the record as is.
    return db.document.findUnique({ where: { id }, select: { ...CONTRACT_FIELDS, object_key: true } });
  },

  async flatIdsOf(projectId) {
    const { db } = await import("../db");
    const project = await db.project.findUnique({ where: { id: projectId }, select: { flats: { select: { id: true } } } });
    return project ? project.flats.map((f) => f.id) : null;
  },

  async createWithJob(input) {
    const { db } = await import("../db");
    // The id is made here so the job can name the document in the same transaction:
    // a document never exists without its job, nor a job without its document.
    const id = crypto.randomUUID();
    const [document] = await db.$transaction([
      db.document.create({ data: { id, ...input }, select: CONTRACT_FIELDS }),
      // Ids only in the payload, never the object key: a job row is safe to log.
      db.job.create({ data: { kind: "extract_document", payload: { document_id: id } } }),
    ]);
    return document;
  },
};
