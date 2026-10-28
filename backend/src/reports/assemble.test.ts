import { expect, test } from "bun:test";
import type { Claim, Document } from "@siteproof/contract";
import { assembleReport, type ReportRows } from "./assemble";

const doc = (id: string, flat_id: string | null, kind: Document["kind"]): Document => ({
  id,
  project_id: "prj",
  flat_id,
  kind,
  status: "done",
  reason: null,
});

const claim = (id: string, doc_id: string, room_id: string | null, item: Claim["item"] = "window"): Claim => ({
  id,
  doc_id,
  item,
  qty: 2,
  unit: "nos",
  room_id,
  source_quote: `line ${id}`,
  quote_verified: true,
});

/** Flat 302 (rooms k302, b302) and its neighbour Flat 303 (room k303), one project. */
function rows(overrides: Partial<ReportRows> = {}): ReportRows {
  return {
    project: { id: "prj", name: "Northfield", builder: "Acme" },
    flat: { id: "f302", name: "302" },
    rooms: [
      { id: "k302", flat: "f302", name: "Kitchen", qr_code: "SPAAAAAAAA" },
      { id: "b302", flat: "f302", name: "Bedroom 2", qr_code: "SPBBBBBBBB" },
    ],
    documents: [doc("dl302", "f302", "demand_letter"), doc("dl303", "f303", "demand_letter"), doc("boq", null, "boq")],
    claims: [
      claim("c1", "dl302", "k302"),
      claim("c2", "dl302", null),
      claim("c3", "dl303", "k303"),
      claim("c4", "boq", "b302"),
      claim("c5", "boq", "k303"),
      claim("c6", "boq", null),
    ],
    results: [],
    detections: [],
    segments: [],
    gap_requests: [],
    ...overrides,
  };
}

const presign = (key: string) => `https://r2.example/${key}?signed`;

test("a flat's report holds its own documents and the BOQ, never another flat's demand letter", () => {
  const report = assembleReport(rows(), presign);

  expect(report.documents.map((d) => d.id)).toEqual(["dl302", "boq"]);
});

test("claims are this flat's: in its rooms, or unplaced on its own documents; never a neighbour's", () => {
  const report = assembleReport(rows(), presign);

  // c3 bills Flat 303; c5 is the BOQ's line for Flat 303's kitchen; c6 is a BOQ line
  // with no room, which nothing ties to this flat.
  expect(report.claims.map((c) => c.id)).toEqual(["c1", "c2", "c4"]);
});

test("results are only this flat's claims', with evidence as fresh links; a claim that can't be counted says so", () => {
  const result = (claim_id: string) => ({
    claim_id,
    counted: 2,
    outcome: "verified" as const,
    room_covered: true,
    evidence_keys: [`frames/${claim_id}.jpg`],
    note: null,
  });
  const report = assembleReport(
    rows({
      claims: [...rows().claims, claim("c7", "dl302", "k302", "not_countable")],
      results: [result("c1"), result("c3")],
    }),
    presign,
  );

  expect(report.results).toEqual([
    { claim_id: "c1", counted: 2, outcome: "verified", room_covered: true, evidence: ["https://r2.example/frames/c1.jpg?signed"] },
  ]);
  expect(report.not_checked).toEqual([{ claim_id: "c7", reason: "not_countable" }]);
});

test("detections, segments and gap requests are only this flat's rooms', and frames and masks are fresh links", () => {
  const detection = (room_id: string) => ({
    clip_id: "clip1",
    room_id,
    item: "window" as const,
    track_id: "0",
    best_frame_key: `frames/${room_id}.jpg`,
    mask_key: `masks/${room_id}.png`,
  });
  const segment = (room_id: string | null) => ({
    clip_id: "clip1",
    room_id,
    t_start: 0,
    t_end: 9,
    full_sweep: true,
    captured_at: "2026-10-28T09:00:00.000Z",
  });
  const gap = (room_id: string) => ({ id: `g-${room_id}`, room_id, text: "Need 5 s", steps: [], status: "open" as const });

  const report = assembleReport(
    rows({
      detections: [detection("k302"), detection("k303")],
      segments: [segment("k302"), segment("k303"), segment(null)],
      gap_requests: [gap("b302"), gap("k303")],
    }),
    presign,
  );

  expect(report.detections).toEqual([
    {
      clip_id: "clip1",
      room_id: "k302",
      item: "window",
      track_id: "0",
      best_frame_url: "https://r2.example/frames/k302.jpg?signed",
      mask_url: "https://r2.example/masks/k302.png?signed",
    },
  ]);
  // The unplaced segment is no flat's: it is in the builder's overview, never a report.
  expect(report.segments.map((s) => s.room_id)).toEqual(["k302"]);
  expect(report.gap_requests.map((g) => g.id)).toEqual(["g-b302"]);
});
