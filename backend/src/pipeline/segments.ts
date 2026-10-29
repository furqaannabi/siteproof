/**
 * Step 2 of the pipeline, room placement: splitting a clip into segments by the room
 * tags seen in it. A segment runs from a tag's first sighting until a different tag
 * is seen; anything before the first tag is unplaced, and an unplaced segment is
 * never used for a per-room claim.
 */

/** A room tag decoded from a sampled frame, at `t` seconds into the clip. */
export interface TagSighting {
  t: number;
  qr_code: string;
}

/** A stretch of the clip and the tag it belongs to; `qr_code: null` is unplaced. */
export interface PlannedSegment {
  qr_code: string | null;
  t_start: number;
  t_end: number;
}

/**
 * What a SiteProof room tag decodes to: "SP" and 8 characters of Crockford base32.
 * Anything else in frame (a window maker's warranty sticker, say) is not a room tag.
 */
export const ROOM_TAG = /^SP[0-9A-HJKMNP-TV-Z]{8}$/;

export function segmentsFromTags(sightings: readonly TagSighting[], duration_s: number): PlannedSegment[] {
  const segments: PlannedSegment[] = [{ qr_code: null, t_start: 0, t_end: duration_s }];
  const tags = sightings.filter((s) => ROOM_TAG.test(s.qr_code)).sort((a, b) => a.t - b.t);
  for (const { t, qr_code } of tags) {
    const current = segments.at(-1)!;
    if (current.qr_code === qr_code) continue;
    current.t_end = t;
    segments.push({ qr_code, t_start: t, t_end: duration_s });
  }
  // A clip that opens on its tag has no unplaced stretch before it.
  return segments.filter((s) => s.t_end > s.t_start);
}
