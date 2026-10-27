# SiteProof — Product

Source of truth. Recorded from the team plan for Furqaan, William and Apurva (SiteProof team plan, 26 October 2026), which itself revised the SiteProof project plan of 24 October 2026 and an external review of it. Changes in that revision: the Indie track, a three-person split, a concrete coverage rule, an accuracy evaluation, and a core freeze on 31 October.

> Model names and limits were to be checked against Meta's Model API docs at kickoff. Treat any number here that is not measured as unverified.

## 1. One line

SiteProof turns the progress videos builders already share into **verified construction progress**, so buyers and banks can release stage payments with evidence, and builders get paid without arguments.

## 2. The problem

| Who | What goes wrong today |
| --- | --- |
| **Home buyers** | Under-construction homes in India are paid for in stages under construction-linked plans. The builder sends a demand letter ("slab 5 done, pay 10%"), and the buyer pays. Buyers lack the expertise and the time to check, and by the next stage the work is plastered over |
| **Home-loan banks** | Banks release the loan in stages against the same demand letters. Their engineers visit occasionally, so most stage payments go out on paper claims |
| **Builders** | They spend weeks chasing payments and answering "is it really done?" in buyer WhatsApp groups. Honest builders are slowed down by the distrust that dishonest ones create |

**The flip.** SiteProof is proof of progress that gets the builder paid faster, not a tool for catching cheats. A builder with verified progress gets paid without arguments, so builders want to send footage, and it never feels like policing. That is what makes adoption realistic.

## 3. Users and who pays

| User | What they get | Business model |
| --- | --- | --- |
| **Builder** (primary) | Upload clips, see what is verified, get told exactly which 5-second shots would clear the rest, and send buyers a verified progress report | Subscription per project or per flat. Faster collections pay for it |
| **Buyer** | A per-flat progress report with frames for every verified item, before paying a demand letter | Free (builder-paid), or a small fee per independent report |
| **Bank / lender** | Evidence for each stage release, an audit trail, and fewer site visits for engineers | Fee per verified stage or per loan file (B2B) |

## 4. Capture without effort

The builder never films "for SiteProof". Any footage they already make works.

| Mode | What the builder does | How SiteProof copes |
| --- | --- | --- |
| 1. Forward existing clips | Upload the progress videos they already post in the buyers' WhatsApp group | Accepts shaky, partial clips in any order. Uses each file's own capture time |
| 2. Room tags | Stick one printed QR tag per room at the doorway, once per project | Any clip that passes a tag is placed automatically ("Flat 302 · Bedroom 2") |
| 3. Talk while walking (stretch) | Say what they are looking at: "this is 302, windows done" | Voice Transcribe turns Hindi or English speech into room labels and claims to check |
| 4. Fill gaps on request | Only when needed: "Need 5 s of Flat 302 kitchen, east wall" | A coverage map shows what has not been seen, so requests are exact, never "re-shoot everything" |

## 5. How it works: the seven-step pipeline

Inputs: clips · demand letter · BOQ

`1 Ingest → 2 Locate → 3 Read docs → 4 Count → 5 Compare → 6 Report → 7 Track`

| Step | What happens | Tech |
| --- | --- | --- |
| **1. Ingest** | Store each clip with its capture time from the file's metadata. Sample frames at 1–2 fps. Cap clip length to control cost | FFmpeg, S3/R2, jobs table |
| **2. Locate** | Decode the QR room tags in frames to split each clip into room segments. Detect one-way sweeps (start at the tag, pan steadily in one direction, never back over anything already filmed). Segments with no tag are **unplaced**: stored, never used for a per-room claim | QR decoder, own code |
| **3. Read documents** | Muse Spark reads the demand letter or invoice and the full bill of quantities in one call (1M-token context). Out come structured line items: item, quantity, unit, room or stage, and the source line quoted word for word. Code checks every quote exists in the document | Muse Spark, schema validation |
| **4. Count** | Each claimed item becomes a SAM 3.1 text prompt ("window frame", "door"). SAM's video tracks keep each object's identity within a clip, so a window passed three times counts once. Across clips, the room's count is the highest from any single clip | SAM 3.1 |
| **5. Compare** | Deterministic code, no model: claimed vs counted vs plan, with a tolerance and the coverage rule. Each result carries its evidence: the best frame and mask for every counted object | TypeScript |
| **6. Report** | Buyer/bank view: what is verified, with frames. Builder view: what is verified and exactly which shots would clear the rest. A real shortfall gets a polite, specific query letter citing the invoice line, plan clause and frames, with every citation re-checked by code. Exportable as a PDF | Next.js, Muse Spark, PDF export |
| **7. Track over time** | Weekly footage builds a timeline per room, so nothing is billed twice, and hidden work (rebar before the pour) is recorded while it is still visible | Post-hackathon |

