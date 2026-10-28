# How the extract_document job fails, retries and saves

**Date:** 27 October 2026
**Decided by:** William
**Status:** Accepted. The runner shape and the `reason` field touch Furqaan's runner and contract: proposed, awaiting his approval

## Context

`POST /documents` queues an `extract_document` job; nothing yet runs it. The jobs ADR left one thing to the first job handler: how a job that has used up its retries reaches the builder as a `failed` status with a plain-language reason. The job reads a PDF, asks Muse Spark, parses the answer and saves claims, and each step can fail in a different way.

## Decisions

**1. A job kind is a pair: `run` and `giveUp`.** `run(payload)` does the work and, when it fails, throws a `JobError` with a short code and whether a retry could help. The runner retries while a retry could help and attempts remain; otherwise it calls `giveUp(payload, code)`, which marks the document `failed` with a reason. Anything else thrown counts as retryable. The runner stays generic and knows nothing of documents; a document is only marked failed when nothing more will be tried. Rejected: the job marking itself failed (it cannot tell its last attempt), and the runner knowing every kind's rows.

**`Document` needs `reason: string | null`**, null unless failed. Without it the builder sees "failed" and never why. Contract surface: asked of Furqaan.

**2. Retry only what could come out differently next time.**

| Failure | Code | Retry |
| --- | --- | --- |
| R2 or the database unavailable | `storage_unavailable` | yes |
| Muse Spark 429 or 5xx, or unreachable | `reader_unavailable` | yes |
| Muse Spark's answer unreadable, cut off, empty or refused | `unusable_answer` | yes |
| No claims at all (decision 4) | `no_claims` | yes |
| Muse Spark rejects the request (4xx other than 429) | `reader_rejected` | no |
| The stored PDF cannot be read | `unreadable_pdf` | no |

Three attempts, the jobs table's default. Lines the parser rejects are not a failure: the good claims are saved and the rejected ones logged by position and reason, never their text. On giving up, the builder reads one of:

- "We couldn't reach the document reader. Upload it again in a few minutes." (unavailable)
- "We couldn't read this document's lines reliably. Upload it again, or send a clearer PDF." (unusable answer)
- "We read this document but found no quantities in it. Check it's the right file." (no claims)
- "This PDF could not be read. Upload it again." (rejected or unreadable)

**3. Running twice changes nothing.** A job for a document already `done` or `failed` returns at once, without calling Muse Spark. Otherwise it marks the document `processing`, and saves in one transaction: delete the document's existing claims, insert the new ones, mark it `done`. A crash leaves the earlier state; a re-run replaces instead of doubling. Claims are only ever deleted for an unfinished document, and results are only computed for finished ones, so a result never loses its claim.

**4. Zero claims is a failure, retried, then given up as `no_claims`.** "Done, with nothing in it" would vanish from the report unquestioned. A document with genuinely nothing to count costs three reads (about 10 cents) and is told so.

**Rooms offered to the model** follow the projects ADR: a document with a flat is offered that flat's rooms; a whole-project document in a project with several flats is offered names qualified by flat ("302 / Bedroom 2"); with one flat, plain names.

## Consequences

- `MuseSparkError` keeps the HTTP status as a number, to tell a 400 from a 503.
- Until the `reason` column exists, a failed document records its status only; the reason is computed and tested but not stored.
- Furqaan's runner calls `run` and `giveUp`; the shape is proposed to him with this record.
