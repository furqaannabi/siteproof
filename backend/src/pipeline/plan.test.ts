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
    // The tag at the start, then again after a full turn.
    sightings: [{ t: 0, qr_code: KITCHEN }, { t: 2, qr_code: KITCHEN }, { t: 10, qr_code: KITCHEN }],
    tracks: { window: [track("0", [[10, 50]])], door: [] },
    fps: FPS,
    frameSize: { width: 1920, height: 1080 },
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

test("a sweep covers its room only if the camera comes back round to the tag, at least 5 s later", () => {
  const seen = (...times: number[]) => times.map((t) => ({ t, qr_code: KITCHEN }));

  // Started on the tag and turned part of the way: the 2 November false Short.
  expect(planClip(input({ sightings: seen(0, 0.5, 1) })).segments[0]!.full_sweep).toBe(false);
  // Off the tag and straight back is a wobble, not a turn round the room.
  expect(planClip(input({ sightings: seen(0, 0.5, 3.5) })).segments[0]!.full_sweep).toBe(false);
  // Out of view for 5.5 s, then the tag again: all the way round.
  expect(planClip(input({ sightings: seen(0, 0.5, 6) })).segments[0]!.full_sweep).toBe(true);
  // Another room's tag coming into view is not this room's tag coming back.
  const other = [...seen(0, 0.5), { t: 8, qr_code: "SPBDRM0001" }];
  expect(planClip(input({ sightings: other })).segments[0]!.full_sweep).toBe(false);
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

test("an object's best frame shows it whole: never cut off by the edge of the picture, then the largest view", () => {
  const at = (frame: number, box: [number, number, number, number], confidence: number) => ({
    frame,
    box: { left: box[0], top: box[1], right: box[2], bottom: box[3] },
    confidence,
  });
  // The Room Two door of 2 November: a close-up cut off at the top, SAM's most confident;
  // an edge-on strip at the left edge; then the whole door, small and then larger.
  const door: TrackedObject = {
    track_id: "0",
    sightings: [
      at(20, [300, 0, 1100, 700], 0.97),
      at(30, [0, 100, 90, 1000], 0.9),
      at(40, [800, 150, 1000, 900], 0.7),
      at(50, [700, 100, 1050, 1000], 0.6),
    ],
  };

  const plan = planClip(input({ tracks: { window: [], door: [door] } }));

  expect(plan.detections.map((d) => d.frame)).toEqual([50]);
});

test("a turn with a small step back covers the room, but its objects are counted by SAM's ids, never by runs", () => {
  // One step back of 10 against 300 forward: covered. Window track 0 is seen in two runs.
  const wobble = panRight.map((s, i) => ({ ...s, shift: i === 8 ? -10 : 15 }));
  const tracks = { window: [track("0", [[30, 62], [140, 238]])], door: [] };

  const strict = planClip(input({ tracks }));
  const wobbly = planClip(input({ tracks, shifts: wobble }));

  expect(strict.segments[0]!.full_sweep).toBe(true);
  expect(strict.detections).toHaveLength(2);
  expect(wobbly.segments[0]!.full_sweep).toBe(true);
  expect(wobbly.detections).toHaveLength(1);
});
