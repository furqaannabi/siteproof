import { expect, test } from "bun:test";
import { join } from "node:path";
import type { ExtractionRequest } from "./extraction";
import type { ExtractDeps, ExtractDocumentRecord, RoomRow } from "./extract-job";
import { extractDocumentJob } from "./extract-job";
import type { MuseSparkAnswer } from "./muse-spark";
import type { ParsedClaim } from "./parse-extraction";

// The real sample BOQ: real pdftotext, real page images. Only the paid and external
// parts are fakes: Muse Spark, R2 and the database.
const BOQ_PDF = join(import.meta.dir, "../../fixtures/documents/boq.pdf");

const ROOMS: RoomRow[] = [
  { id: "room_k", name: "Kitchen", flat_id: "flat_302", flat_name: "302" },
  { id: "room_b2", name: "Bedroom 2", flat_id: "flat_302", flat_name: "302" },
];

function doc(status: ExtractDocumentRecord["status"] = "uploaded"): ExtractDocumentRecord {
  return { id: "doc_1", project_id: "prj_1", flat_id: "flat_302", status, object_key: "siteproof/documents/abc.pdf" };
}

/** Muse Spark's answer for one line of the sample BOQ. */
const W4 = JSON.stringify({
  claims: [{ item: "window", qty: 4, unit: "nos", room: "Bedroom 2", source_quote: "W-4 UPVC openable window, 1200 x 1500 mm Bedroom 2 nos 4 9,500 38,000" }],
});

function fakes(record: ExtractDocumentRecord | null, answer: () => Promise<MuseSparkAnswer> = async () => ({ text: W4, usage: null })) {
  const log: string[] = [];
  let saved: ParsedClaim[] | null = null;
  let failedWith: string | null = null;
  const asked: ExtractionRequest[] = [];
  const deps: ExtractDeps = {
    store: {
      load: async () => record,
      projectRooms: async () => ROOMS,
      markProcessing: async () => void log.push("processing"),
      saveClaims: async (_id, claims) => {
        log.push("saved");
        saved = claims;
      },
      markFailed: async (_id, reason) => {
        log.push("failed");
        failedWith = reason;
      },
    },
    files: { get: async () => new Uint8Array(await Bun.file(BOQ_PDF).arrayBuffer()) },
    ask: async (request) => {
      asked.push(request);
      return answer();
    },
  };
  return { deps, log, asked, saved: () => saved, failedWith: () => failedWith };
}

const PAYLOAD = { document_id: "doc_1" };

test("a queued document is read, and its claims saved with the quote checked and the room placed", async () => {
  const f = fakes(doc());

  await extractDocumentJob(f.deps).run(PAYLOAD);

  expect(f.log).toEqual(["processing", "saved"]);
  expect(f.saved()).toEqual([
    {
      item: "window",
      qty: 4,
      unit: "nos",
      room_id: "room_b2",
      source_quote: "W-4 UPVC openable window, 1200 x 1500 mm Bedroom 2 nos 4 9,500 38,000",
      quote_verified: true,
    },
  ]);
  expect(f.asked[0]!.prompt).toContain('"Kitchen", "Bedroom 2"');
  expect(f.asked[0]!.pageImages).toHaveLength(1);
});

test("a document already done or failed is left alone: a job delivered twice costs nothing", async () => {
  for (const status of ["done", "failed"] as const) {
    const f = fakes(doc(status));
    await extractDocumentJob(f.deps).run(PAYLOAD);
    expect([status, f.log, f.asked.length]).toEqual([status, [], 0]);
  }
});

test("a job for a document that no longer exists does nothing", async () => {
  const f = fakes(null);

  await extractDocumentJob(f.deps).run(PAYLOAD);

  expect([f.log, f.asked.length]).toEqual([[], 0]);
});

// --- failures: what is retried, and what the builder reads when it is given up --------

import { MuseSparkError } from "./muse-spark";

const answer = (text: string) => async () => ({ text, usage: null });
const failing = (error: Error) => async (): Promise<MuseSparkAnswer> => Promise.reject(error);

