# Data contract

**Owner: Furqaan (lead).** Agreed by all three on the night of 26 October 2026, recorded here from the team plan. Apurva builds the UI against mock `Result`s from 27 October; Furqaan and William fill in the real ones by 30 October.

**This is the one signed artifact.** Code against it. Never widen it quietly — a field the frontend or the pipeline needs that is not here is a note to Furqaan, not a local addition. The TypeScript form lives in [`contract/src/index.ts`](../contract/src/index.ts) and is the same shapes, field for field.

## Shapes

```
Project { id, name, builder, flats[] }        Flat { id, name }
Room    { id, flat, name, qr_code }           // flat = the flat's id
Clip    { id, project_id, url, captured_at|null, status: uploaded|processing|done|failed }
Document { id, project_id, flat_id|null, kind: "demand_letter"|"invoice"|"boq",
           status: uploaded|processing|done|failed, reason|null }       // null flat = whole project (a BOQ)
Segment { clip_id, room_id|null, t_start, t_end, full_sweep: bool }     // null room = "unplaced"
ItemKind = "window" | "door"                                            // what v1 can count
Claim   { id, doc_id, item: ItemKind|"not_countable", qty, unit|null, room_id|null, source_quote, quote_verified: bool }
Detection { clip_id, room_id, item: ItemKind, track_id, best_frame_url, mask_url }
Result  { claim_id, counted, outcome: "verified"|"short"|"not_seen", room_covered: bool,
          evidence: [frame_url], note }

CreateProject     { name, builder, flats: [{ name, rooms: [{ name }] }] }   // POST /projects body
CreatedProject    { project: Project, rooms: Room[] }                        // POST /projects reply
ClipUploadRequest { project_id, content_type: "video/mp4"|"video/quicktime" } // POST /clips body
ClipUpload        { upload_url, ticket, expires_at }                         // POST /clips reply
CompleteClip      { ticket }                                                 // POST /clips/complete body → Clip
ProjectLinks      { builder_token, report_tokens: [{ flat_id, token }] }     // GET /projects/:id/links

NotChecked      { claim_id, reason: "not_countable"|"exceeds_plan" }
GapRequest      { id, room_id, text, steps[], status: "open"|"sent"|"cleared" }
QueryLetter     { id, claim_id, body,
                  citations: { invoice_claim_id, plan_claim_id|null, evidence: [frame_url] } }
Report          { project: { id, name, builder }, flat, rooms[], documents[], claims[],
                  results[], not_checked[], detections[], segments[], gap_requests[], query_letters[] }
ProjectOverview { project, rooms[], documents[], clips[] }                  // the builder's whole project
```

## API

| Method and path | What it does | Owner |
| --- | --- | --- |
| `POST /projects` | Create a project with its flats and rooms; returns every room with its tag code | William |
| `POST /clips` | Hand back a link to upload one video to and a signed ticket. Saves nothing | William |
| `POST /clips/complete` | Register the uploaded clip by its ticket, once the video is confirmed in storage, and queue its ingest job. The same ticket again returns the same clip | William |
| `POST /documents` | Upload a demand letter, invoice or BOQ for extraction | William |
| `GET /clips/:id/status` | `uploaded` → `processing` → `done` / `failed`, for the upload UI to poll | William |
| `GET /documents/:id/status` | The `Document`, with the same statuses, so the UI can tell "still reading" from "done" from "failed". Its claims arrive in the report | William |
| `GET /projects/:id/links` | The project's builder link and each flat's report link. Answers only the team's setup key or the project's own builder link | Furqaan |
| `GET /projects/:id` | The builder's `ProjectOverview`: every flat, room, document and clip with its status. Builder link | Furqaan |
| `GET /flats/:id/report` | One flat's `Report`, for its builder. Builder link | Furqaan |
| `GET /reports/:token` | One flat's `Report`, for its buyer and bank. The report link is the token: no login | Furqaan |
| `GET /projects/:id/report` | Replaced by the three above; kept only until the web app has moved to them | — |
| `POST /rooms/:id/request-footage` | Create a `GapRequest` from the coverage map. Builder link | Apurva |

