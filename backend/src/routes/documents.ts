/**
 * The document endpoints.
 *
 * `GET /documents/:id/status` is what the upload UI polls to tell "still reading"
 * from "done" from "failed", the same way `clipStatus` serves clips.
 *
 * The route is built over a store rather than Prisma directly: `prisma/schema.prisma`
 * has no `Document` model yet, and the schema is Furqaan's. Everything here is
 * finished and tested against a fake; wiring it to Prisma is one small change once
 * his model lands.
 */
import { Hono } from "hono";
import type { Document } from "@siteproof/contract";
import { api } from "@siteproof/contract";

/**
 * A document as the database holds it: the contract's fields plus what stays
 * server-side.
 */
export interface DocumentRecord extends Document {
  /** The R2 object key. Never in a response, never logged, never shown. */
  object_key: string;
}

export interface DocumentStore {
  findById(id: string): Promise<DocumentRecord | null>;
}

/**
 * Only the contract's fields, listed one by one.
 *
 * Spreading the row and deleting what should not go out puts the burden on whoever
 * adds the next column; naming the fields means a new one is private until someone
 * decides otherwise.
 */
function toContract(record: DocumentRecord): Document {
  return {
    id: record.id,
    project_id: record.project_id,
    flat_id: record.flat_id,
    kind: record.kind,
    status: record.status,
  };
}

export function documentRoutes(store: DocumentStore) {
  const routes = new Hono();

  // The path comes from the contract rather than a literal, so a route cannot drift
  // from what the frontend calls. The cost is that Hono can no longer infer the
  // param's type from the path, hence the check below.
  routes.get(api.documentStatus(":id"), async (c) => {
    const id = c.req.param("id");
    const record = id ? await store.findById(id) : null;
    // 404 rather than 403, and nothing about what does exist: an id is a guess, and
    // the answer should not tell the guesser whether they were close.
    if (!record) return c.json({ error: "not_found" }, 404);

    return c.json(toContract(record));
  });

  return routes;
}
