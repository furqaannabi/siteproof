/**
 * The comparison engine: claimed vs counted vs plan, deterministic code, no model.
 * The only place an outcome comes from.
 *
 * Run on read, from what is stored, so an outcome can never go stale or disagree with
 * the evidence behind it. See docs/decisions/2026-10-29-how-a-count-is-made-and-judged.md
 * docs/decisions/2026-10-27-the-demand-letter-is-judged-and-the-boq-is-a-ceiling.md and
 * docs/decisions/2026-11-02-a-full-sweep-returns-to-its-tag-and-each-object-is-confirmed.md.
 */
import type { Claim, DocumentKind, ItemKind, NotChecked, Outcome } from "@siteproof/contract";

export interface JudgeInput {
  /** The flat's rooms. */
  rooms: { id: string }[];
  documents: { id: string; kind: DocumentKind }[];
  claims: Claim[];
  /** Placed segments in the flat's rooms. */
  segments: { clip_id: string; room_id: string | null; full_sweep: boolean }[];
  /** One per object SAM counted; `confirmed` when Muse Spark said yes to its outlined frame. */
  detections: { clip_id: string; room_id: string; item: ItemKind; best_frame_key: string; confirmed: boolean }[];
}

/** A Result, with its evidence still as storage keys. */
export interface JudgedResult {
  claim_id: string;
  room_id: string | null;
  expected: number;
  counted: number;
  outcome: Outcome;
  room_covered: boolean;
  evidence_keys: string[];
}

/**
 * What each clip of a room saw of one item: SAM's count, how many of those objects
 * Muse Spark confirmed, and whether the clip fully covered the room.
 */
function clipsOf(input: JudgeInput, room: string, item: ItemKind) {
  return [...new Set(input.segments.filter((s) => s.room_id === room).map((s) => s.clip_id))].map((clip) => {
    const objects = input.detections.filter((d) => d.clip_id === clip && d.room_id === room && d.item === item);
    const confirmed = objects.filter((d) => d.confirmed);
    return {
      seen: objects.length,
      confirmed: confirmed.length,
      sweep: input.segments.some((s) => s.clip_id === clip && s.room_id === room && s.full_sweep),
      seen_keys: objects.map((d) => d.best_frame_key),
      confirmed_keys: confirmed.map((d) => d.best_frame_key),
    };
  });
}

type ClipCount = ReturnType<typeof clipsOf>[number];

/** The highest single clip by `by`; on a tie, a full sweep. Never a sum across clips. */
function highest(clips: ClipCount[], by: "seen" | "confirmed"): ClipCount | null {
  const rank = (c: ClipCount) => c[by] * 2 + (c.sweep ? 1 : 0);
  return clips.reduce<ClipCount | null>((best, c) => (!best || rank(c) > rank(best) ? c : best), null);
}

/**
 * One room, one item, against one expected quantity.
 *
 * Verified counts only objects Muse Spark confirmed; Short counts SAM's objects, and
 * only from a full sweep. So Muse Spark can hold a Verified back but can never make a
 * room Short: a real door it wrongly rejects would otherwise be an accusation made by
 * a model. See docs/decisions/2026-11-02-a-full-sweep-returns-to-its-tag-and-each-object-is-confirmed.md
 */
function judgeRoom(input: JudgeInput, room: string, item: ItemKind, expected: number) {
  const clips = clipsOf(input, room, item);
  const byConfirmed = highest(clips, "confirmed");
  const bySeen = highest(clips, "seen");
  const room_covered = clips.some((c) => c.sweep);

  if (byConfirmed && byConfirmed.confirmed >= expected) {
    return { expected, counted: byConfirmed.confirmed, outcome: "verified" as Outcome, room_covered, evidence_keys: byConfirmed.confirmed_keys };
  }
  // Short only for a room fully covered by the very sweep that counted it.
  const outcome: Outcome = bySeen && bySeen.sweep && bySeen.seen < expected ? "short" : "not_seen";
  return { expected, counted: bySeen?.seen ?? 0, outcome, room_covered, evidence_keys: bySeen?.seen_keys ?? [] };
}

