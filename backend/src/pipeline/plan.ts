/**
 * What one clip adds to the database, decided without touching it: its segments,
 * which room each belongs to and whether it is a full one-way sweep, and one detection
 * per object counted in each placed segment, with the frame that best shows it.
 *
 * Pure, so the rules a buyer's outcome rests on are tested without video or a model.
 */
import type { SegmentationMask } from "@meta-sam/parser";
import type { ItemKind } from "@siteproof/contract";
import type { PlannedSegment, TagSighting } from "./segments";
import { countObjects } from "./count";
import type { Box, Sighting, TrackedObject } from "./sam";
import { isOneWaySweep, turnsOneWay } from "./sweep";

export interface PlanInput {
  planned: readonly PlannedSegment[];
  /** Every room tag decoded from the sampled frames, as the segments were built from. */
  sightings: readonly TagSighting[];
  /** This project's rooms by their tag code. */
  roomsByTag: ReadonlyMap<string, string>;
  /** The camera's sideways step ending at each sampled frame's time. */
  shifts: readonly { t: number; shift: number }[];
  tracks: Readonly<Record<ItemKind, readonly TrackedObject[]>>;
  /** The video's own frame rate, which SAM's frame numbers count in. */
  fps: number;
  /** The decoded frame's size, as SAM's boxes are measured: to tell an object cut off by the edge. */
  frameSize: { width: number; height: number };
}

export interface PlannedDetection {
  room_id: string;
  item: ItemKind;
  /** Unique within the clip: segment, SAM track and run. */
  track_id: string;
  /** The frame that best shows the object, in the video's own numbering. */
  frame: number;
  box: Box;
  /** SAM's mask on that frame; drawn into the evidence image. */
  mask?: SegmentationMask;
}

export interface ClipPlan {
  segments: { room_id: string | null; t_start: number; t_end: number; full_sweep: boolean }[];
  detections: PlannedDetection[];
}

/**
 * Out of view for at least this long, then seen again: the camera turned all the way
 * round the room. Less is a wobble off the tag and back.
 */
const RETURN_GAP_S = 5;

/**
 * Whether the segment's own tag leaves the view and comes back. The segment starts at
 * its tag by construction, so a gap between two sightings of it is the turn between.
 */
function returnsToTag(segment: PlannedSegment, sightings: readonly TagSighting[]): boolean {
  const times = sightings
    .filter((s) => s.qr_code === segment.qr_code && s.t >= segment.t_start && s.t <= segment.t_end)
    .map((s) => s.t)
    .sort((a, b) => a - b);
  return times.some((t, i) => i > 0 && t - times[i - 1]! >= RETURN_GAP_S);
}

export function planClip({ planned, sightings, roomsByTag, shifts, tracks, fps, frameSize }: PlanInput): ClipPlan {
  const segments = planned.map((p) => {
    const room_id = p.qr_code ? (roomsByTag.get(p.qr_code) ?? null) : null;
    // A segment starts at its tag by construction. It covers the room only if the
    // camera turns one way through it and comes back round to the tag: a clip that
    // stops partway, or pans back to the tag, never looked at the rest of the room,
    // and a Short from it would be an accusation about walls it never filmed. An
    // unplaced segment covers no room.
    const steps = shifts.filter((s) => s.t > p.t_start && s.t <= p.t_end).map((s) => s.shift);
    const full_sweep = room_id !== null && turnsOneWay(steps) && returnsToTag(p, sightings);
    return { room_id, t_start: p.t_start, t_end: p.t_end, full_sweep, strictlyOneWay: isOneWaySweep(steps) };
  });

  const detections: PlannedDetection[] = [];
  segments.forEach((segment, index) => {
    // Unplaced footage is stored as a segment, but never counted for any room.
    if (segment.room_id === null) return;
    for (const item of ITEMS) {
      const runsSoFar = new Map<string, number>();
      // Every run is an object only where the camera never went back at all: a step
      // back can show an object twice, so a covered turn with one counts SAM's ids.
      const window = { ...segment, full_sweep: segment.full_sweep && segment.strictlyOneWay };
      for (const object of countObjects(tracks[item], window, fps).objects) {
        const run = runsSoFar.get(object.track_id) ?? 0;
        runsSoFar.set(object.track_id, run + 1);
        const best = bestSighting(object.sightings, frameSize);
        detections.push({
          room_id: segment.room_id,
          item,
          track_id: `${index}/${object.track_id}/${run}`,
          frame: best.frame,
          box: best.box,
          ...(best.mask ? { mask: best.mask } : {}),
        });
      }
    }
  });

  return { segments: segments.map(({ strictlyOneWay: _, ...s }) => s), detections };
}

const ITEMS: readonly ItemKind[] = ["window", "door"];

const area = (b: Box) => (b.right - b.left) * (b.bottom - b.top);

/** Pixels a box must keep from every edge of the picture to count as whole. */
const EDGE_PX = 4;

/**
 * The sighting that best shows an object: one with the whole object in the picture,
 * then the largest, then SAM's most confident. The frame is the buyer's evidence and
 * what Muse Spark is asked about: on 2 November SAM's most confident frames of two
 * real doors were a close-up cut off at the top and an edge-on strip, and both were
 * rejected as not a door hung in its frame.
 */
function bestSighting(sightings: readonly Sighting[], { width, height }: PlanInput["frameSize"]): Sighting {
  const whole = (b: Box) => b.left >= EDGE_PX && b.top >= EDGE_PX && b.right <= width - EDGE_PX && b.bottom <= height - EDGE_PX;
  const rank = (s: Sighting): [number, number, number] => [whole(s.box) ? 1 : 0, area(s.box), s.confidence ?? 0];
  return sightings.reduce((best, s) => {
    const [a, b] = [rank(s), rank(best)];
    const d = a.findIndex((v, i) => v !== b[i]);
    return d !== -1 && a[d]! > b[d]! ? s : best;
  });
}