## Who may call what

Every request carries its key as `Authorization: Bearer <token>` ([ADR](decisions/2026-10-28-builder-access-by-secret-links-accepted.md)).

- **`POST /projects`** needs the team's setup key. Nobody else can create a project.
- **Every other builder route** — clips, documents, their statuses, a project's links — needs that project's builder link. No link, or a link that isn't valid, is `401`; a valid link for a different project is `404`, the same as a project that does not exist.
- **At most 30 clips per project in any 24 hours.** `POST /clips` and `POST /clips/complete` answer `429` with `{ error: "daily_limit", message }` past that; completing a clip already registered still answers, since it costs nothing new.
- **A report link** opens one flat's report and nothing else; it never opens a builder route.
- Links never expire. Replacing one cuts off everyone who held it.

## What the shapes mean, and the rules attached to them

- **`Clip.captured_at` is null when the file carries no capture time** — WhatsApp may strip it. It is never filled in with the upload time; show it as "capture time unknown", never as a date.
- **`Document.flat_id` is null for a document that covers the whole project**, such as a BOQ. A demand letter or invoice bills one flat. Where the file is stored stays server-side and is never in the contract.
- **`Document.reason` is null unless the document failed.** Then it says why in plain words a builder can act on, chosen by code from a fixed list — never written by a model, never quoting the document.
- **A `Report` holds one flat and nothing of any other.** Its rooms; the documents that bill it plus the project's BOQ; the claims, results, detections and segments for its rooms; evidence frames rather than whole clips, which can show other flats, people and neighbours. No list of the project's other flats. A buyer and a bank see exactly what the builder sees for that flat.
- **Every claim in a `Report` is either judged or explained.** It has a `Result`, or a `NotChecked` saying why not. The UI never infers "not checked" from a missing `Result`, and never shows either reason as Not seen yet.
- **A `QueryLetter` in a response has had every citation re-checked**: the invoice line and plan line exist, the frames resolve. One that fails is not sent at all, so there is no flag to read. Every number in its `body` was put there by code from the `Result`; Muse Spark writes only the wording around them.
- **A `GapRequest` is exact and small**, and becomes `cleared` when footage covering the room arrives.
- **No stage label** ("Stage 6") is in the report: a label read off a demand letter is a claim shown to a bank with no checked quote behind it. The demand letter's own claims, with their verified quotes, say what is billed.
- **A clip is registered only once its video is in storage.** `POST /clips` saves nothing, so a clip and its ingest job are written together, never one without the other.
- **`Segment.room_id` is null for an unplaced segment** — a part of a clip that passed no room tag. Unplaced segments are stored, but are never used for a per-room claim.
- **`Segment.full_sweep`** is true only for one continuous stretch that starts at the room's QR tag and pans the whole room once in one direction, without panning back. It is what the coverage rule reads.
- **`Claim.item` and `Detection.item` are keys from `ItemKind`, never a document's wording** — that lives in `source_quote`. So a claim and its detections always join; free text would miss the join, read as 0, and in a covered room become a false Short. How an item becomes a SAM prompt is the pipeline's business.
- **A `"not_countable"` claim has no `Result`.** It is not checked in this version, and the report shows it in its own neutral style — never as Not seen yet, because no footage will clear it. A claim that asks for more than the BOQ holds also gets no `Result`, and goes to a person with both quotes.
- **`Claim.unit` is null where the document states no unit**, as a demand letter's "Windows complete: 12" does. It is never filled in (a "nos" the document never printed could not be told apart from one it did); show no unit, never the text "null". The engine compares counts and never reads it.
- **`Claim.quote_verified`** is set by code, not by a model: it is true only when `source_quote` appears in the source document word for word. A claim with `quote_verified: false` is an unverified claim and is never shown as a number.
- **`Detection.track_id`** is SAM's identity for one object within one clip. Objects are counted, not appearances.
- **`Result.counted`** is the highest count from any single clip for that room and item. Merging the same object across clips is a stretch goal.
- **`Result.outcome`** comes only from deterministic comparison. `"short"` is allowed only when `room_covered` is true; everything else is `"not_seen"`.
- **`Result.evidence`** is never empty for a counted object. No evidence, no number.

