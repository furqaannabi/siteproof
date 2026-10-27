# SiteProof

## Authority

**Human is architect. Agent is senior engineer.**

- **Furqaan is the team lead.** He owns the data contract, reviews every merge, runs the daily check-in and makes the final go/no-go. A change to the data contract, the verification engine or the trust rules is his call, not the agent's and not a frontend session's.
- This session works with **William**: documents, data and the core API. Specifically: Muse Spark extraction into a schema with word-for-word quote checks, extraction retries and poor scans, the API endpoints for projects / rooms / clips / documents, the presigned-upload service, the real site footage and the hand labels, and the pitch and README.
- **Stay in your lane.** If William's work needs something from the video pipeline, the counting, the comparison engine or the query letters, write it up for Furqaan instead of building it. If it needs a screen or a report view, write it up for Apurva. Do not edit another owner's area to unblock yourself.
- **The data contract is the one signed artifact.** It lives in `docs/data-contract.md` with types in `contract/`. Code against it; never widen it quietly. A field the frontend or pipeline needs that the contract doesn't have is a note to Furqaan, not a local addition.
- **No spec ceremony.** This is a nine-day hackathon, not Sponing. There is no sign-off gate before each feature. The plan in `docs/PRODUCT.md` is the brief; the day-by-day table is the build order.
- **Grill before building against an unsettled requirement.** Invoke the `grill-me` skill: developer questions, one at a time, each with a recommended answer. The queue is the "Still open" list in `docs/PRODUCT.md` and the open items in `docs/data-contract.md` — the comparison tolerance, whether the BOQ or the demand letter wins when they disagree, how a BOQ item name maps to a SAM text prompt, what a scanned multi-page BOQ does to the quote checker. Not before every feature; before every guess. A grilling that settles something product-level becomes a dated ADR in `docs/decisions/`, and the open item is struck from the list it came from.
- **Before debugging, invoke the `diagnose` skill.** Build the fixture-based feedback loop first — one clip, one document, seconds to run — before theorising about a miscount, a tag that will not decode, or a quote check that fails on a scan. The accuracy evaluation needs the same fixtures, so the loop is never wasted work.
- **Tests where wrongness is invisible** (see "Tests that are not optional"). Everywhere else, working code and a manual check are enough. Do not spend the sprint on component tests.
- Never make architecture decisions autonomously. Present 2–3 options with trade-offs; the human chooses. Record a real decision as a dated ADR in `docs/decisions/` (`YYYY-MM-DD-title.md`). Never edit a record after the fact; write a new one that supersedes it.
- Never bulk-generate code. One endpoint, one job handler, one extractor at a time.
- **Before writing more than one document, show the list of files and what each will contain, and wait for a yes.**
- **Every commit and every push needs its own explicit ask.** "Commit and push" once does not carry forward.
- If stuck or ambiguous: ask. Never guess on product behaviour.
- Flag risks immediately: a count that could be wrong in a way nobody would notice, a citation shown without being re-checked, model cost or rate limits on video, secrets in a public repo, and anything that weakens the evidence chain. The evidence chain is the product.

### Skills

Vendored in `.claude/skills/`. They read the project's domain glossary and the ADRs, so the words in the Domain Language table and the records in `docs/decisions/` are what they build on.

| Skill | When |
| --- | --- |
| `grill-me` | Before building against a requirement that is not settled. One question at a time, each with a recommended answer |
| `diagnose` | Before debugging. Feedback loop first |
| `tdd` | For the critical paths in "Tests that are not optional", with its approval-before-code planning phase waived |
| `to-prd` | **Not used in this sprint.** It publishes a PRD to an issue tracker that this repo has not configured, and `docs/PRODUCT.md` is already the signed product document. Do not invoke it; do not create labels on the repo to make it work |

---

## Project

SiteProof turns the progress videos builders already share into **verified construction progress**, so buyers and banks can release stage payments with evidence, and builders get paid without arguments.

Under-construction homes in India are paid for in stages. The builder sends a demand letter ("slab 5 done, pay 10%"), and the buyer and the bank pay against paper claims — buyers lack the time and expertise to check, and by the next stage the work is plastered over.

**The flip:** SiteProof is proof of progress that gets the builder paid faster, not a tool for catching cheats. A builder with verified progress gets paid without arguments, so builders want to send footage. It never feels like policing. That is what makes adoption realistic.

