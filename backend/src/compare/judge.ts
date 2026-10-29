/**
 * The comparison engine: claimed vs counted vs plan, deterministic code, no model.
 * The only place an outcome comes from.
 *
 * Run on read, from what is stored, so an outcome can never go stale or disagree with
 * the evidence behind it. See docs/decisions/2026-10-29-how-a-count-is-made-and-judged.md
 * and docs/decisions/2026-10-27-the-demand-letter-is-judged-and-the-boq-is-a-ceiling.md.
 */
import type { Claim, DocumentKind, ItemKind, NotChecked, Outcome } from "@siteproof/contract";

export interface JudgeInput {
  /** The flat's rooms. */
  rooms: { id: string }[];
  documents: { id: string; kind: DocumentKind }[];
  claims: Claim[];
  /** Placed segments in the flat's rooms. */
  segments: { clip_id: string; room_id: string | null; full_sweep: boolean }[];
  /** One per counted object. */
  detections: { clip_id: string; room_id: string; item: ItemKind; best_frame_key: string }[];
  /** Muse Spark's own count of an item in a clip's footage of a room. */
  crossChecks: { clip_id: string; room_id: string; item: ItemKind; count: number }[];
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

/** The clip whose count decides a room, for one item, and whether it can be trusted. */
function decidingClip(input: JudgeInput, room: string, item: ItemKind) {
  const clips = [...new Set(input.segments.filter((s) => s.room_id === room).map((s) => s.clip_id))].map((clip) => {
    const evidence_keys = input.detections
      .filter((d) => d.clip_id === clip && d.room_id === room && d.item === item)
      .map((d) => d.best_frame_key);
    const sweep = input.segments.some((s) => s.clip_id === clip && s.room_id === room && s.full_sweep);
    const check = input.crossChecks.find((c) => c.clip_id === clip && c.room_id === room && c.item === item);
    // Confirmed only when Muse Spark counted the same: a model can hold an outcome
    // back, never produce one.
    return { count: evidence_keys.length, evidence_keys, sweep, confirmed: check?.count === evidence_keys.length };
  });

  // The highest count from any single clip decides; on a tie, a confirmed sweep.
  const rank = (c: (typeof clips)[number]) => c.count * 4 + (c.confirmed ? 2 : 0) + (c.sweep ? 1 : 0);
  const deciding = clips.reduce<(typeof clips)[number] | null>((best, c) => (!best || rank(c) > rank(best) ? c : best), null);
  return { deciding, covered: clips.some((c) => c.sweep) };
}

/** One room, one item, against one expected quantity. */
function judgeRoom(input: JudgeInput, room: string, item: ItemKind, expected: number) {
  const { deciding, covered } = decidingClip(input, room, item);
  const counted = deciding?.count ?? 0;

  let outcome: Outcome = "not_seen";
  if (deciding?.confirmed && counted >= expected) outcome = "verified";
  // Short only for a room fully covered by the very sweep that counted it.
  else if (deciding?.confirmed && deciding.sweep) outcome = "short";

  return {
    expected,
    counted,
    outcome,
    room_covered: covered,
    evidence_keys: deciding?.evidence_keys ?? [],
  };
}

/**
 * A whole-flat claim the BOQ can't split: the flat's total is judged. Only confirmed
 * room counts add up, and it is Short only when every room is fully covered by the
 * sweep that counted it.
 */
function judgeFlat(input: JudgeInput, item: ItemKind, expected: number) {
  const rooms = input.rooms.map((r) => decidingClip(input, r.id, item).deciding);
  const confirmed = rooms.filter((d) => d?.confirmed);
  const counted = confirmed.reduce((sum, d) => sum + d!.count, 0);
  const everyRoomSwept = rooms.every((d) => d?.confirmed && d.sweep);

  let outcome: Outcome = "not_seen";
  if (counted >= expected) outcome = "verified";
  else if (everyRoomSwept) outcome = "short";

  return {
    expected,
    counted,
    outcome,
    room_covered: everyRoomSwept,
    evidence_keys: confirmed.flatMap((d) => d!.evidence_keys),
  };
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
