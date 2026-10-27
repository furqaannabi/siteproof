# Input we cannot turn into evidence is refused at upload, in the gap-request voice

**Date:** 27 October 2026
**Decided by:** William
**Status:** Accepted — needs Furqaan's and Apurva's agreement, since it touches the pipeline and the report UI

## Context

Builders forward whatever is in the WhatsApp group, and most of what is in a WhatsApp group is photos. Two kinds of input cannot become evidence:

- **A photo offered as footage.** SAM would segment windows in a still happily enough. But the coverage rule needs one continuous clip that starts at the room's tag and sweeps the room once in one direction, and a photo cannot establish that — there is no way to know it shows the whole wall rather than the one corner with the window installed. So a photo can never move a room to **Verified**, and it cannot justify **Short** either, because Short requires full coverage.
- **A document with no text layer** (a scan or a photo of an invoice). `pdftotext` returns nothing, so there is no authoritative text to verify a quote against.

`backend/src/pipeline/ingest.ts` already refuses a still image with `code: "photo"`.

## Options

1. **Refuse both at upload**, with a plain next step.
2. **Accept photos, store them, show them in the report as attached context** — never counted, never part of an outcome, visually distinct from evidence frames.
3. **Accept and extract nothing**: the upload succeeds, every claim lands unverified, the builder sees an empty report.
4. **OCR scanned documents** with tesseract and treat the OCR output as the canonical text.

## Decision

Option 1, for both kinds of input.

Option 2 was declined for v1. It spends Apurva's scarcest week on a surface that cannot change a single outcome, and it puts a photo on the same screen as evidence frames — where the one thing a buyer must be able to trust is that everything on that screen was counted from a sweep. What it buys is a softer refusal, and good wording buys that for nothing. It goes on the roadmap.

Option 3 is strictly worse than refusing: the builder learns nothing and waits in front of an empty report.

Option 4 was declined because it would make `quote_verified` stop meaning anything. With a scan there are no authoritative bytes; tesseract is a second guesser looking at the same pixels. The comparison stops being "did the model quote the document faithfully" and becomes "did two transcriptions make the same mistakes" — a faithful quote fails when tesseract reads `nos` as `n0s`, and a fabricated one passes when both garble a line the same way. It also adds a third system binary and a second accuracy problem on the document side, four days before freeze, while the accuracy figure published on 31 October is about SAM counts on clips. On the roadmap.

**A refusal is worded as a gap request, never as an error.** "Photos can't be counted — five seconds of video from the doorway tag will clear this room", not "Invalid file type". The same refusal in the wrong voice is the product policing the builder, which is the one thing the flip exists to avoid.

A document counts as unreadable as text when `pdftotext -layout` yields fewer than 50 non-whitespace characters per page. A real BOQ page clears that by an order of magnitude; a scan yields single digits.

## Consequences

- A judge who uploads a photo during the demo gets an honest refusal with a next step rather than a photo sitting inertly in a report. This was weighed as a presentation risk on a track where "it works" is a criterion, and the clear refusal was judged to read better than a no-op.
- The `photo` message in `ingest.ts` wants rewording to the gap-request voice. That file is Furqaan's; it goes to him as a request, not an edit.
- Apurva needs the refusal copy for the upload UI, and it must read the same there as it does from the API.
- Two roadmap items added to `docs/PRODUCT.md`: photos as attached context, OCR for scanned documents.