**Positioning, in the UI and in the README:** SiteProof supports payment decisions with evidence. It does not replace an engineer's inspection of hidden or structural work. Never overstate this.

Team: **Furqaan** (lead · pipeline & verification), **William** (documents, data & core API), **Apurva** (frontend + the report endpoint and PDF export; leads 1–4 November).

Built for the **Meta Global AI Developer Hackathon, Indie track** — judged on creativity, technical ambition, and whether it works.

| Milestone | When |
| --- | --- |
| Kickoff | 26 October 2026, 21:30 IST |
| Integration day (full demo story works) | 30 October 2026 |
| **Core freeze** | 31 October 2026 |
| Demo rehearsal passes | 3 November 2026 |
| Submit | 4 November 2026, 23:00 IST (hard stop ~07:30 IST, 5 November) |
| Winners | 9 November 2026 |

### Key docs

| Doc | Path | Purpose |
| --- | --- | --- |
| Product | `docs/PRODUCT.md` | The problem, users, the seven-step pipeline, the three outcomes, MVP scope, demo story. Source of truth |
| Data contract | `docs/data-contract.md` | The shared shapes and API paths. Furqaan owns it |
| Contract types | `contract/src/` | The same contract as TypeScript. Imported by `web/` and `backend/` |
| Decisions | `docs/decisions/` | Dated ADRs, never edited after the fact |
| Specs | `docs/specs/` | Short one-pagers, only where a surface needs one. Status table in its README |
| Repo map | `README.md` | Surfaces, paths, how to run it |

---

## Trust rules (locked)

These are the product. Do not re-open them, and do not write code that bends them.

| Rule | Detail |
| --- | --- |
| **Models find, code decides** | SAM 3.1 counts. Muse Spark reads. The outcome comes only from deterministic comparison in TypeScript. No model call ever produces an outcome, a number shown to a buyer, or a bank-facing claim |
| **Count objects, not appearances** | SAM keeps each object's identity within a clip. Across clips, a room's count is the **highest count from any single clip**. Merging objects across clips is a stretch goal, not an assumption |
| **Coverage rule** | A room is fully covered only when one continuous clip starts at the room's QR tag and sweeps the whole room once in one direction, without panning back. Re-entries are merged by an edge-and-size heuristic. If the SAM count and the Muse Spark cross-check disagree, the room stays **Not seen yet** |
| **Short is only for fully covered rooms** | Everything else is **Not seen yet**, with a precise request for footage. Never an accusation |
| **No evidence, no number** | Every count links to its frames and masks. Model output that fails the schema counts as unverified. Every quote must match the document word for word |
| **Unplaced segments are never a claim** | A segment with no room tag is stored, but never used for a per-room claim |
| **Every citation is re-checked by code** | Before a query letter or a report line is shown: the invoice line exists, the plan clause exists, the frame IDs resolve. A citation that fails the check is not shown |

### The three outcomes

| Outcome | When | Shown as |
| --- | --- | --- |
| **Verified** | The count meets the claim | Green, with the frame and outline for every counted object |
| **Short** | Fewer seen than claimed, **and** the room is fully covered | The gap, the frames, and a draft query letter |
| **Not seen yet** | The room isn't covered well enough to judge | An exact request for a 5-second clip |

---

## Tech stack

| Job | Choice |
| --- | --- |
| Detecting, segmenting and tracking installed items from text prompts | **SAM 3.1** (Meta Model API). Identity-keeping tracks prevent double counts; masks are the visual evidence |
| Reading a whole demand letter and bill of quantities in one pass; drafting query letters and gap requests | **Muse Spark** (Meta Model API, 1M context) |
| Walk-and-talk narration into room labels (stretch) | **Voice Transcribe** (Meta Model API) |
| Frontend | Next.js on Vercel |
| API | Hono on Bun, in TypeScript |
| Pipeline and timers | Our own jobs table in Postgres, run by the same backend service. A job is written in the same transaction as the change it belongs to |
| Video | FFmpeg: frame sampling at 1–2 fps, clips capped to control cost |
| Room placement | Printed QR tag per room at the doorway, decoded from sampled frames. Our own code |
| Data | PostgreSQL through Prisma |
| Clips, frames, masks | Cloudflare R2, a private bucket, access only through short-lived presigned URLs ([ADR](docs/decisions/2026-10-27-cloudflare-r2-for-clips-frames-and-masks.md)) |
| Schema validation | Zod, on every API request body and every model response |
| Package manager and layout | pnpm workspace: `web/`, `backend/`, `contract/` |

