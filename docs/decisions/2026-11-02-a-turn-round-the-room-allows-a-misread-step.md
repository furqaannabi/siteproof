# A turn round the room allows a misread step

**Date:** 2 November 2026
**Decided by:** William, with Furqaan's go-ahead on coverage
**Status:** Accepted. Supersedes, in [A full sweep returns to its tag](2026-11-02-a-full-sweep-returns-to-its-tag-and-each-object-is-confirmed.md), decision 1's requirement that the stretch between the tag sightings be a one-way sweep with no pan back at all.

## Context

Four clips filmed tag to tag on 2 November, in two rooms of a shop, all came back round to their room tag, and none counted as a full sweep. The movement check read frames twice a second and allowed no step back larger than 4 pixels of a 160-pixel profile.

- A normal turn moved more than a quarter of the picture every half second, the most the check measures. Past that it misreads: one clip read a full step **backwards** between two full steps forwards.
- Stepping round furniture, or settling on the tag at the end, gives a few small steps back.

So a room could be fully covered only by a turn slower and steadier than builders film, and Short, which needs a covered room, would rarely be reachable on real footage, including the demo's.

The check still has one job the tag cannot do: a clip that turns partway and pans back to the tag sees the tag again after 5 seconds without ever filming the rest of the room.

## Decisions

1. **Frames are read 4 times a second**, for tags and for movement, so a normal turn stays within what the movement check measures.
2. **A segment covers its room when its tag is seen at the start, out of view for at least 5 s and seen again, and almost all the movement between goes one way:** the movement backwards adds up to no more than a tenth of the movement forwards. A misread step, a wobble or a step round an obstacle stays well under (1–6% on the 2 November clips); turning partway and panning back is near half.
3. **Counting keeps the strict rule.** Every run of consecutive frames is one object only in a segment with no step back at all. A covered segment with a step back counts SAM's distinct ids, since a step back can show an object twice.

## Consequences

- On the 2 November clips: the four tag-to-tag clips are covered; the two that never came back to the tag are not.
- Short becomes reachable on footage filmed the way builders film, still only for a room the clip turned all the way round.
- Reading twice as many frames adds a few seconds of local work per clip, and no model cost.
- The coverage rule in CLAUDE.md, PRODUCT.md and the data contract says "almost all the movement one way" instead of "without panning back".
