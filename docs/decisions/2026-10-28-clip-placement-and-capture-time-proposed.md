# Clip placement for the builder, and capture time in the report: proposed

**Date:** 28 October 2026
**Proposed by:** Apurva
**For:** Furqaan (contract owner)
**Status:** Proposed. Nothing in `contract/` is changed by this note

## Context

The web app now uses the contract settled in [the report is per flat](2026-10-28-the-report-is-per-flat-and-every-claim-is-judged-or-explained.md): the builder's pages read `ProjectOverview`, the report reads one flat's `Report`. Moving the screens over showed two things the screens used to show that the new shapes can no longer carry. Both screens now leave them out rather than guess.

### 1. The builder can't see where a clip was placed

The project page listed each clip with where it went: "Placed in Kitchen, Bedroom 1", or **"No room tag seen, so it isn't used for any room"**. That second line is the trust rule "unplaced segments are never a claim", told to the one person who can fix it by filming again from the tag.

`ProjectOverview` has clips but no segments, so the page can't say either. `Report.segments` doesn't help: it holds only the segments placed in that flat's rooms, so an unplaced segment is in no report at all.

### 2. The report can't say when its evidence was filmed

The evidence caption read "Clip filmed 26 Oct, 10:19 · one-way sweep 0:00–0:27". The `Report` now carries evidence frames rather than clips, which is right, but the capture time went with the clips. It now reads "One-way sweep 0:00–0:27 of its clip".

For a buyer or bank, when the frame was taken matters: work filmed before the demand letter's date is evidence for it, and work filmed long ago may be plastered over. The time is also already a contract rule (`Clip.captured_at` is null when the file has none, and is never replaced with the upload time).

## Options

**For gap 1, the clip placement:**

- **A. Add `segments: Segment[]` to `ProjectOverview`** (recommended). Every segment in the project, placed and unplaced. The overview is behind the builder link, which can already see every clip, so nothing new is exposed. One field, no new route.
- **B. Add `rooms: string[]` and `unplaced: boolean` to `Clip`.** Simpler to read, but it summarises what `Segment` already says, and every place a `Clip` appears would carry it.
- **C. Leave it out.** The builder learns a clip was unplaced only by noticing a room never turns Verified.

**For gap 2, the capture time:**

- **A. Add `captured_at: string | null` to `Segment`** (recommended). It's the time of the clip the segment came from. The report already has the segments behind each result, so the caption needs nothing else, and no clip id or URL is added to what a buyer receives.
- **B. Add `clip_times: { clip_id: string; captured_at: string | null }[]` to `Report`.** Keeps `Segment` as it is, at the cost of a second list to join.
- **C. Leave it out.** The report shows frames with no date.

## What changes in the web app

With both A options, the project page shows placement and the "no room tag seen" line again, read from `overview.segments`, and the evidence caption shows "Clip filmed 26 Oct, 10:19", or "capture time unknown" when it's null. Both are small changes on the web side, made only after the contract changes.

## Questions for Furqaan

1. For the clip placement: A, B or C?
2. For the capture time: A, B or C?