test("each failure becomes a short code and whether a retry could help, as the ADR's table says", async () => {
  const cases: [string, Parameters<typeof fakes>[1], Partial<ExtractDeps>, string, boolean][] = [
    ["R2 unavailable", undefined, { files: { get: async () => Promise.reject(new Error("R2 timeout")) } }, "storage_unavailable", true],
    ["stored PDF unreadable", undefined, { files: { get: async () => new TextEncoder().encode("not a pdf") } }, "unreadable_pdf", false],
    ["Muse Spark 503", failing(new MuseSparkError("request_failed", "HTTP 503", 503)), {}, "reader_unavailable", true],
    ["Muse Spark 429", failing(new MuseSparkError("request_failed", "HTTP 429", 429)), {}, "reader_unavailable", true],
    ["Muse Spark unreachable", failing(new TypeError("fetch failed")), {}, "reader_unavailable", true],
    ["Muse Spark 400", failing(new MuseSparkError("request_failed", "HTTP 400", 400)), {}, "reader_rejected", false],
    ["answer cut off", failing(new MuseSparkError("incomplete", "cut off")), {}, "unusable_answer", true],
    ["answer refused", failing(new MuseSparkError("refused", "declined")), {}, "unusable_answer", true],
    ["answer not JSON", answer("I could not read this."), {}, "unusable_answer", true],
    ["no claims at all", answer('{"claims":[]}'), {}, "no_claims", true],
    ["every line rejected", answer('{"claims":[{"item":"tiling","qty":96,"unit":"sqm","room":null,"source_quote":"F-2"}]}'), {}, "no_claims", true],
  ];

  for (const [why, ask, override, code, retry] of cases) {
    const f = fakes(doc(), ask);
    const error = await extractDocumentJob({ ...f.deps, ...override }).run(PAYLOAD).catch((e) => e);
    expect([why, error?.name, error?.code, error?.retry]).toEqual([why, "JobError", code, retry]);
    expect([why, f.saved()]).toEqual([why, null]);
  }
});

test("a payload without a document id is not retried: it will never get one", async () => {
  const f = fakes(doc());

  const error = await extractDocumentJob(f.deps).run({ documentId: "doc_1" }).catch((e) => e);

  expect([error?.code, error?.retry]).toEqual(["bad_payload", false]);
});

test("some lines rejected is not a failure: the good claims are saved", async () => {
  const mixed = JSON.stringify({
    claims: [
      JSON.parse(W4).claims[0],
      { item: "tiling", qty: 96, unit: "sqm", room: null, source_quote: "F-2" },
    ],
  });
  const f = fakes(doc(), answer(mixed));

  await extractDocumentJob(f.deps).run(PAYLOAD);

  expect(f.saved()).toHaveLength(1);
});

test("giving up marks the document failed with a reason the builder can act on", async () => {
  const reasons: [string, string][] = [
    ["storage_unavailable", "We couldn't reach the document reader. Upload it again in a few minutes."],
    ["reader_unavailable", "We couldn't reach the document reader. Upload it again in a few minutes."],
    ["unexpected", "We couldn't reach the document reader. Upload it again in a few minutes."],
    ["unusable_answer", "We couldn't read this document's lines reliably. Upload it again, or send a clearer PDF."],
    ["no_claims", "We read this document but found no quantities in it. Check it's the right file."],
    ["reader_rejected", "This PDF could not be read. Upload it again."],
    ["unreadable_pdf", "This PDF could not be read. Upload it again."],
  ];

  for (const [code, reason] of reasons) {
    const f = fakes(doc("processing"));
    await extractDocumentJob(f.deps).giveUp(PAYLOAD, code);
    expect([code, f.failedWith()]).toEqual([code, reason]);
  }
});

test("giving up never overturns a document that finished, nor fails on a bad payload", async () => {
  const done = fakes(doc("done"));
  await extractDocumentJob(done.deps).giveUp(PAYLOAD, "unusable_answer");
  expect(done.log).toEqual([]);

  const bad = fakes(doc());
  await extractDocumentJob(bad.deps).giveUp("nonsense", "bad_payload");
  expect(bad.log).toEqual([]);
});

// --- which rooms the model is offered ------------------------------------------------

import { roomChoices } from "./extract-job";

const TWO_FLATS: RoomRow[] = [
  { id: "r302b2", name: "Bedroom 2", flat_id: "flat_302", flat_name: "302" },
  { id: "r302k", name: "Kitchen", flat_id: "flat_302", flat_name: "302" },
  { id: "r303b2", name: "Bedroom 2", flat_id: "flat_303", flat_name: "303" },
];

test("a document for one flat is offered only that flat's rooms, by their own names", () => {
  expect(roomChoices({ ...doc(), flat_id: "flat_303" }, TWO_FLATS)).toEqual([{ id: "r303b2", name: "Bedroom 2" }]);
});

test("a whole-project document in a project of one flat is offered plain names", () => {
  expect(roomChoices({ ...doc(), flat_id: null }, ROOMS)).toEqual([
    { id: "room_k", name: "Kitchen" },
    { id: "room_b2", name: "Bedroom 2" },
  ]);
});

test("a whole-project document across several flats is offered names qualified by flat, so no two match", () => {
  expect(roomChoices({ ...doc(), flat_id: null }, TWO_FLATS)).toEqual([
    { id: "r302b2", name: "302 / Bedroom 2", onLine: "Bedroom 2" },
    { id: "r302k", name: "302 / Kitchen", onLine: "Kitchen" },
    { id: "r303b2", name: "303 / Bedroom 2", onLine: "Bedroom 2" },
  ]);
});
