/**
 * The document endpoints.
 *
 * `POST /documents` takes a PDF through the API, checks it on the way in, stores it
 * in R2, then registers it with its extraction job. `GET /documents/:id/status` is
 * what the upload UI polls to tell "still reading" from "done" from "failed".
 *
 * See docs/decisions/2026-10-27-documents-are-uploaded-through-the-api.md
 */
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Document, DocumentKind } from "@siteproof/contract";
import { api } from "@siteproof/contract";
import { DocumentError } from "../documents/read-pdf";

/**
 * A document as the database holds it: the contract's fields plus what stays
 * server-side.
 */
export interface DocumentRecord extends Document {
  /** The R2 object key. Never in a response, never logged, never shown. */
  object_key: string;
}

export interface NewDocument {
  project_id: string;
  flat_id: string | null;
  kind: DocumentKind;
  object_key: string;
}

export interface DocumentStore {
  findById(id: string): Promise<DocumentRecord | null>;
  /** The ids of a project's flats, or null when there is no such project. */
  flatIdsOf(projectId: string): Promise<string[] | null>;
  /** Inserts the document and its extract_document job in one transaction. */
  createWithJob(input: NewDocument): Promise<Document>;
}

export interface DocumentFiles {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
}

export interface DocumentRouteDeps {
  store: DocumentStore;
  files: DocumentFiles;
  /** Throws a DocumentError when the PDF has no readable text on some page. */
  checkReadable(bytes: Uint8Array): Promise<void>;
}

const MAX_BYTES = 20 * 1024 * 1024;

const fieldsSchema = z.object({
  project_id: z.string().min(1),
  kind: z.enum(["demand_letter", "invoice", "boq"]),
  flat_id: z.string().min(1).optional(),
  file: z.instanceof(File),
});

/** What a document must be attached to, in words a builder can act on. */
const NEEDS_A_FLAT: Partial<Record<DocumentKind, string>> = {
  demand_letter: "A demand letter bills one flat: choose the flat it is for.",
  invoice: "An invoice bills one flat: choose the flat it is for.",
};

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

const invalid = (message: string) => ({ error: "invalid", message });

export function documentRoutes({ store, files, checkReadable }: DocumentRouteDeps) {
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

  routes.post(
    api.createDocument(),
    // Capped before the body is read, so an oversized upload never sits in memory.
    // A little over 20 MB, for the form's own boundaries and field names.
    bodyLimit({
      maxSize: MAX_BYTES + 64 * 1024,
      onError: (c) => c.json({ error: "too_large", message: "The file is over 20 MB." }, 413),
    }),
    async (c) => {
      // Cheapest checks first; pdftotext, R2 and the database come last.
      const form = fieldsSchema.safeParse(await c.req.parseBody().catch(() => null));
      if (!form.success) return c.json(invalid("Send a PDF, its project, and whether it is a demand letter, an invoice or a BOQ."), 400);
      const { project_id, kind, file } = form.data;
      const flat_id = form.data.flat_id ?? null;

      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.byteLength > MAX_BYTES) return c.json({ error: "too_large", message: "The file is over 20 MB." }, 413);
      // By its contents, not its name: a renamed video is not a PDF.
      if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") return c.json(invalid("This file is not a PDF."), 400);

      const needsFlat = NEEDS_A_FLAT[kind];
      if (needsFlat && flat_id === null) return c.json(invalid(needsFlat), 400);

      const flats = await store.flatIdsOf(project_id);
      if (flats === null || (flat_id !== null && !flats.includes(flat_id))) return c.json({ error: "not_found" }, 404);

      try {
        await checkReadable(bytes);
      } catch (e) {
        if (e instanceof DocumentError) return c.json({ error: e.code, message: e.message }, 400);
        throw e;
      }

      // The file goes to R2 first and the rows second: a failed transaction leaves
      // a harmless private object, where the reverse would leave a job pointing at a
      // file that does not exist. The key is random and never leaves the server.
      const object_key = `siteproof/documents/${crypto.randomUUID().replaceAll("-", "")}.pdf`;
      await files.put(object_key, bytes, "application/pdf");
      const document = await store.createWithJob({ project_id, flat_id, kind, object_key });

      return c.json(document, 201);
    },
  );

  return routes;
}