## 6. The three outcomes

| Outcome | When | Shown as |
| --- | --- | --- |
| **Verified** | The count meets the claim | Green, with the frame and outline for every counted object |
| **Short** | Fewer seen than claimed, **and** the room is fully covered (one complete one-way sweep from the tag) | The gap, the frames, and a draft query letter |
| **Not seen yet** | The room is not covered well enough to judge | An exact request for a 5-second clip. Never an accusation |

## 7. Trust rules everyone codes to

1. **Models find, code decides.** SAM counts and Muse Spark reads. The outcome comes only from deterministic comparison.
2. **Count objects, not appearances.** SAM keeps each object's identity within a clip. Across clips, use the highest count from any single clip per room. Merging objects across clips is a stretch goal.
3. **Coverage rule.** A room is fully covered only when one continuous clip starts at the room's QR tag and sweeps the whole room once in one direction, without panning back. SAM 3.1 only keeps an object's ID while it stays in frame, so panning back can mint a new ID and double-count. Re-entries are merged by an edge-and-size heuristic, and if the SAM count and a Muse Spark cross-check disagree, the room stays **Not seen yet**. **Short** is only allowed for fully covered rooms; everything else is **Not seen yet**, with a precise request for footage.
4. **No evidence, no number.** Every count links to frames and masks. Model output that fails the schema counts as unverified, and every quote must match the document word for word.

**Positioning.** SiteProof supports payment decisions with evidence. It does not replace an engineer's inspection of hidden or structural work.

## 8. MVP scope vs later

**In the hackathon MVP**

- One project, one flat, one demand letter and BOQ
- Countable items: windows and doors
- Upload link for clips; QR room tags; one-way sweeps
- Muse Spark extraction with word-for-word quote checks
- SAM 3.1 counting with evidence frames and masks
- Three outcomes, gap requests, query letters
- Builder and buyer/bank views, PDF report
- Accuracy measured against hand counts

**Later (pitched as the roadmap)**

- WhatsApp Business forwarding as the main channel
- Area items: tiles, plaster, paint (mask area × scale)
- Duplicate and reused-clip detection by frame fingerprint
- Merging the same object across different clips
- Weekly timelines and hidden-work records
- Bank integrations for stage releases
- Hands-free capture with smart glasses
- Photos kept as attached context on a room, shown in the report but never counted
- OCR for scanned and photographed documents

## 9. Demo story (2 minutes)

1. The builder uploads three shaky WhatsApp clips of Flat 302. Nothing is staged.
2. SiteProof places them by room from the door tags.
3. The demand letter claims "windows complete: 12". SiteProof shows 9 tracked windows, each outlined. Bedroom 2 is fully covered and is **Short by 2**. The kitchen is **Not seen yet**, with a request for 5 seconds of footage.
4. The builder sends a 5-second kitchen clip, and one more window is **Verified**.
5. The final report shows 10 of 12 verified, with a query letter citing the invoice line, the plan clause and the frames. The bank view shows exactly what it can release against.

## 10. Meta models used

| Model | Job in SiteProof |
| --- | --- |
| **SAM 3.1** | Detecting, segmenting and tracking installed items from text prompts. Identity-keeping tracks prevent double counts. Masks are the visual evidence |
| **Muse Spark** | Reading whole demand letters and bills of quantities in one pass (1M context), extracting claims to a schema, writing query letters and gap requests |
| **Voice Transcribe** (stretch) | Turning walk-and-talk narration (Hindi or English) into room labels and claims to check |

## 11. Why it fits the Indie track

Indie entries are judged on creativity, technical ambition, and whether it works.

