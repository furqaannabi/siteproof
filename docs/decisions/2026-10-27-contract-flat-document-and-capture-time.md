# The contract gains a Document, spells out Flat, and lets a clip's capture time be unknown

**Date:** 27 October 2026
**Decided by:** Furqaan
**Status:** Accepted

## Context

The contract locked on 26 October left four gaps that block the Prisma schema and William's document endpoints:

- `Project.flats[]` implies a `Flat` that is never spelled out, and `Room.flat` could be read as an id or a name.
- `Claim.doc_id` points at a document and `POST /documents` creates one, but there is no `Document` shape.
- Once a document is uploaded, nothing tells the UI when its extraction has finished.
- `Clip.captured_at` is a required string, but a clip forwarded through WhatsApp may carry no capture time at all: WhatsApp re-encodes video and may strip the metadata. Ingest (`backend/src/pipeline/ingest.ts`) already returns `null` in that case rather than inventing one.

## Options

**Flat.** (1) `{ id, name }`, with `Room.flat` the flat's id; (2) add a tower and floor; (3) drop `Flat` and give rooms a free-text flat label.

**Document.** (1) Mirror `Clip`: `{ id, project_id, flat_id | null, kind, status }`; (2) only `{ id, project_id, kind }`; (3) the first plus filename and page count.

**Extraction status.** (1) A `GET /documents/:id/status` beside the clip one; (2) only the report, polled until claims appear; (3) a `GET /documents/:id` returning status and claims together.

**Missing capture time.** (1) `captured_at: string | null`; (2) reject the clip; (3) fall back to the upload time, with a flag saying so.

## Decision

- **`Flat { id, name }`**, and **`Room.flat` is the flat's id.** The database also gives a flat its project id; the contract does not need it, because `Project.flats[]` already says which project a flat belongs to. A tower or floor waits until a project needs one — the MVP is one flat.
- **`Document { id, project_id, flat_id | null, kind: "demand_letter" | "invoice" | "boq", status: ClipStatus }`.** A BOQ covers the project, so its `flat_id` is null; a demand letter or invoice bills one flat. The status is the same `uploaded → processing → done / failed` as a clip, so the UI polls both the same way. Where the file is stored stays server-side and never appears in the contract. No filename: it is the builder's own text, untrusted, and nothing needs it yet.
- **`GET /documents/:id/status`** returns the `Document`. Claims still arrive through `GET /projects/:id/report`, so there is one place they come from. Polling only the report was rejected because it cannot tell "still reading" from "read it, found no claims" from "failed".
- **`Clip.captured_at` is `string | null`.** Null means the file carried no capture time. It is never filled in with the upload time: an upload time shown as a capture time would let last month's footage pass as this week's. Rejecting such clips was ruled out because it could reject every clip forwarded through WhatsApp, which is the demo story.

## Consequences

- `web/` must handle `captured_at: null` and show it as "capture time unknown", never as a date.
- William builds `GET /documents/:id/status` alongside `POST /documents`; the extraction job sets the document's status.
- `Flat` and `Room.flat` are no longer open items on the contract; anything that needs more on a flat is a new contract change.
- A clip with no capture time can still be counted. Whether it can support a claim on a dated demand letter is a question for the comparison engine, not settled here.
