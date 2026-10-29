# A Result is per claim and room, computed on read; BOQ lines are the plan; the cross-check gates both outcomes

**Date:** 29 October 2026
**Decided by:** Furqaan
**Status:** Accepted

## Context

Building the comparison engine against the demo story raised three questions the contract did not answer:

1. The demand letter says "Windows complete: 12" for the whole flat, but the demo's outcomes are per room: "Bedroom 2 is Short by 2, the kitchen is Not seen yet". A `Result` was one per claim, with no room.
2. A report lists the BOQ's lines as claims, but the BOQ is the plan, a ceiling, never judged; and every claim in a report must be judged or explained.
3. Whether a disagreement between SAM's count and the Muse Spark cross-check holds back Verified, or only Short.

## Decisions

1. **One `Result` per claim and room**, with `Result.room_id` and `Result.expected`. A whole-flat claim whose quantity matches the BOQ's per-room quantities is split by them, and each room is judged against its own share. Where the BOQ is silent for the item, or the claim is a partial stage that doesn't say which rooms, the flat's total is judged in one Result with `room_id: null`, which can be Short only when every room of the flat is fully covered. A whole-flat claim beyond the flat's plan is `exceeds_plan`. `expected` is in the contract so "Short by 2" is a number code produced, never one the UI works out.
2. **BOQ lines are `not_checked` with reason `plan`.** They are shown as the plan, never with a badge.
3. **The cross-check gates both outcomes.** A room's deciding count must be confirmed by Muse Spark counting the same, or the room is Not seen yet, for Verified as for Short. An over-count could release money for windows that aren't there. The cross-check can only hold an outcome back, never produce one.

Also decided in building it:

- **Outcomes are computed on read**, when a report is assembled, by `backend/src/compare/judge.ts`, from the stored claims, segments, detections and cross-checks. The stored `Result` table is dropped: an outcome computed on read is deterministic, cannot go stale when a clip or document arrives, and cannot disagree with the evidence behind it.
- **The deciding clip** for a room is the one with the highest count, as the counting rule says, preferring a confirmed full sweep on a tie. Verified needs it confirmed and its count at least the expected; Short also needs it to be a full sweep. Anything else is Not seen yet.
- **Cross-checks are stored** in an internal `CrossCheck` table, one per clip, room and item. Until one exists for a room, nothing there can be Verified or Short.

## Consequences

- Gap requests ask the same engine whether a room is still Not seen yet, rather than a stored result.
- The report view and its mock need to read results per room, and BOQ lines under `not_checked: "plan"`.
- The cross-check itself, a Muse Spark count of each item in each placed segment, must run during ingest for any outcome to appear.