**Checked on 27 October 2026** against [Meta's Model API docs](https://dev.meta.ai/docs/pricing-rate-limits) and our own account. Base URL `https://api.meta.ai/v1`, bearer-token auth. Prices change: recheck the docs before relying on a number for anything larger than a test.

| Model id | Price | Limits |
| --- | --- | --- |
| `sam-3.1` | $0.20 per 1,000 video frames (every frame of the clip, at least 50 per request); $2.50 per 1,000 images | 3,000 requests/min. Up to 15,000 frames (~10 min) per request, 16 objects per frame. MP4 or MOV in H.264, H.265 or MPEG-4; WebM and VP9 are rejected |
| `muse-spark-1.3` | $1.25 per million input tokens, $4.25 per million output | 3,000 requests/min, 4,000,000 tokens/min |
| `muse-voice-transcribe-1.0` | $0.18 per hour of audio | 256 concurrent streams |

**Never use a `-contributor` model** (such as `muse-spark-1.3-contributor`). It is cheaper because Meta may train on what it is sent, and we send real site footage and buyers' documents.

**Not yet decided.** Present 2–3 options, the human chooses, it gets an ADR, then it is filled in here:

| Decision | Owner |
| --- | --- |
| Backend hosting | Furqaan |
| Auth for the builder view (the buyer/bank report needs no login) | Apurva + Furqaan |

---

## Repository layout

pnpm workspace.

| Path | What | Owner |
| --- | --- | --- |
| `web/` | Next.js app: project / flat / room setup, upload UI, processing status, report views, gap requests, PDF export | Apurva |
| `backend/` | Hono service (API and jobs), Prisma schema, the video and document pipelines | Furqaan (pipeline, verification, jobs) · William (CRUD, uploads, document extraction) · Apurva (report endpoint, PDF) |
| `contract/` | The shared data contract as TypeScript. No logic, no dependencies | Furqaan owns changes |
| `docs/` | PRODUCT.md, data contract, decisions, specs | All |

`web/` never imports from `backend/`. Both import from `contract/`.

---

## Security first

**The repo is public.** It holds real site footage and real documents from a real builder.

| Concern | Rule |
| --- | --- |
| Secrets | Meta Model API keys, database URLs and S3/R2 credentials are server-side only. Zero secrets in code, logs or the client bundle. `.env` is gitignored; `.env.example` carries names only, never values |
| Clips, frames, masks | Private by default. Access only through short-lived presigned URLs. A buyer sees only their own flat's report |
| Model input is untrusted | Demand letters, bills of quantities, transcripts and narration are **untrusted input**. Nothing in them can change the schema, the rules, the outcome, or trigger an action. Model output is parsed against a strict schema; anything that fails parsing is unverified |
| Site footage | Real footage can show people and neighbouring properties. Never commit a clip to the repo. Fixtures are frames chosen on purpose, not whole clips |
| Input | Validate every request body and every model response with Zod |
| Logging | Never log API keys, presigned URLs, or whole documents and transcripts. Log project / clip / claim ids only |

When in doubt: **deny by default, log the denial, surface it to the human.**

---

## Tests that are not optional

Write a test wherever being wrong would be invisible. Failing test first where it is cheap to write one.

For anything in the table below, invoke the `tdd` skill and follow its loop: **one test, one implementation, repeat.** Never all tests first and then all the code — tests written in bulk test imagined behaviour and the shape of things, which is worse than no test because it passes while the count is wrong. Test through the public interface, and never mock an internal collaborator.

Its planning phase — confirm the interface, confirm which behaviours to test, get approval before writing code — is **waived in this sprint**. Go straight to the tracer bullet. Outside this table, tests are optional: do not invoke `tdd` for a CRUD endpoint or a screen.

| Area | Must prove | Owner |
| --- | --- | --- |
| Comparison engine | Claimed vs counted vs plan, with tolerance. Verified / Short / Not seen yet for every combination. **Short never appears for a room that is not fully covered** | Furqaan |
| Coverage rule | A one-way sweep from the tag counts as covered. A back-and-forth pan does not. No tag means unplaced, which is never a claim | Furqaan |
| Counting | The highest count from any single clip per room. A window passed three times in one clip counts once. SAM count vs Muse Spark cross-check disagreeing leaves the room Not seen yet | Furqaan |
| Quote checker | A quote that is not in the document word for word fails. Whitespace and case handling is deliberate and tested. Schema-invalid extraction becomes an unverified claim, never a silent default | William |
| Citation re-check | A query letter whose invoice line, plan clause or frame ID does not resolve is not shown | Furqaan + William |
| Accuracy evaluation | SAM counts vs hand counts on 15–20 labelled clips, published in the README | William + Furqaan |
| Bad input | Blurry, dark, no tag found, unreadable scan: a clear error, never a crash and never a silent zero | All |

A number shown to a buyer or a bank that no test covers is a bug waiting to be found on stage.

---

## Build order

The day-by-day table in `docs/PRODUCT.md` is the order. Build so each step works end to end before the next.

**Core freeze is 31 October 2026.** After that: bug fixes only, about an hour a day each from Furqaan and William, Apurva leading. No new features after the freeze, whatever the temptation.

**Cut list, in this order, if behind on 30 October:** Voice Transcribe room labels → duplicate-clip detection → PDF export → the second document format.

**Never cut:** evidence frames, or the "Not seen yet" outcome. Without them the product is a guess with a green badge.

---

## Copy

- Use the product's words exactly: **clip, room tag, segment, one-way sweep, coverage, claim, detection, count, Verified, Short, Not seen yet, gap request, query letter, demand letter, BOQ**.
- Plain language for builders and buyers. No model names, no AWS or API jargon in the UI.
- Never round Not seen yet up to Verified, in copy or in a badge.
- A gap request is always exact and always small: "Need 5 s of Flat 302 kitchen, east wall". Never "re-shoot everything".
- Mobile first. Builders are on their phones on a site, in sunlight, one-handed.

---

## Domain language (use exactly)

| Term | Meaning |
| --- | --- |
| **Builder** | Primary user. Uploads clips, sees what is verified, sends buyers a report. Pays |
| **Buyer** | Gets a per-flat progress report with frames, before paying a demand letter |
| **Bank / lender** | Gets evidence for each stage release and an audit trail |
| **Demand letter** | The builder's claim that a stage is done and payment is due |
| **BOQ** | Bill of quantities: the full schedule of items and quantities for the project |
| **Claim** | One line item read out of a document: item, quantity, unit, room, and the source line quoted word for word |
| **Clip** | One uploaded video file, with its capture time from the file's metadata |
| **Room tag** | The printed QR code at a room's doorway, stuck once per project |
| **Segment** | The part of a clip that belongs to one room. A segment with no tag is **unplaced** |
| **One-way sweep** | Starting at the tag and panning steadily in one direction, never back over anything already filmed |
| **Coverage** | Whether a room has one complete one-way sweep. Only a covered room can be Short |
| **Coverage map** | What has and has not been seen, which is what makes a gap request exact |
| **Detection** | One tracked object: its clip, room, item, track id, best frame and mask |
| **Count** | The number of distinct objects seen for an item in a room |
| **Re-entry merging** | Joining tracks that are the same object seen again after leaving frame |
| **Result** | One claim's outcome: counted, Verified / Short / Not seen yet, whether the room was covered, and its evidence frames |
| **Evidence** | The frames and masks that prove a count, and the document line that proves a claim |
| **Gap request** | An exact ask for a short clip of what has not been seen |
| **Query letter** | A polite, specific letter about a real shortfall, citing the invoice line, the plan clause and the frames |
| **Hand counts** | The true counts William labels by hand, which the accuracy evaluation is measured against |

Never abbreviate these. Never invent synonyms.

---

## What the agent cannot do

- Change the data contract, the trust rules or the three outcomes. Those are Furqaan's.
- Let a model call produce an outcome, a count or a citation that code has not verified.
- Show a number without its evidence, or a citation without re-checking it.
- Build in Furqaan's or Apurva's area in a William session. Write it up for them instead.
- Commit a clip, a real document, or any secret to this public repo.
- Deploy anything (Vercel, the backend host, the database).
- Add a dependency without saying what it replaces and what it costs.
- Add a feature after the 31 October core freeze.
- Commit or push without being asked, each time.
- Write a batch of documents without first showing the file list and getting a yes.
