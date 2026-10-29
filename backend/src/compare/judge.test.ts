import { expect, test } from "bun:test";
import type { Claim } from "@siteproof/contract";
import { judge, type JudgeInput } from "./judge";

const claim = (id: string, room_id: string | null, qty: number, doc_id = "letter", item: Claim["item"] = "window"): Claim => ({
  id,
  doc_id,
  item,
  qty,
  unit: null,
  room_id,
  source_quote: `line ${id}`,
  quote_verified: true,
});

const seen = (clip_id: string, room_id: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ clip_id, room_id, item: "window" as const, best_frame_key: `${clip_id}/${room_id}/${i}.jpg` }));

/** Bedroom 2 swept once from its tag by clip c1. */
function input(overrides: Partial<JudgeInput> = {}): JudgeInput {
  return {
    rooms: [{ id: "bed2" }, { id: "kitchen" }],
    documents: [
      { id: "letter", kind: "demand_letter" },
      { id: "boq", kind: "boq" },
    ],
    claims: [claim("c", "bed2", 2)],
    segments: [{ clip_id: "c1", room_id: "bed2", full_sweep: true }],
    detections: seen("c1", "bed2", 2),
    crossChecks: [{ clip_id: "c1", room_id: "bed2", item: "window", count: 2 }],
    ...overrides,
  };
}

test("a covered room whose count meets the claim, with the cross-check agreeing, is Verified, with its frames", () => {
  const { results } = judge(input());

  expect(results).toEqual([
    {
      claim_id: "c",
      room_id: "bed2",
      expected: 2,
      counted: 2,
      outcome: "verified",
      room_covered: true,
      evidence_keys: ["c1/bed2/0.jpg", "c1/bed2/1.jpg"],
    },
  ]);
});

test("a covered room counting fewer than claimed, with the cross-check agreeing, is Short", () => {
  const { results } = judge(
    input({ detections: seen("c1", "bed2", 1), crossChecks: [{ clip_id: "c1", room_id: "bed2", item: "window", count: 1 }] }),
  );

  expect(results.map(({ outcome, expected, counted }) => ({ outcome, expected, counted }))).toEqual([
    { outcome: "short", expected: 2, counted: 1 },
  ]);
});

test("Short never appears for a room that isn't fully covered: a pan, or no footage, is Not seen yet", () => {
  const panned = judge(
    input({
      segments: [{ clip_id: "c1", room_id: "bed2", full_sweep: false }],
      detections: seen("c1", "bed2", 1),
      crossChecks: [{ clip_id: "c1", room_id: "bed2", item: "window", count: 1 }],
    }),
  );
  const unfilmed = judge(input({ segments: [], detections: [], crossChecks: [] }));

  expect(panned.results.map(({ outcome, room_covered }) => ({ outcome, room_covered }))).toEqual([
    { outcome: "not_seen", room_covered: false },
  ]);
  expect(unfilmed.results.map(({ outcome, counted }) => ({ outcome, counted }))).toEqual([{ outcome: "not_seen", counted: 0 }]);
});

test("when the cross-check disagrees, or never ran, the room stays Not seen yet: for Verified and for Short", () => {
  const outcome = (detections: number, check: number | null) =>
    judge(
      input({
        detections: seen("c1", "bed2", detections),
        crossChecks: check === null ? [] : [{ clip_id: "c1", room_id: "bed2", item: "window", count: check }],
      }),
    ).results[0]!.outcome;

  expect(outcome(2, 3)).toBe("not_seen"); // would be Verified
  expect(outcome(1, 2)).toBe("not_seen"); // would be Short
  expect(outcome(2, null)).toBe("not_seen");
  expect(outcome(1, null)).toBe("not_seen");
});

test("across clips, the highest count from any single clip decides: never a sum", () => {
  const { results } = judge(
    input({
      claims: [claim("c", "bed2", 3)],
      segments: [
        { clip_id: "c1", room_id: "bed2", full_sweep: true },
        { clip_id: "c2", room_id: "bed2", full_sweep: true },
      ],
      detections: [...seen("c1", "bed2", 2), ...seen("c2", "bed2", 3)],
      crossChecks: [
        { clip_id: "c1", room_id: "bed2", item: "window", count: 2 },
        { clip_id: "c2", room_id: "bed2", item: "window", count: 3 },
      ],
    }),
  );

  expect(results.map(({ outcome, counted, evidence_keys }) => ({ outcome, counted, frames: evidence_keys.length }))).toEqual([
    { outcome: "verified", counted: 3, frames: 3 },
  ]);
});

