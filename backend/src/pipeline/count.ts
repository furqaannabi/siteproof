/**
 * Step 4 of the pipeline, the code half: turning what SAM 3.1 tracked into a count of
 * objects in one segment of a clip.
 *
 * SAM's track ids are not trusted alone: it can give two look-alike objects one id
 * across a gap. Within a full one-way sweep the camera never pans back, so an object
 * that has left the frame cannot return, and every run of consecutive frames is one
 * object, whatever its id. Elsewhere, the count is SAM's distinct ids.
 * See docs/decisions/2026-10-29-how-a-count-is-made-and-judged.md.
 */
import type { Sighting, TrackedObject } from "./sam";

/** A gap longer than this ends a run: longer than a blur or a passing worker. */
const RUN_GAP_SECONDS = 1;

export interface SegmentWindow {
  t_start: number;
  t_end: number;
  full_sweep: boolean;
}

/** One counted object: the track it came from, and every sighting of it in the segment. */
export interface CountedObject {
  track_id: string;
  sightings: Sighting[];
}

export function countObjects(
  objects: readonly TrackedObject[],
  segment: SegmentWindow,
  fps: number,
): { count: number; objects: CountedObject[] } {
  const maxGap = RUN_GAP_SECONDS * fps;
  const counted: CountedObject[] = [];

  // Frames inside this segment's stretch of the clip, half-open, as segments meet.
  const first = segment.t_start * fps;
  const end = segment.t_end * fps;

  for (const { track_id, sightings } of objects) {
    let run: CountedObject | null = null;
    for (const s of sightings) {
      if (s.frame < first || s.frame >= end) continue;
      const last = run?.sightings.at(-1);
      if (!run || (segment.full_sweep && last && s.frame - last.frame > maxGap)) {
        run = { track_id, sightings: [] };
        counted.push(run);
      }
      run.sightings.push(s);
    }
  }

  return { count: counted.length, objects: counted };
}
