/**
 * The documents route's store, backed by Postgres through Prisma.
 *
 * The Prisma client is imported on first use, not when this module loads: `db.ts`
 * refuses to load without DATABASE_URL, and `app.ts` mounts this route, so a plain
 * import would make every test of the app need a database.
 */
import type { DocumentStore } from "./documents";

export const prismaDocumentStore: DocumentStore = {
  async findById(id) {
    const { db } = await import("../db");
    // Prisma's enums are the contract's own values, so the row is the record as is.
    return db.document.findUnique({
      where: { id },
      select: { id: true, project_id: true, flat_id: true, kind: true, status: true, object_key: true },
    });
  },
};
