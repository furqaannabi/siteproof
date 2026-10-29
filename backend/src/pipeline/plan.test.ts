import { expect, test } from "bun:test";
import { planClip, type PlanInput } from "./plan";
import type { TrackedObject } from "./sam";

const FPS = 24;
const KITCHEN = "SPKTCHN001";

/** A track seen on every frame of each [first, last] range; `best` gets the top confidence. */
function track(track_id: string, ranges: [number, number][], best?: number): TrackedObject {
  const sightings = ranges.flatMap(([first, last]) =>
    Array.from({ length: last - first + 1 }, (_, i) => ({
      frame: first + i,
      box: { left: 0, top: 0, right: 10, bottom: 10 },
      confidence: first + i === best ? 0.95 : 0.6,
    })),
  );
  return { track_id, sightings };
}

/** Steady pan right every half second from 0 to 10 s. */
const panRight = Array.from({ length: 20 }, (_, i) => ({ t: (i + 1) * 0.5, shift: 15 }));

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    planned: [{ qr_code: KITCHEN, t_start: 0, t_end: 10 }],
    roomsByTag: new Map([[KITCHEN, "room_kitchen"]]),
    shifts: panRight,
    tracks: { window: [track("0", [[10, 50]])], door: [] },
    fps: FPS,
    ...overrides,
  };
}

test("a tag that isn't one of this project's rooms leaves its segment unplaced, never counted", () => {
  const plan = planClip(input({ planned: [{ qr_code: "SPZZZZZZZZ", t_start: 0, t_end: 10 }] }));

  expect(plan.segments).toEqual([{ room_id: null, t_start: 0, t_end: 10, full_sweep: false }]);
  expect(plan.detections).toEqual([]);
});

test("a placed segment is a full sweep only if the camera pans one way through it", () => {
  const backAndForth = panRight.map((s, i) => ({ ...s, shift: i < 10 ? 15 : -15 }));
  const twoParts: PlanInput["planned"] = [
    { qr_code: null, t_start: 0, t_end: 2 },
    { qr_code: KITCHEN, t_start: 2, t_end: 10 },
  ];

  expect(planClip(input({ planned: twoParts })).segments.map((s) => s.full_sweep)).toEqual([false, true]);
  expect(planClip(input({ shifts: backAndForth })).segments[0]!.full_sweep).toBe(false);
});

test("each counted object becomes one detection, shown by the best frame of its own run", () => {
  // Window track 0 merged two windows (runs 0–62 and 140–238); a door is seen only in
  // the unplaced first second, before the kitchen tag.
  const plan = planClip(
    input({
      planned: [
        { qr_code: null, t_start: 0, t_end: 1 },
        { qr_code: KITCHEN, t_start: 1, t_end: 10 },
      ],
      tracks: {
        window: [track("0", [[30, 62], [140, 238]], 200), track("1", [[77, 174]], 100)],
        door: [track("0", [[0, 20]], 10)],
      },
    }),
  );

  expect(plan.detections.map(({ room_id, item, frame }) => ({ room_id, item, frame }))).toEqual([
    { room_id: "room_kitchen", item: "window", frame: 30 },
    { room_id: "room_kitchen", item: "window", frame: 200 },
    { room_id: "room_kitchen", item: "window", frame: 100 },
  ]);
  expect(new Set(plan.detections.map((d) => d.track_id)).size).toBe(3);
});