test("plastering is not countable, a BOQ line is the plan, and a claim beyond the plan goes to a person", () => {
  const { results, not_checked } = judge(
    input({
      claims: [
        claim("plaster", "bed2", 40, "letter", "not_countable"),
        claim("plan_bed2", "bed2", 2, "boq"),
        claim("too_many", "bed2", 5),
      ],
    }),
  );

  expect(results).toEqual([]);
  expect(not_checked).toEqual([
    { claim_id: "plaster", reason: "not_countable" },
    { claim_id: "plan_bed2", reason: "plan" },
    { claim_id: "too_many", reason: "exceeds_plan" },
  ]);
});

test("a whole-flat claim is judged room by room against the BOQ's quantity for each room", () => {
  // "Windows complete: 12"; the BOQ plans Bedroom 2: 4, Kitchen: 3, Bedroom 1: 5.
  const check = (clip_id: string, room_id: string, count: number) => ({ clip_id, room_id, item: "window" as const, count });
  const { results } = judge(
    input({
      rooms: [{ id: "bed2" }, { id: "kitchen" }, { id: "bed1" }],
      claims: [
        claim("windows", null, 12),
        claim("p1", "bed2", 4, "boq"),
        claim("p2", "kitchen", 3, "boq"),
        claim("p3", "bed1", 5, "boq"),
      ],
      segments: [
        { clip_id: "c1", room_id: "bed2", full_sweep: true },
        { clip_id: "c2", room_id: "bed1", full_sweep: true },
      ],
      detections: [...seen("c1", "bed2", 2), ...seen("c2", "bed1", 5)],
      crossChecks: [check("c1", "bed2", 2), check("c2", "bed1", 5)],
    }),
  );

  expect(results.map(({ claim_id, room_id, expected, counted, outcome }) => ({ claim_id, room_id, expected, counted, outcome }))).toEqual([
    { claim_id: "windows", room_id: "bed2", expected: 4, counted: 2, outcome: "short" },
    { claim_id: "windows", room_id: "kitchen", expected: 3, counted: 0, outcome: "not_seen" },
    { claim_id: "windows", room_id: "bed1", expected: 5, counted: 5, outcome: "verified" },
  ]);
});

test("a whole-flat claim beyond the flat's plan goes to a person; with no per-room plan, the flat's total is judged", () => {
  const check = (clip_id: string, room_id: string, count: number) => ({ clip_id, room_id, item: "window" as const, count });
  const sweeps = [
    { clip_id: "c1", room_id: "bed2", full_sweep: true },
    { clip_id: "c2", room_id: "kitchen", full_sweep: true },
  ];
  const counts = { detections: [...seen("c1", "bed2", 2), ...seen("c2", "kitchen", 1)], crossChecks: [check("c1", "bed2", 2), check("c2", "kitchen", 1)] };

  const beyond = judge(input({ claims: [claim("w", null, 9), claim("p", "bed2", 4, "boq"), claim("q", "kitchen", 3, "boq")], segments: sweeps, ...counts }));
  expect(beyond.not_checked).toContainEqual({ claim_id: "w", reason: "exceeds_plan" });

  // BOQ silent: the flat's total, 3, is judged. Both rooms swept: Short is allowed.
  const silent = judge(input({ claims: [claim("w", null, 4)], segments: sweeps, ...counts }));
  expect(silent.results.map(({ room_id, expected, counted, outcome }) => ({ room_id, expected, counted, outcome }))).toEqual([
    { room_id: null, expected: 4, counted: 3, outcome: "short" },
  ]);

  // The kitchen never swept: the flat isn't fully covered, so never Short.
  const halfSwept = judge(input({ claims: [claim("w", null, 4)], segments: [sweeps[0]!], detections: seen("c1", "bed2", 2), crossChecks: [check("c1", "bed2", 2)] }));
  expect(halfSwept.results.map((r) => r.outcome)).toEqual(["not_seen"]);
});
