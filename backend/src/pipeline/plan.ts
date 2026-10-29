/**
 * What one clip adds to the database, decided without touching it: its segments,
 * which room each belongs to and whether it is a full one-way sweep, and one detection
 * per object counted in each placed segment, with the frame that best shows it.
 *
 * Pure, so the rules a buyer's outcome rests on are tested without video or a model.
 */
import type { SegmentationMask } from "@meta-sam/parser";
import type { ItemKind } from "@siteproof/contract";
import type { PlannedSegment } from "./segments";
import { countObjects } from "./count";
import type { Box, Sighting, TrackedObject } from "./sam";
import { isOneWaySweep } from "./sweep";

export interface PlanInput {
  planned: readonly PlannedSegment[];
  /** This project's rooms by their tag code. */
  roomsByTag: ReadonlyMap<string, string>;
  /** The camera's sideways step ending at each sampled frame's time. */
  shifts: readonly { t: number; shift: number }[];
  tracks: Readonly<Record<ItemKind, readonly TrackedObject[]>>;
  /** The video's own frame rate, which SAM's frame numbers count in. */
  fps: number;
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

export function planClip({ planned, roomsByTag, shifts, tracks, fps }: PlanInput): ClipPlan {
  const segments = planned.map((p) => {
    const room_id = p.qr_code ? (roomsByTag.get(p.qr_code) ?? null) : null;
    // A segment starts at its tag by construction; it covers the room only if the
    // camera then pans one way through it. An unplaced segment covers no room.
    const steps = shifts.filter((s) => s.t > p.t_start && s.t <= p.t_end).map((s) => s.shift);
    return { room_id, t_start: p.t_start, t_end: p.t_end, full_sweep: room_id !== null && isOneWaySweep(steps) };
  });

  const detections: PlannedDetection[] = [];
  segments.forEach((segment, index) => {
    // Unplaced footage is stored as a segment, but never counted for any room.
    if (segment.room_id === null) return;
    for (const item of ITEMS) {
      const runsSoFar = new Map<string, number>();
      for (const object of countObjects(tracks[item], segment, fps).objects) {
        const run = runsSoFar.get(object.track_id) ?? 0;
        runsSoFar.set(object.track_id, run + 1);
        const best = bestSighting(object.sightings);
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

  return { segments, detections };
}

const ITEMS: readonly ItemKind[] = ["window", "door"];

const area = (b: Box) => (b.right - b.left) * (b.bottom - b.top);

/** The sighting that best shows an object: SAM's most confident, then the largest. */
function bestSighting(sightings: readonly Sighting[]): Sighting {
  return sightings.reduce((best, s) => {
    const c = (s.confidence ?? 0) - (best.confidence ?? 0);
    return c > 0 || (c === 0 && area(s.box) > area(best.box)) ? s : best;
  });
}
