import { expect, test } from "bun:test";
import { parseExtraction } from "./parse-extraction";

// A BOQ as `pdftotext -layout` renders it.
const BOQ = [
  "Item   Description                                      Unit   Qty",
  "3.1    Providing and fixing UPVC openable window,        nos    12",
  "       1200 x 1500 mm, including hardware and fixtures",
  "3.2    Providing and fixing flush door, 900 x 2100 mm    nos     8",
  "4.1    Internal plaster, 12 mm thick, two coats          sqm   240",
].join("\n");

const ROOMS = [
  { id: "room_7f3a", name: "Bedroom 2" },
  { id: "room_91bc", name: "Kitchen" },
];

const context = { documentText: BOQ, rooms: ROOMS };

test("a well-formed response becomes claims, with the quote checked against the document", () => {
  const raw = JSON.stringify({
    claims: [
      {
        item: "door",
        qty: 8,
        unit: "nos",
        room: "Bedroom 2",
        source_quote: "3.2    Providing and fixing flush door, 900 x 2100 mm    nos     8",
      },
    ],
  });

  const { claims, rejected } = parseExtraction(raw, context);

  expect(rejected).toEqual([]);
  expect(claims).toEqual([
    {
      item: "door",
      qty: 8,
      unit: "nos",
      room_id: "room_7f3a",
      source_quote: "3.2    Providing and fixing flush door, 900 x 2100 mm    nos     8",
      quote_verified: true,
    },
  ]);
});

function response(...claims: unknown[]) {
  return JSON.stringify({ claims });
}

const DOOR = {
  item: "door",
  qty: 8,
  unit: "nos",
  room: "Bedroom 2",
  source_quote: "3.2    Providing and fixing flush door, 900 x 2100 mm    nos     8",
};

test("output that is not JSON fails loudly: it never reads as a document with no claims", () => {
  expect(() => parseExtraction("I could not read this document.", context)).toThrow(
    expect.objectContaining({ code: "not_json" }),
  );
});

test("a response whose claims are not a list fails loudly", () => {
  expect(() => parseExtraction(JSON.stringify({ claims: "twelve windows" }), context)).toThrow(
    expect.objectContaining({ code: "wrong_shape" }),
  );
});

test("an item outside the vocabulary is rejected, never coerced to a countable one", () => {
  const { claims, rejected } = parseExtraction(response({ ...DOOR, item: "upvc window" }), context);

  expect(claims).toEqual([]);
  expect(rejected).toEqual([{ index: 0, reason: "unknown_item" }]);
});

test("a quantity written as a string is rejected, never read as a number", () => {
  const { claims, rejected } = parseExtraction(response({ ...DOOR, qty: "8" }), context);

  expect(claims).toEqual([]);
  expect(rejected).toEqual([{ index: 0, reason: "no_quantity" }]);
});

test("a line the model gave no quantity for is rejected, never counted as zero", () => {
  const { claims, rejected } = parseExtraction(response({ ...DOOR, qty: null }), context);

  expect(claims).toEqual([]);
  expect(rejected).toEqual([{ index: 0, reason: "no_quantity" }]);
});

test("an entry with no quote is rejected: a claim with nothing to verify is not a claim", () => {
  const { claims, rejected } = parseExtraction(response({ ...DOOR, source_quote: "" }), context);

  expect(claims).toEqual([]);
  expect(rejected).toEqual([{ index: 0, reason: "missing_quote" }]);
});

test("one bad entry does not discard the good ones, and its position is reported", () => {
  const { claims, rejected } = parseExtraction(response({ ...DOOR, item: "tiling" }, DOOR), context);

  expect(claims).toHaveLength(1);
  expect(rejected).toEqual([{ index: 0, reason: "unknown_item" }]);
});

test("a rejected entry reports only where and why, never the document text it came from", () => {
  const { rejected } = parseExtraction(response({ ...DOOR, item: "tiling" }), context);

  expect(Object.keys(rejected[0]!).sort()).toEqual(["index", "reason"]);
});

test("a quote that is not in the document is kept as a claim, unverified, never dropped", () => {
  const invented = { ...DOOR, source_quote: "Providing and fixing 20 flush doors, premium teak" };

  const { claims, rejected } = parseExtraction(response(invented), context);

  expect(rejected).toEqual([]);
  expect(claims[0]).toMatchObject({ quote_verified: false, qty: 8 });
});

test("a field the model added of its own accord is ignored, and the claim still stands", () => {
  const chatty = { ...DOOR, confidence: 0.9, note: "I am fairly sure about this one" };

  const { claims } = parseExtraction(response(chatty), context);

  expect(claims).toHaveLength(1);
  expect(claims[0]).not.toHaveProperty("confidence");
});

test("a room the project does not have leaves the claim unplaced rather than wrong", () => {
  const { claims } = parseExtraction(response({ ...DOOR, room: "Servant Quarters" }), context);

  expect(claims[0]!.room_id).toBeNull();
  expect(claims[0]!.qty).toBe(8);
});

test("a line that names no room is unplaced", () => {
  const { claims } = parseExtraction(response({ ...DOOR, room: null }), context);

  expect(claims[0]!.room_id).toBeNull();
});

test("a room name the model recased or padded still resolves", () => {
  const { claims } = parseExtraction(response({ ...DOOR, room: " bedroom 2 " }), context);

  expect(claims[0]!.room_id).toBe("room_7f3a");
});

test("two rooms sharing a name leave the claim unplaced: a guess would attach evidence to the wrong room", () => {
  const ambiguous = [
    { id: "room_301b", name: "Bedroom 2" },
    { id: "room_302b", name: "Bedroom 2" },
  ];

  const { claims } = parseExtraction(response(DOOR), { documentText: BOQ, rooms: ambiguous });

  expect(claims[0]!.room_id).toBeNull();
});

test("an empty unit is rejected and named as a unit problem, not lost in bad_shape", () => {
  const { claims, rejected } = parseExtraction(response({ ...DOOR, unit: "" }), context);

  expect(claims).toEqual([]);
  expect(rejected).toEqual([{ index: 0, reason: "no_unit" }]);
});

// The two entries exactly as Muse Spark returned them for the sample demand letter
// on 27 October. The letter states no unit, so the model rightly says null.
const LETTER = [
  "We are pleased to inform you that the following works in Flat 302 have been completed:",
  "        Windows complete: 12",
  "        Doors complete: 5",
].join("\n");
const LETTER_ANSWER = response(
  { item: "window", qty: 12, unit: null, room: null, source_quote: "Windows complete: 12" },
  { item: "door", qty: 5, unit: null, room: null, source_quote: "Doors complete: 5" },
);

// Regression: these were rejected as no_unit until Claim.unit became nullable
// (283213a), and the demand letter's headline claims never reached the engine.
test("a demand letter's counts with no unit become claims, not rejected lines", () => {
  const { claims, rejected } = parseExtraction(LETTER_ANSWER, { documentText: LETTER, rooms: ROOMS });

  expect(rejected).toEqual([]);
  expect(claims.map((c) => [c.item, c.qty, c.unit, c.quote_verified])).toEqual([
    ["window", 12, null, true],
    ["door", 5, null, true],
  ]);
});
