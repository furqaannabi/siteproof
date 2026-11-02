# A full sweep returns to its tag, and Muse Spark confirms each object

**Date:** 2 November 2026
**Decided by:** William, with Furqaan's go-ahead
**Status:** Accepted. Supersedes, in [How a count is made and judged](2026-10-29-how-a-count-is-made-and-judged.md), the definition of a full sweep and decision 2 (Short needs the cross-check to agree). Decisions 1 and 3 there stand.

## Context

The first footage filmed with printed room tags, on 2 November, showed two ways a builder could be wrongly judged, and a third cost:

- **A false Short.** A 10-second clip that started on the Main Store tag and turned part of the way along the shelves was marked a **full sweep**: any clip that starts at its tag and pans one way for 1.5 s qualified. No door was in view, so SAM counted 0 doors and the Muse Spark cross-check agreed. The room has 3. Against a demand letter claiming 3 doors, that is **Short by 3**: an accusation from footage that never looked at the doors. Agreement between two models looking at the same frames cannot catch what the camera did not film.
- **A false Verified.** On a downloaded clip of a bare site (c06), SAM counted 1 window and 2 doors where only openings and empty frames exist. A whole-room recount by a second model can make the same mistake, and two models agreeing on it would pass a claim for items not fitted.
- **Noise.** On the same 10-second clip, Muse Spark's whole-room recount saw a window that is not there. Every such disagreement is a gap request for footage the builder has already sent.

Three options were weighed: fix coverage only; fix coverage and test better SAM prompts; fix coverage and replace the whole-room recount with a check of each object SAM found. The third was chosen.

## Decisions

**1. A full sweep returns to its tag.** A segment is a full sweep only when its room's tag is seen at the start, is then out of view for at least 5 seconds, and is seen again at the end, with the stretch between a one-way sweep as before. Seeing the tag again is the proof the camera turned all the way round; it needs no lens calibration, and it can be shown to a buyer ("the tag at 0:01, and again at 0:48"). Measuring a 360° turn from the pan was rejected: the pan is measured in pixels, and pixels per degree depend on each phone's lens.

**2. Muse Spark confirms each object, and can only make an outcome more cautious.** For every counted object, Muse Spark is shown that object's best frame with SAM's outline drawn on it, and asked one fixed yes-or-no question, written in code and never taken from a document:

- window: "Is the outlined object a fitted window, a frame with glass installed in the wall? Answer yes or no."
- door: "Is the outlined object a door leaf hung in its frame? Answer yes or no."

Only a clear yes confirms. A no, an unclear answer or a refusal leaves the object unconfirmed. Muse Spark unreachable fails the job, which retries; it never defaults a room to unconfirmed.

**3. Verified counts confirmed objects; Short counts SAM's.** For each room and item, the highest single clip decides, as before, but separately for each count:

- **Verified** when the highest confirmed count from any single clip is at least the claim. Coverage is not needed to see enough.
- **Short** only when the clip with the highest SAM count is a full sweep and that count is below the claim. A rejection by Muse Spark can never make a room Short: a real door wrongly rejected would otherwise be an accusation made by a model.
- **Not seen yet** otherwise, including SAM seeing enough with fewer confirmed: "3 seen, 2 confirmed".
- A whole-flat claim adds the rooms' confirmed counts for Verified, and is Short only when every room's deciding clip is a full sweep and SAM's total is below the claim.

**4. Where it lives.** `confirmed` is stored on each detection and added to the contract's `Detection`, so the report can say why a room is not Verified yet. The `CrossCheck` table stays but is no longer written or read; dropping it is a riskier migration with nothing to gain before the hackathon ends.

**5. Builders are told how to film.** Wherever the app explains filming: "Start on the room tag, turn slowly all the way round in one direction, and stop when the tag is back in view." A room not fully covered says why: "The clip didn't come back round to the room tag." Clips already processed are re-run under the new rule.

## Consequences

- The coverage rule in CLAUDE.md, PRODUCT.md and the data contract changes its definition of a full sweep, and its "if SAM and the cross-check disagree" sentence gives way to decision 3. The three outcomes and "models find, code decides" are unchanged: Muse Spark answers a yes-or-no question about one frame; code decides the outcome.
- Filming a room now takes a full turn, a few seconds longer, and a clip that stops early can only lead to Verified or Not seen yet, never Short.
- One Muse Spark image call per counted object instead of one per room and item: about the same cost for a room of a few doors.
- **Build order, after the core freeze:** decisions 1 and 5 on 2 November; decisions 2 to 4 by noon on 3 November, or they wait until after the hackathon and the whole-room cross-check stays. Decision 1 alone closes the false Short.
