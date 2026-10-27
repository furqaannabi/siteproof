import { expect, test } from "bun:test";
import { verifyQuote } from "./quote-check";

// A BOQ line as `pdftotext -layout` renders it: columns padded out with spaces.
const BOQ = [
  "Item   Description                                      Unit   Qty",
  "3.1    Providing and fixing UPVC openable window,        nos    12",
  "       1200 x 1500 mm, including hardware and fixtures",
  "3.2    Providing and fixing flush door, 900 x 2100 mm    nos     8",
].join("\n");

test("a quote that is in the document verifies", () => {
  expect(verifyQuote(BOQ, "Providing and fixing flush door, 900 x 2100 mm")).toBe(true);
});

test("an empty quote never verifies: every document contains the empty string", () => {
  expect(verifyQuote(BOQ, "")).toBe(false);
});

test("a quote of only whitespace never verifies", () => {
  expect(verifyQuote(BOQ, "   \n  ")).toBe(false);
});

test("a quote that differs by one digit does not verify", () => {
  expect(verifyQuote(BOQ, "Providing and fixing flush door, 900 x 2100 mm    nos     3")).toBe(false);
});

test("a ligature in the document matches the plain letters in the quote", () => {
  const doc = "3.1    Providing and ﬁxing UPVC openable window    nos    12";

  expect(verifyQuote(doc, "Providing and fixing UPVC openable window")).toBe(true);
});

test("the column padding -layout leaves behind does not break a quote written with single spaces", () => {
  expect(verifyQuote(BOQ, "flush door, 900 x 2100 mm nos 8")).toBe(true);
});

test("a quote in a different case verifies", () => {
  expect(verifyQuote(BOQ, "PROVIDING AND FIXING FLUSH DOOR, 900 x 2100 mm")).toBe(true);
});

test("an en-dash in the document matches a hyphen in the quote", () => {
  const doc = "3.1    UPVC openable window, 1200–1500 mm    nos    12";

  expect(verifyQuote(doc, "UPVC openable window, 1200-1500 mm")).toBe(true);
});

test("a curly apostrophe in the document matches a straight one in the quote", () => {
  const doc = "As per the builder’s schedule of finishes";

  expect(verifyQuote(doc, "As per the builder's schedule of finishes")).toBe(true);
});

test("a non-breaking space in the document matches an ordinary space in the quote", () => {
  const doc = "Flush door    nos    8 nos supplied";

  expect(verifyQuote(doc, "8 nos supplied")).toBe(true);
});

test("a word broken by a hyphen across two lines matches the whole word in the quote", () => {
  const doc = "3.1    Providing and fixing UPVC openable win-\n       dow    nos    12";

  expect(verifyQuote(doc, "openable window")).toBe(true);
});
