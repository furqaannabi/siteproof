# Documents go to Muse Spark as text and page images, but a quote is verified against the extracted text only

**Date:** 27 October 2026
**Decided by:** William
**Status:** Accepted

## Context

`docs/PRODUCT.md` says Muse Spark reads the demand letter and the full BOQ in one call and that "code checks every quote exists in the document". `docs/data-contract.md` says `Claim.quote_verified` is set by code, never by a model. Neither says what "the document" is as a value the checker can search, and the checker cannot be written without that.

A BOQ is a table. Flattened to plain text without column positions, a quantity can end up beside the wrong item, and the BOQ quantity is the plan quantity the comparison engine comes to rest on.

## Options

1. **Extract text ourselves, send only that text.** One canonical string; the model sees exactly the bytes the checker will search. But text extraction flattens tables, so the model reads a mangled BOQ.
2. **Send the PDF or page images and let the model read them natively.** Best table fidelity, but no authoritative text exists to check a quote against, so `quote_verified` becomes unenforceable.
3. **Send both: extracted text and page images. Verify only against the extracted text.**
4. **Ask the model for the text as well as the claims.**

## Decision

Option 3. Muse Spark receives `pdftotext -layout` output and the page images in one call. The quote checker searches only the `pdftotext` output.

Option 4 is rejected on principle: the model would be the source of truth for the string used to verify the model, which makes the check circular and `quote_verified` meaningless. Option 2 fails the same way for the same reason. Option 1 is sound but reads BOQ tables badly, and the BOQ is where the plan quantity comes from.

Text comes from **poppler's `pdftotext -layout`**, shelled out the way `backend/src/pipeline/ingest.ts` shells out to `ffprobe`. `-layout` preserves column positions, which is the single highest-leverage flag available for reading a BOQ correctly. A JavaScript PDF library was considered and rejected: most return text runs with coordinates and leave column reconstruction to the caller, which means writing table logic ourselves, under deadline.

## Consequences

- **poppler is a new prerequisite**, after ffmpeg and ffprobe: `brew install poppler`, on three machines and in the deploy container. The backend README's prerequisites need it.
- A quote the model lifted faithfully from a page image can fail verification because `pdftotext` mangled that line. This is accepted, and is close to a feature: a line our extractor could not read cleanly is a line a person should see before a bank releases money against it. It lands as an unverified claim, which the trust rules already handle.
- `quote_verified: true` keeps its full meaning — the quote was found in a copy of the document that no model produced.
- Scanned and photographed documents have no text layer and are out of scope here; see [refusing unreadable input](2026-10-27-unreadable-input-is-refused-with-a-next-step.md).
