# Data contract

**Owner: Furqaan (lead).** Agreed by all three on the night of 26 October 2026, recorded here from the team plan. Apurva builds the UI against mock `Result`s from 27 October; Furqaan and William fill in the real ones by 30 October.

**This is the one signed artifact.** Code against it. Never widen it quietly — a field the frontend or the pipeline needs that is not here is a note to Furqaan, not a local addition. The TypeScript form lives in [`contract/src/index.ts`](../contract/src/index.ts) and is the same shapes, field for field.

## Shapes

```
Project { id, name, builder, flats[] }        Flat { id, name }
Room    { id, flat, name, qr_code }           // flat = the flat's id
Clip    { id, project_id, url, captured_at|null, status: uploaded|processing|done|failed }
Document { id, project_id, flat_id|null, kind: "demand_letter"|"invoice"|"boq",
           status: uploaded|processing|done|failed }                    // null flat = whole project (a BOQ)
Segment { clip_id, room_id|null, t_start, t_end, full_sweep: bool }     // null room = "unplaced"
ItemKind = "window" | "door"                                            // what v1 can count
Claim   { id, doc_id, item: ItemKind|"not_countable", qty, unit, room_id|null, source_quote, quote_verified: bool }
Detection { clip_id, room_id, item: ItemKind, track_id, best_frame_url, mask_url }
Result  { claim_id, counted, outcome: "verified"|"short"|"not_seen", room_covered: bool,
          evidence: [frame_url], note }
```

## API

| Method and path | What it does | Owner |
| --- | --- | --- |
| `POST /projects` | Create a project with its flats and rooms | William |
| `POST /clips` | Register a clip and hand back a presigned upload URL | William |
| `POST /documents` | Upload a demand letter, invoice or BOQ for extraction | William |
| `GET /clips/:id/status` | `uploaded` → `processing` → `done` / `failed`, for the upload UI to poll | William |
| `GET /documents/:id/status` | The `Document`, with the same statuses, so the UI can tell "still reading" from "done" from "failed". Its claims arrive in the report | William |
| `GET /projects/:id/report` | The report: claims, counts, results, evidence frames. No login needed for the buyer/bank view | Apurva |
| `POST /rooms/:id/request-footage` | Create a gap request from the coverage map | Apurva |

## What the shapes mean, and the rules attached to them

- **`Clip.captured_at` is null when the file carries no capture time** — WhatsApp may strip it. It is never filled in with the upload time; show it as "capture time unknown", never as a date.
- **`Document.flat_id` is null for a document that covers the whole project**, such as a BOQ. A demand letter or invoice bills one flat. Where the file is stored stays server-side and is never in the contract.
- **`Segment.room_id` is null for an unplaced segment** — a part of a clip that passed no room tag. Unplaced segments are stored, but are never used for a per-room claim.
- **`Segment.full_sweep`** is true only for one continuous stretch that starts at the room's QR tag and pans the whole room once in one direction, without panning back. It is what the coverage rule reads.
- **`Claim.item` and `Detection.item` are keys from `ItemKind`, never a document's wording** — that lives in `source_quote`. So a claim and its detections always join; free text would miss the join, read as 0, and in a covered room become a false Short. How an item becomes a SAM prompt is the pipeline's business.
- **A `"not_countable"` claim has no `Result`.** It is not checked in this version, and the report shows it in its own neutral style — never as Not seen yet, because no footage will clear it. A claim that asks for more than the BOQ holds also gets no `Result`, and goes to a person with both quotes.
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
- There is no shape yet for a **gap request** or a **query letter**, only the endpoints that produce them. Apurva and Furqaan to agree what comes back.
- ~~**A claim that is not countable in v1 has no `Result` row.**~~ Confirmed 27 Oct by Furqaan. Apurva to add the third visual state in the report view.
- ~~**`ItemKind`** is proposed but not yet in `contract/src/index.ts`.~~ Approved 27 Oct by Furqaan; in the contract.
- **Where a claim that exceeds the BOQ says so.** It has no `Result`, so the report needs another home for "exceeds the plan, sent to a person". Settled when the comparison engine is built (Furqaan).
- The **tolerance** the comparison engine applies. ~~And whether the BOQ quantity or the demand-letter quantity wins when they disagree.~~ Settled 27 Oct: the demand letter is judged and the BOQ is a ceiling ([ADR](decisions/2026-10-27-the-demand-letter-is-judged-and-the-boq-is-a-ceiling.md)). The engine needs the plan quantity per item and room, which the document side supplies.

## Revision

| Change | When | By |
| --- | --- | --- |
| Recorded from the team plan, as agreed on the night of 26 October | 27 October 2026 | William |
| `Flat` spelled out and `Room.flat` confirmed as an id; `Document` and `GET /documents/:id/status` added; `Clip.captured_at` may be null ([ADR](decisions/2026-10-27-contract-flat-document-and-capture-time.md)) | 27 October 2026 | Furqaan |
| `ItemKind` added; `Claim.item` and `Detection.item` draw from it ([ADR](decisions/2026-10-27-claim-item-is-a-closed-vocabulary-not-the-boq-wording.md)). Approved William's ADRs on the closed vocabulary, the demand letter judged against the BOQ as a ceiling, and refusing unreadable input in the gap-request voice | 27 October 2026 | Furqaan |