- **Creativity:** it turns the messy WhatsApp clips builders already send into evidence. Nobody films anything new, and the system is framed as getting builders paid faster, not policing them.
- **Technical ambition:** three Meta models in one pipeline. SAM 3.1 tracks and counts objects across shaky video, Muse Spark reads whole contracts in one pass, and deterministic code verifies every count and citation. Re-entry merging and a Muse Spark cross-check handle the hard part: double counting.
- **It works:** a live, deployed app that runs the full demo story end to end on real site footage, with counting accuracy measured against hand counts.
- **A real problem:** stage payments for under-construction homes in India, where buyers and banks pay on paper claims.
- **Honest positioning:** SiteProof supports payment decisions with evidence. It does not replace an engineer's inspection of hidden or structural work.

---

## 12. Roles

**Furqaan — lead · pipeline and verification.** Owns the data contract, reviews merges, runs the daily check-in, makes the final go/no-go. Confirms API access, limits and cost for SAM 3.1 and Muse Spark. The SAM spike. The video pipeline: FFmpeg frame sampling, QR decoding, room segments, one-way sweep detection, re-entry merging. Counting per room. The coverage rule and the deterministic comparison engine. Muse Spark query letters with every citation re-checked in code. Jobs table, retries, timeouts, backend deployment. Runs the accuracy evaluation against William's labels. Stretch: duplicate-clip fingerprints.

**William — documents, data and the core API.** Prints the QR room tags. Shoots real site footage, including messy clips, one-way sweeps and a deliberate back-and-forth pan. Writes the sample demand letter, invoice and bill of quantities. Muse Spark extraction into a schema with word-for-word quote checks. Extraction retries and handling for scanned or poor-quality documents. API endpoints for projects, rooms, clips and documents. The presigned-upload service (S3/R2) and clip registration. Hand-labels 15–20 clips with true counts for the accuracy evaluation. The short "who it's for" pitch and the README draft, by 31 October.

**Apurva — frontend, plus one AI feature and one backend service.** The Next.js app, auth, project / flat / room setup, design system. Upload UI and processing status. The report view with annotated frames and masks and the three outcomes, in builder and buyer/bank views. Gap-request text from the coverage map. The report endpoint and server-side PDF export. Stretch: Voice Transcribe room labels. Frontend deployment (Vercel), mobile layout, polish. Leads 1–4 November: demo script, rehearsal, video recording and editing, submission.

## 13. Day by day (26 October – 4 November 2026)

| Day | Furqaan | William | Apurva | Checkpoint |
| --- | --- | --- | --- | --- |
| **Sun 26** | Kickoff 21:30 IST. Get API keys. Test calls to SAM 3.1 (one image, one short video) and Muse Spark. Note rate limits and cost per minute of video | Read the official rules (team size and student conditions for Indie). Print QR tags. Book a site visit. Draft the sample demand letter and BOQ | Repo and monorepo setup. Next.js scaffold, design system, page wireframes | **All:** lock the data contract |
| **Mon 27** | SAM spike: count windows in one real clip, check tracks hold through a shaky pan. Try frame sampling rates | Shoot footage: 3 messy WhatsApp-style clips, one-way sweeps for 2 rooms, one deliberate back-and-forth pan. Muse Spark extraction schema v1 | Project, flat and room setup screens. Upload UI against a mock. Mock report data | Evening go/no-go on SAM counting |
| **Tue 28** | Video pipeline: FFmpeg sampling, QR decoding, room segments, one-way sweep detection, re-entry merging. Jobs table. Query-letter generator v1 with citation re-check | Word-for-word quote checker. API endpoints for projects, clips and documents. Presigned-upload service | Report view on mock data: claims, counts, frames with mask overlays, outcome badges. Gap-request prompt v1 on a mock coverage map | — |
| **Wed 29** | Per-room counting (highest count per clip). Comparison engine, the three outcomes, the coverage rule | Hand-label true counts (ground truth). Second document format. Extraction retries and poor-scan handling. Seed demo data | Wire upload → job → status polling → report on the real API. Report endpoint | — |
| **Thu 30** | **All: integration day.** Three clips + one demand letter → room placement → counts → outcomes → report with frames → query letter. Fix any contract mismatches | | | The full demo story works |
| **Fri 31** | Run the accuracy evaluation against William's labels. Error handling (blurry, dark, no tag found). Deploy the backend. Final review of every merge | The accuracy table and the "who it's for" pitch for the README. README draft. Shoot the "fill the gap" kitchen clip for the demo | Builder and buyer views, gap-request generation from the coverage map, server-side PDF export. Deploy the frontend. Mobile pass | **Core freeze.** Deployed URL works |
| **Sat 1** | Core frozen. ~1 hour a day each for bug fixes | Core frozen. ~1 hour a day each for bug fixes | Lead. UI polish, finalize the README with screenshots and "try it" steps | Daily 15-min check-in |
| **Sun 2** | On call for fixes | On call for fixes | Demo script and storyboard. Stretch: Voice Transcribe room labels if the core is stable | Apurva reports |
| **Mon 3** | Review the README technical sections (30 min) | Review the README technical sections (30 min) | Rehearse the demo end to end on the deployed app. Freeze any changes | Demo rehearsal passes |
| **Tue 4** | Watch the video draft, go/no-go (30 min) | Watch the video draft, go/no-go (30 min) | Record and edit the 2-minute video. Submit by 23:00 IST | **All: go/no-go before submitting** |

