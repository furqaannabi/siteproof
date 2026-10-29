import { expect, test } from "bun:test";
import { framesOfRoom, readCount } from "./cross-check";

test("Muse Spark's count is read only from a whole number in the agreed shape; anything else is no count, never zero", () => {
  expect(readCount('{"count": 3}')).toBe(3);
  expect(readCount('{"count": 0}')).toBe(0);

  for (const unusable of ['{"count": 2.5}', '{"count": -1}', '{"count": "3"}', '{"windows": 3}', "three", "", '{"count": 3} and maybe one more']) {
    expect(readCount(unusable)).toBeNull();
  }
});

test("only frames from the room's own stretch of the clip are sent, at most twelve, spread evenly", () => {
  const frames = Array.from({ length: 60 }, (_, i) => ({ path: `f${i}.jpg`, t: i / 2 }));
  const kitchen = [{ t_start: 2, t_end: 4 }, { t_start: 20, t_end: 30 }];

  const sent = framesOfRoom(frames, kitchen);

  expect(sent.length).toBe(12);
  expect(sent.every((f) => (f.t >= 2 && f.t < 4) || (f.t >= 20 && f.t < 30))).toBe(true);
  expect(sent[0]!.t).toBe(2);
  expect(sent.at(-1)!.t).toBe(29.5);
  expect(framesOfRoom(frames, [{ t_start: 2, t_end: 4 }]).map((f) => f.t)).toEqual([2, 2.5, 3, 3.5]);
});
