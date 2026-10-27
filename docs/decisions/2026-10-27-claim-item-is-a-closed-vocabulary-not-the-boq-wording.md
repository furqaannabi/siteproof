# Claim.item is a canonical value from a closed vocabulary, not the BOQ's wording

**Date:** 27 October 2026
**Decided by:** William
**Status:** Proposed — `contract/` is Furqaan's, so this needs his approval before the type lands

## Context

`Claim.item` is quietly doing three jobs: the human-readable name of the thing, the join key the comparison engine uses to match a claim to its detections, and the text prompt SAM is given. Those are three different strings.

A BOQ line reads "Providing and fixing UPVC openable window, 1200×1500 mm, including hardware and fixtures — 12 nos". The demand letter says "windows complete: 12". SAM wants "window".

## Options

1. **The verbatim BOQ wording**, with a table mapping wording to a SAM prompt.
2. **A canonical value from a closed vocabulary**, chosen by Muse Spark from a list we hand it; the verbatim line stays in `source_quote`.
3. **Free text from the model**, used directly as the SAM prompt.

## Decision

Option 2. `Claim.item` and `Detection.item` both hold a value from a closed vocabulary, which for the MVP is `window` and `door`. Muse Spark must pick from the list we give it or mark the line as not countable; it never invents a value.

The reason option 2 is available at all is that `source_quote` already carries the verbatim line, word-for-word verified. That field does the honesty work, which frees `item` to be a key rather than prose.

Option 3 is the one to avoid, because it fails silently in the worst direction. The model writes `"UPVC openable window"` on the claim, SAM's detections come back as `"window"`, the join misses, `counted` is 0, the room is fully covered, so the outcome is **Short by 12** — and SiteProof drafts a polite query letter to a builder about twelve windows that are installed and plainly visible on film. Nothing crashes and every test passes. Option 1 carries a milder form of the same disease, and its mapping table grows with every phrasing a quantity surveyor happens to use.

Proposed shape, for Furqaan to approve:

```ts
/** What SiteProof can count in v1. Muse Spark picks from this list or marks a line not countable. */
export type ItemKind = "window" | "door";
```

The vocabulary belongs in `contract/`, because `Claim` and `Detection` both depend on it. The table mapping a value to SAM's prompt belongs in `backend/src/pipeline/`, so it can be tuned after the SAM spike without touching the contract.

## Consequences

- Adding a countable item later is one vocabulary entry plus one prompt to tune. Area items (tiles, plaster, paint) are a different mechanism — mask area × scale — and stay on the roadmap.
- Muse Spark still reads the whole document: every BOQ line becomes a `Claim` with a verified quote. Only claims whose `item` is in the vocabulary can get an outcome.
- **A non-countable claim gets no `Result` row at all.** It is not `not_seen`: no amount of footage will clear a plastering line this month, and saying otherwise would be a lie told to a buyer. Recorded as open in `docs/data-contract.md`, because it needs a third visual state in Apurva's report view — a claim with no result, distinct from Not seen yet. Without that, the natural fallback paints every resultless claim as Not seen yet, and the report promises that five seconds of kitchen footage will clear the plastering.
