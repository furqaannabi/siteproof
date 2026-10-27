import { expect, test } from "bun:test";
import type { DocumentRecord, DocumentStore } from "./documents";
import { documentRoutes } from "./documents";

const record: DocumentRecord = {
  id: "doc_4a91",
  project_id: "prj_11cc",
  flat_id: null,
  kind: "boq",
  status: "processing",
  // Server-side only. The ADR is explicit that where the file lives is never in the contract.
  object_key: "8f14e45fceea167a5a36dedd4bea2543",
};

function storeOf(...rows: DocumentRecord[]): DocumentStore {
  return { findById: async (id) => rows.find((r) => r.id === id) ?? null };
}

test("returns the document the contract describes", async () => {
  const res = await documentRoutes(storeOf(record)).request("/documents/doc_4a91/status");

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    id: "doc_4a91",
    project_id: "prj_11cc",
    flat_id: null,
    kind: "boq",
    status: "processing",
  });
});

test("the object key never reaches the response", async () => {
  const res = await documentRoutes(storeOf(record)).request("/documents/doc_4a91/status");

  const body = await res.json();
  expect(body).not.toHaveProperty("object_key");
  expect(JSON.stringify(body)).not.toContain("8f14e45f");
});

test("an id we do not have is 404, and says nothing about what else exists", async () => {
  const res = await documentRoutes(storeOf(record)).request("/documents/doc_guessed/status");

  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "not_found" });
});
