# Documents are uploaded through the API, checked on the way in; clips keep presigned links

**Date:** 27 October 2026
**Decided by:** William
**Status:** Accepted

## Context

The plan names a presigned-upload service: the browser gets a short-lived link and sends the file straight to R2, so the API never touches it. That suits video, which is large. For documents it fights two earlier decisions:

- **The jobs rule.** A row and its job are inserted in one transaction, so a document never exists without its extraction job. With a presigned link, either the job is queued before the file has arrived, or it waits for an "upload finished" call, leaving a document with no job in between.
- **Refusing unreadable input at upload.** With a presigned link the API never sees the file, so a scan is only discovered when the job runs, minutes later, as a failed status.

## Options

1. **PDFs go through the API**, which checks them, stores them in R2, then inserts the document and its job.
2. **A presigned link for documents too.**

## Decision

Option 1 for documents. Clips keep presigned links.

`POST /documents` takes a multipart form, `file`, `project_id`, `kind` and an optional `flat_id`, and checks, cheapest first:

1. The fields are present and `kind` is `demand_letter`, `invoice` or `boq`.
2. The file is at most 20 MB and is a PDF by its contents (it starts `%PDF-`), not by its name.
3. A demand letter or invoice has a flat, since it "bills one flat" (data contract). A BOQ may have one (that flat's BOQ) or none (the whole project).
4. The project exists and the flat belongs to it. Otherwise a plain 404, as on the status route, so ids cannot be probed.
5. Every page has a text layer. A scan is refused in the same response: "This looks like a scan. Send a PDF with selectable text."

Then it stores the file in R2 under a random key, and only after that inserts the document and its `extract_document` job in one transaction. The response is the contract's existing `Document`, with status `uploaded`, so no new contract type is needed; the UI polls `GET /documents/:id/status` from there.

## Consequences

- The jobs rule holds without a workaround: the file is in R2 before the row and its job exist.
- If R2 accepts the file and the transaction then fails, an object is left with no row pointing at it. It is private and under a random key, so it is harmless clutter. The reverse order would leave a row and a job pointing at a file that does not exist.
- PDFs pass through the API's memory. At 20 MB at most, and a sample BOQ of 150 KB, that is cheap; the body is capped before it is read.
- Clips have the timing problem this avoids, and it is settled when `POST /clips` is built.
- No auth yet: this route must not be deployed open.
