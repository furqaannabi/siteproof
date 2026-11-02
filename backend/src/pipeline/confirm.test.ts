import { expect, test } from "bun:test";
import { bothSayYes, confirmRequest, readConfirmed } from "./confirm";

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
  expect(door.temperature).toBe(0);
  expect(door.responseSchema).toEqual({
    type: "object",
    properties: { answer: { type: "string", enum: ["yes", "no"] } },
    required: ["answer"],
    additionalProperties: false,
  });
});

test("an object is confirmed only when Muse Spark says yes twice, asked at the same time", async () => {
  // On 2 November the same outlined glass panel got a no, then an hour later a yes.
  const asker = (answers: boolean[]) => {
    let started = 0;
    let inFlight = 0;
    let most = 0;
    const ask = async () => {
      inFlight++;
      most = Math.max(most, inFlight);
      const answer = answers[started++]!;
      await Bun.sleep(5);
      inFlight--;
      return answer;
    };
    return { ask, most: () => most };
  };

  const both = asker([true, true]);
  expect(await bothSayYes(both.ask)).toBe(true);
  expect(both.most()).toBe(2);
  expect(await bothSayYes(asker([true, false]).ask)).toBe(false);
  expect(await bothSayYes(asker([false, true]).ask)).toBe(false);
  await expect(bothSayYes(async () => { throw new Error("unreachable"); })).rejects.toThrow("unreachable");
});
