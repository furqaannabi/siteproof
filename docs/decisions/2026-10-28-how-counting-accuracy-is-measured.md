# How counting accuracy is measured and published

**Date:** 28 October 2026
**Decided by:** William
**Status:** Accepted. Furqaan's merged pipeline count joins as a second column once it exists

## Context

The plan publishes SAM's counts against hand counts on 15–20 clips in the README, and CLAUDE.md lists the accuracy evaluation among the tests that are not optional. Today only raw SAM exists (`segmentClip` in `backend/src/pipeline/sam.ts`, and `scripts/sam-count.ts` comparing one clip to one hand count); per-room counting, re-entry merging and QR placement are not built. SAM costs $0.20 per 1,000 frames, every frame of the clip: about $14 for 20 one-minute clips and two items.

## Decisions

**1. A label says, per clip and per item, how many distinct objects truly appear in it** — plus the room, only for a clip that covers one room (a one-way sweep), and the clip's kind: `sweep`, `messy` or `pan`. Label the truth once and score any counter against it: raw SAM now, the merged pipeline later. Labelling per room within mixed clips was declined: slower, and nothing can score it before QR placement exists.

**2. The published table reports direction, not a single percentage.** Every row, the number of clips stated first, and per clip kind and overall: exact matches, over-counts and under-counts separately with their average size, and the mean absolute error.

The direction is the point. An **over-count** can make a claim **Verified** for objects that are not there, so money is released for nothing; an **under-count** in a covered room makes a false **Short**, a query letter to an honest builder. A single "found 97% of windows" figure was rejected: an over-count in one clip and an under-count in another cancel into a perfect-looking number. A labelled item with no result is listed as not run, never left out silently.

**3. William builds the tooling; it calls Furqaan's `segmentClip` without changing it**, as `sam-count.ts` does:

- `backend/accuracy/labels.json` — the label file, committed: file names and counts only.
- A runner that calls SAM once per labelled clip and item and caches each answer locally, keyed by the file's hash, the prompt and the model, so a rerun pays only for what it has not seen. `--dry-run` prints the frames and the cost before anything is spent.
- A scorer, test-first, turning labels and results into the table.

Clips stay out of the repo, in a gitignored folder; the cache stays local; the table goes in the README. Rejected: splitting the runner off to Furqaan through an agreed results format (a coordination step for nothing), or leaving him all of it in the week he builds counting.

## Consequences

- With 15–20 clips the table says what was measured, not that SAM is "N% accurate". The README says so.
- The prompts sent to SAM are recorded with each result. Until Furqaan's item-to-prompt table exists, they are the item names, `window` and `door`.
- Furqaan adds the merged count as a second column when re-entry merging exists; the labels do not change.