## 14. Cut list and risks

| If… | Then… | Owner |
| --- | --- | --- |
| SAM cannot count reliably on shaky video (27 Oct) | Use fixed frame sampling plus per-frame detections, keeping the highest count per room segment. Insist on slow one-way sweeps. If it still fails, switch to doors-only or use cleaner footage | Furqaan |
| API rate limits or cost on video | Sample 1–2 fps, cap clips at 60 s, cache results per clip | Furqaan |
| Muse Spark misreads the documents | A strict schema with retries. Anything without a word-for-word quote becomes an unverified claim | William |
| Behind schedule on 30 Oct | Cut in this order: Voice labels → duplicate-clip detection → PDF export → second document format. **Never cut evidence frames or "Not seen yet"** | All |
| The Indie rules limit team size (the page says "individual builders and students") | Check the official rules on 26 Oct. If teams are not allowed on Indie, one person submits as the builder and the others are credited as contributors, or ask the organizers which track a three-person team should use | William |
| Bugs found 1–4 Nov | Core frozen 31 Oct. Apurva logs issues in one list; Furqaan and William each fix for an hour a day | All |

## 15. Indie-track judging checklist

| Criterion | How we show it | Owner |
| --- | --- | --- |
| **It works** | Live deployed URL with the demo project, working on mobile, no login needed to view the report | Apurva |
| | The full demo story runs end to end on real footage, and bad input (blur, dark, no tag) gives clear errors, not crashes | Furqaan |
| **Technical ambition** | SAM 3.1 counting with re-entry merging and a Muse Spark cross-check | Furqaan |
| | Measured accuracy: SAM counts vs hand counts on 15–20 clips, published in the README | William + Furqaan |
| | Every number backed by frames, and every citation checked by code | All |
| **Creativity** | The "builder just forwards WhatsApp clips" story, and the gap request that clears "Not seen yet" live in the demo | Apurva |
| | Polished report UI: outlined objects, the three outcomes, builder and buyer views | Apurva |
| **Presentation** | A 2-minute demo video following the demo story, plus a clear README with "try it" steps, submitted on time | Apurva + William |

## 16. Still open (do not assume)

- The official Indie-track rules on team size and student conditions (William, 26 Oct).
- ~~Measured SAM 3.1 and Muse Spark rate limits and cost per minute of video (Furqaan, 26 Oct).~~ Checked 27 Oct; the numbers are in CLAUDE.md under the tech stack.
- Whether the SAM spike passes its go/no-go on shaky footage (Furqaan, evening of 27 Oct).
- ~~S3 or R2 for clips, frames and masks~~ — R2, private ([decided 27 Oct](decisions/2026-10-27-cloudflare-r2-for-clips-frames-and-masks.md)). The backend host; auth for the builder view.
- The tolerance used by the comparison engine. ~~And whether the plan (BOQ) quantity or the demand-letter quantity wins when they disagree.~~ Settled 27 Oct: the demand letter is judged, the BOQ is a ceiling ([ADR](decisions/2026-10-27-the-demand-letter-is-judged-and-the-boq-is-a-ceiling.md)).
- Whether the sample BOQ carries **per-room** quantities. The demand letter is flat-level ("windows complete: 12") but the demo's outcomes are per-room ("Bedroom 2 is Short by 2"), and only the BOQ can say how many windows a room was meant to have (William, drafting it 27 Oct).
