import { expect, test } from "bun:test";
import type { Document } from "@siteproof/contract";
import { DocumentError } from "../documents/read-pdf";
import type { DocumentRecord, DocumentRouteDeps } from "./documents";
import { documentRoutes } from "./documents";

const record: DocumentRecord = {
  id: "doc_4a91",
  project_id: "prj_11cc",
  flat_id: null,
  kind: "boq",
  status: "processing",
  reason: null,
  // Server-side only. The ADR is explicit that where the file lives is never in the contract.
  object_key: "8f14e45fceea167a5a36dedd4bea2543",
};

/** Fakes for every dependency, recording what the route did with them. */
function fakes(overrides: Partial<DocumentRouteDeps> = {}) {
  const stored: { key: string; type: string }[] = [];
  const registered: { project_id: string; flat_id: string | null; kind: string; object_key: string }[] = [];
  let checked = 0;
  const deps: DocumentRouteDeps = {
    store: {
      findById: async (id) => (id === record.id ? record : null),
      // Project prj_11cc has flat flat_302; anything else does not exist.
      flatIdsOf: async (projectId) => (projectId === "prj_11cc" ? ["flat_302"] : null),
      createWithJob: async (input): Promise<Document> => {
        registered.push(input);
        return { id: "doc_new", project_id: input.project_id, flat_id: input.flat_id, kind: input.kind, status: "uploaded", reason: null };
      },
    },
    files: { put: async (key, _bytes, type) => void stored.push({ key, type }) },
    checkReadable: async () => void checked++,
    ...overrides,
  };
  return { deps, stored, registered, checks: () => checked };
}

const PDF = new TextEncoder().encode("%PDF-1.4\n% a sample\n");

function upload(deps: DocumentRouteDeps, fields: Record<string, string>, file: Uint8Array | null = PDF) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  if (file) form.set("file", new File([file], "boq.pdf", { type: "application/pdf" }));
  return documentRoutes(deps).request("/documents", { method: "POST", body: form });
}

// --- GET /documents/:id/status -------------------------------------------------------

test("returns the document the contract describes", async () => {
  const res = await documentRoutes(fakes().deps).request("/documents/doc_4a91/status");

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ id: "doc_4a91", project_id: "prj_11cc", flat_id: null, kind: "boq", status: "processing", reason: null });
});

test("the object key never reaches the response", async () => {
  const res = await documentRoutes(fakes().deps).request("/documents/doc_4a91/status");

  const body = await res.json();
  expect(body).not.toHaveProperty("object_key");
  expect(JSON.stringify(body)).not.toContain("8f14e45f");
});

test("an id we do not have is 404, and says nothing about what else exists", async () => {
  const res = await documentRoutes(fakes().deps).request("/documents/doc_guessed/status");

  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "not_found" });
});

// --- POST /documents ------------------------------------------------------------------

test("a BOQ for the whole project is stored under a random key, then registered with its job", async () => {
  const { deps, stored, registered } = fakes();

  const res = await upload(deps, { project_id: "prj_11cc", kind: "boq" });

  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ id: "doc_new", project_id: "prj_11cc", flat_id: null, kind: "boq", status: "uploaded", reason: null });
  expect(stored).toHaveLength(1);
  expect(stored[0]!.key).toMatch(/^siteproof\/documents\/[0-9a-f]{32}\.pdf$/);
  expect(stored[0]!.type).toBe("application/pdf");
  expect(registered).toEqual([{ project_id: "prj_11cc", flat_id: null, kind: "boq", object_key: stored[0]!.key }]);
});

test("a demand letter for a flat of the project is accepted", async () => {
  const { deps, registered } = fakes();

  const res = await upload(deps, { project_id: "prj_11cc", kind: "demand_letter", flat_id: "flat_302" });

  expect(res.status).toBe(201);
  expect(registered[0]!.flat_id).toBe("flat_302");
});

test("a demand letter with no flat is refused, saying why: it bills one flat", async () => {
  const { deps, stored, registered } = fakes();

  const res = await upload(deps, { project_id: "prj_11cc", kind: "demand_letter" });

  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: "invalid", message: "A demand letter bills one flat: choose the flat it is for." });
  expect([stored.length, registered.length]).toEqual([0, 0]);
});

test("a flat from another project, or a project that does not exist, is a plain 404", async () => {
  const cases: Record<string, string>[] = [
    { project_id: "prj_11cc", kind: "invoice", flat_id: "flat_of_someone_else" },
    { project_id: "prj_guessed", kind: "boq" },
  ];
  for (const fields of cases) {
    const { deps, stored, registered } = fakes();
    const res = await upload(deps, fields);
    expect([res.status, await res.json()]).toEqual([404, { error: "not_found" }]);
    expect([stored.length, registered.length]).toEqual([0, 0]);
  }
});

test("a file that is not a PDF is refused by its contents, before anything reads it", async () => {
  const { deps, stored, checks } = fakes();
  const video = new TextEncoder().encode("\x00\x00\x00\x18ftypmp42 a phone video named boq.pdf");

  const res = await upload(deps, { project_id: "prj_11cc", kind: "boq" }, video);

  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: "invalid", message: "This file is not a PDF." });
  expect([stored.length, checks()]).toEqual([0, 0]);
});

test("a scan is refused at upload, in the gap-request voice, and nothing is stored", async () => {
  const scan = new DocumentError("scan", "This looks like a scan. Send a PDF with selectable text.");
  const { deps, stored, registered } = fakes({ checkReadable: async () => Promise.reject(scan) });

  const res = await upload(deps, { project_id: "prj_11cc", kind: "boq" });

  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: "scan", message: "This looks like a scan. Send a PDF with selectable text." });
  expect([stored.length, registered.length]).toEqual([0, 0]);
});

test("a file over 20 MB is refused before it is read", async () => {
  const { deps, stored, checks } = fakes();
  const big = new Uint8Array(21 * 1024 * 1024);
  big.set(PDF);

  const res = await upload(deps, { project_id: "prj_11cc", kind: "boq" }, big);

  expect(res.status).toBe(413);
  expect([stored.length, checks()]).toEqual([0, 0]);
});

test("a request missing the file or the kind, or with a kind we do not read, is refused", async () => {
  const cases: [Record<string, string>, Uint8Array | null][] = [
    [{ project_id: "prj_11cc", kind: "boq" }, null],
    [{ project_id: "prj_11cc" }, PDF],
    [{ project_id: "prj_11cc", kind: "receipt" }, PDF],
  ];
  for (const [fields, file] of cases) {
    const { deps, stored } = fakes();
    expect((await upload(deps, fields, file)).status).toBe(400);
    expect(stored).toHaveLength(0);
  }
});

test("if R2 refuses the file, nothing is registered: no document without its file", async () => {
  const { deps, registered } = fakes({ files: { put: async () => Promise.reject(new Error("R2 unavailable")) } });

  const routes = documentRoutes(deps);
  routes.onError((_e, c) => c.json({ error: "internal" }, 500));
  const form = new FormData();
  form.set("project_id", "prj_11cc");
  form.set("kind", "boq");
  form.set("file", new File([PDF], "boq.pdf"));
  const res = await routes.request("/documents", { method: "POST", body: form });

  expect(res.status).toBe(500);
  expect(registered).toHaveLength(0);
});