## Open on this contract

Flag these to Furqaan rather than deciding them in code:

- ~~**`Flat`** is implied by `Project.flats[]` but never spelled out.~~ Settled 27 Oct: `{ id, name }`.
- ~~**`Room.flat`** is a flat id in the type as written.~~ Settled 27 Oct: it is the flat's id.
- `Claim.qty` / `Result.counted` units: whole objects for windows and doors in the MVP. Area items (tiles, plaster, paint) are post-hackathon and will need a unit on the count.
- ~~There is no shape yet for a **gap request** or a **query letter**.~~ Settled 28 Oct: `GapRequest`, `QueryLetter`.
- ~~**A claim that is not countable in v1 has no `Result` row.**~~ Confirmed 27 Oct by Furqaan. Apurva to add the third visual state in the report view.
- ~~**`ItemKind`** is proposed but not yet in `contract/src/index.ts`.~~ Approved 27 Oct by Furqaan; in the contract.
- ~~**Where a claim that exceeds the BOQ says so.**~~ Settled 28 Oct: `Report.not_checked`, reason `exceeds_plan`.
- The **tolerance** the comparison engine applies. ~~And whether the BOQ quantity or the demand-letter quantity wins when they disagree.~~ Settled 27 Oct: the demand letter is judged and the BOQ is a ceiling ([ADR](decisions/2026-10-27-the-demand-letter-is-judged-and-the-boq-is-a-ceiling.md)). The engine needs the plan quantity per item and room, which the document side supplies.

## Revision

| Change | When | By |
| --- | --- | --- |
| Recorded from the team plan, as agreed on the night of 26 October | 27 October 2026 | William |
| `Flat` spelled out and `Room.flat` confirmed as an id; `Document` and `GET /documents/:id/status` added; `Clip.captured_at` may be null ([ADR](decisions/2026-10-27-contract-flat-document-and-capture-time.md)) | 27 October 2026 | Furqaan |
| `ItemKind` added; `Claim.item` and `Detection.item` draw from it ([ADR](decisions/2026-10-27-claim-item-is-a-closed-vocabulary-not-the-boq-wording.md)). Approved William's ADRs on the closed vocabulary, the demand letter judged against the BOQ as a ceiling, and refusing unreadable input in the gap-request voice | 27 October 2026 | Furqaan |
| `Claim.unit` may be null, where the document states no unit — found running real Muse Spark output on a demand letter | 27 October 2026 | Furqaan |
| Builder routes need the project's builder link, `POST /projects` the setup key; `ProjectLinks` and `GET /projects/:id/links` added | 28 October 2026 | Furqaan |
| The report becomes per flat and buyer-safe (`Report`, `GET /flats/:id/report`, `GET /reports/:token`), with `NotChecked`; `ProjectOverview` and `GET /projects/:id` for the builder; `GapRequest` and `QueryLetter` settled, from Apurva's proposal in `web/lib/types.ts` ([ADR](decisions/2026-10-28-the-report-is-per-flat-and-every-claim-is-judged-or-explained.md)) | 28 October 2026 | Furqaan |
| `Document.reason` added. `CreateProject` and `CreatedProject` for `POST /projects` ([ADR](decisions/2026-10-27-creating-a-project-returns-its-rooms-and-their-qr-codes.md)). Clips upload in two steps: `POST /clips` returns a link and a ticket, `POST /clips/complete` registers the clip ([ADR](decisions/2026-10-27-clips-upload-in-two-steps-with-a-signed-ticket.md)) | 28 October 2026 | Furqaan |