/**
 * A whole-flat claim the BOQ can't split: the flat's total is judged. Confirmed room
 * counts add up to Verified; it is Short only when every room is fully covered by the
 * sweep that counted it and SAM's total falls below the claim.
 */
function judgeFlat(input: JudgeInput, item: ItemKind, expected: number) {
  const rooms = input.rooms.map((r) => clipsOf(input, r.id, item));
  const confirmed = rooms.map((clips) => highest(clips, "confirmed")).filter((c): c is ClipCount => c !== null);
  const seen = rooms.map((clips) => highest(clips, "seen"));
  const confirmedTotal = confirmed.reduce((sum, c) => sum + c.confirmed, 0);
  const seenTotal = seen.reduce((sum, c) => sum + (c?.seen ?? 0), 0);
  const everyRoomSwept = seen.every((c) => c?.sweep);

  if (confirmedTotal >= expected) {
    return { expected, counted: confirmedTotal, outcome: "verified" as Outcome, room_covered: everyRoomSwept, evidence_keys: confirmed.flatMap((c) => c.confirmed_keys) };
  }
  const outcome: Outcome = everyRoomSwept && seenTotal < expected ? "short" : "not_seen";
  return { expected, counted: seenTotal, outcome, room_covered: everyRoomSwept, evidence_keys: seen.flatMap((c) => c?.seen_keys ?? []) };
}

export function judge(input: JudgeInput): { results: JudgedResult[]; not_checked: NotChecked[] } {
  const results: JudgedResult[] = [];
  const not_checked: NotChecked[] = [];
  const boq = new Set(input.documents.filter((d) => d.kind === "boq").map((d) => d.id));

  // The plan: the BOQ's quantity per room and item. Absent where the BOQ is silent.
  const plan = new Map<string, number>();
  const key = (room: string, item: ItemKind) => `${room}:${item}`;
  for (const c of input.claims) {
    if (!boq.has(c.doc_id) || c.item === "not_countable" || c.room_id === null) continue;
    plan.set(key(c.room_id, c.item), (plan.get(key(c.room_id, c.item)) ?? 0) + c.qty);
  }

  for (const claim of input.claims) {
    if (claim.item === "not_countable") {
      not_checked.push({ claim_id: claim.id, reason: "not_countable" });
      continue;
    }
    if (boq.has(claim.doc_id)) {
      not_checked.push({ claim_id: claim.id, reason: "plan" });
      continue;
    }
    if (claim.room_id === null) {
      const item = claim.item;
      const perRoom = input.rooms
        .map((r) => ({ room: r.id, planned: plan.get(key(r.id, item)) }))
        .filter((r): r is { room: string; planned: number } => r.planned !== undefined && r.planned > 0);
      const planned = perRoom.reduce((sum, r) => sum + r.planned, 0);
      // The whole flat's plan matches the claim: judge each room against its share.
      if (perRoom.length > 0 && planned === claim.qty) {
        for (const r of perRoom) results.push({ claim_id: claim.id, room_id: r.room, ...judgeRoom(input, r.room, item, r.planned) });
        continue;
      }
      if (perRoom.length > 0 && claim.qty > planned) {
        not_checked.push({ claim_id: claim.id, reason: "exceeds_plan" });
        continue;
      }
      // The BOQ is silent for this item, or this is a partial stage ("8 of 10") that
      // doesn't say which rooms: judge the flat's total.
      results.push({ claim_id: claim.id, room_id: null, ...judgeFlat(input, item, claim.qty) });
      continue;
    }
    // More than the plan allows can't be verified by any footage: a paper discrepancy,
    // for a person with both quotes, before a frame is looked at.
    const planned = plan.get(key(claim.room_id, claim.item));
    if (planned !== undefined && claim.qty > planned) {
      not_checked.push({ claim_id: claim.id, reason: "exceeds_plan" });
      continue;
    }
    results.push({ claim_id: claim.id, room_id: claim.room_id, ...judgeRoom(input, claim.room_id, claim.item, claim.qty) });
  }
  return { results, not_checked };
}
