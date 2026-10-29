# A count is runs within a one-way sweep; Short needs the cross-check; Verified is exact

**Date:** 29 October 2026
**Decided by:** Furqaan
**Status:** Accepted. Amends the premise of the locked trust rule "Count objects, not appearances"

## Context

The trust rule "Count objects, not appearances" rests on SAM 3.1 keeping each object's identity within a clip, so a room's count could be its number of distinct track ids. Testing on 28 October showed that premise does not hold, in either direction:

- **Undercount, seen.** On a generated one-way sweep of a room with three windows (`backend/scripts/sam-count.ts`), SAM returned two track ids. Track 0 was seen in two runs, frames 0–62 and 140–238; the frames show two different windows, the first on the entry wall and the third beside a pillar. SAM gave a second, look-alike window the id of one that had left the frame. Real UPVC windows look alike too. In a fully covered room an undercount becomes **Short**: a false accusation against a builder.
- **Overcount, documented.** Meta's docs say not to rely on an id across an object's exit and re-entry, which is the double count the one-way sweep rule exists to prevent.

Twice, the wording of a prompt alone turned real objects into zero: "red rectangle" on two red boxes, and "glass window" on three plainly visible windows, where "window" found them.

The comparison tolerance had been open since the first plan.

## Decisions

**1. Within a full one-way sweep, every run of consecutive frames is one object.** A one-way sweep never pans back, so an object that has left the frame cannot legitimately return: whatever id SAM gives it, a new run is a new object. A sweep segment's count for an item is its number of runs; a gap of more than a couple of sampled frames ends a run. Outside a full sweep, the count is SAM's distinct ids, as before. A room's count is still the highest from any single clip.

Only a fully covered room can be **Short**, and full coverage is a one-way sweep, so every count that can lead to an accusation is a run count. Runs everywhere was rejected: in a back-and-forth pan each return is a new run, which overcounts.

**2. A zero, or any count, reaches Short only when the Muse Spark cross-check agrees.** If SAM's count and the cross-check disagree, the room stays **Not seen yet**, as the coverage rule already says. And each item's SAM prompt is fixed in code, chosen by testing it against labelled clips, never derived from a document's wording: `window` and `door` today. Several prompts with the highest count kept was rejected: three times the cost, and a phrasing that over-detects pushes counts toward a wrong Verified.

**3. Verified is exact.** A claim is **Verified** when counted ≥ claimed. In a fully covered room, with the cross-check agreeing, anything less is **Short** by the difference. Windows and doors are whole objects: a tolerance would only hide a missing one, and a bank would release money against it.

## Consequences

- The trust rule keeps its intent and its words, "count objects, not appearances"; what changes is how an object is told apart inside a sweep. CLAUDE.md, PRODUCT.md and the data contract say so.
- The counting tests must prove: a sweep with one id over two runs counts two; a back-and-forth pan is never used for Short; a cross-check disagreement leaves the room Not seen yet; counted one below claimed in a covered room is Short by one.
- Real footage must confirm decision 1 before the demo: one real one-way sweep and one real back-and-forth pan, against a hand count.
- Area items (tiles, plaster) will need their own rule when they come; nothing here applies to them.
