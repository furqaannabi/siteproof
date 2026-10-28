import { expect, test } from "bun:test";
import { fixedSteps, parseSteps, writeSteps } from "./steps";

const answer = (text: string, status = "completed") =>
  Response.json({ status, output: [{ type: "message", content: [{ type: "output_text", text }] }] });

const config = (reply: () => Promise<Response> | Response) => ({ apiKey: "k", baseUrl: "https://meta.test/v1", fetch: (async () => reply()) as unknown as typeof fetch });

const GOOD = JSON.stringify({ steps: ["Stand in the kitchen doorway with the tag in view.", "Turn slowly one way across the room.", "Stop. Don't pan back."] });

test("steps that hold to the rules are used as written", async () => {
  expect(await writeSteps("Kitchen", config(() => answer(GOOD)))).toEqual(JSON.parse(GOOD).steps);
});

test("a step with a digit in it is refused: numbers come from code or not at all", () => {
  expect(parseSteps(JSON.stringify({ steps: ["Film the 3 windows.", "Stop."] }))).toBeNull();
});

test("too few, too many, too long or not JSON is refused", () => {
  expect(parseSteps(JSON.stringify({ steps: ["Just one step."] }))).toBeNull();
  expect(parseSteps(JSON.stringify({ steps: ["a", "b", "c", "d", "e"] }))).toBeNull();
  expect(parseSteps(JSON.stringify({ steps: ["x".repeat(141), "Stop."] }))).toBeNull();
  expect(parseSteps("Sure! Here are the steps:")).toBeNull();
});

test("every way the call fails ends in the fixed steps, never an error", async () => {
  const fixed = fixedSteps("Kitchen");
  expect(await writeSteps("Kitchen", null)).toEqual(fixed);
  expect(await writeSteps("Kitchen", config(() => new Response("busy", { status: 503 })))).toEqual(fixed);
  expect(await writeSteps("Kitchen", config(() => answer(GOOD, "incomplete")))).toEqual(fixed);
  expect(await writeSteps("Kitchen", config(() => answer("not json")))).toEqual(fixed);
  expect(await writeSteps("Kitchen", config(() => Promise.reject(new Error("unreachable"))))).toEqual(fixed);
});

test("the fixed steps name the room and carry no digits", () => {
  const steps = fixedSteps("Bedroom 2");
  expect(steps[0]).toContain("bedroom 2's room tag");
  // The room's own name may have a digit; the steps around it never add one.
  expect(steps.slice(1).some((s) => /\d/.test(s))).toBe(false);
});
