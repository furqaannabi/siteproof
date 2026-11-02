import { expect, test } from "bun:test";
import { confirmRequest, readConfirmed } from "./confirm";

test("only a clear yes in the agreed shape confirms an object; anything else leaves it unconfirmed", () => {
  expect(readConfirmed('{"answer": "yes"}')).toBe(true);

  for (const notYes of ['{"answer": "no"}', '{"answer": "Yes, probably"}', '{"answer": "YES"}', '{"answer": true}', '{"confirmed": "yes"}', '{"answer": "yes", "note": "a frame only"}', "yes", "", "not sure"]) {
    expect(readConfirmed(notYes)).toBe(false);
  }
});

test("the question is fixed in code for each item, with the one outlined frame and nothing else", () => {
  const door = confirmRequest("door", "/tmp/outlined.jpg");
  const window = confirmRequest("window", "/tmp/outlined.jpg");

  expect(door.prompt).toContain("Is the outlined object a door leaf hung in its frame?");
  expect(window.prompt).toContain("Is the outlined object a fitted window, a frame with glass installed in the wall?");
  expect(door.pageImages).toEqual(["/tmp/outlined.jpg"]);
  expect(door.responseSchema).toEqual({
    type: "object",
    properties: { answer: { type: "string", enum: ["yes", "no"] } },
    required: ["answer"],
    additionalProperties: false,
  });
});
