import { expect, test } from "bun:test";
import { countObjects } from "./count";
import type { TrackedObject } from "./sam";

const FPS = 24;

/** A track seen on every frame of each [first, last] range. */
function track(track_id: string, ...ranges: [number, number][]): TrackedObject {
  const sightings = ranges.flatMap(([first, last]) =>
    Array.from({ length: last - first + 1 }, (_, i) => ({
      frame: first + i,
      box: { left: 0, top: 0, right: 10, bottom: 10 },
      confidence: 0.9,
    })),
  );
  return { track_id, sightings };
}

const sweep = { t_start: 0, t_end: 10, full_sweep: true };

test("in a one-way sweep, one id seen in two runs far apart is two objects", () => {
  // The 28 October finding: SAM gave the first and third windows of a room one id.
  const objects = [track("0", [0, 62], [140, 238]), track("1", [77, 174])];

  expect(countObjects(objects, sweep, FPS).count).toBe(3);
});

test("in a one-way sweep, a dropout shorter than a second is still one object", () => {
  // Blur, or a worker walking past, for half a second.
  expect(countObjects([track("0", [0, 50], [62, 120])], sweep, FPS).count).toBe(1);
});

test("outside a one-way sweep, SAM's ids are counted: one id over two runs is one object", () => {
  const pan = { t_start: 0, t_end: 10, full_sweep: false };

  expect(countObjects([track("0", [0, 40], [150, 200]), track("1", [60, 90])], pan, FPS).count).toBe(2);
});

test("only what is seen inside the segment's own stretch of the clip counts", () => {
  // Kitchen 0–5 s, bedroom 5–10 s: a window seen only at 7–8 s is not the kitchen's.
  const kitchen = { t_start: 0, t_end: 5, full_sweep: true };
  const objects = [track("0", [10, 60]), track("1", [168, 192])];

  expect(countObjects(objects, kitchen, FPS).count).toBe(1);
});
