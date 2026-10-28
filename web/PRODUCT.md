# Product

<!-- impeccable:product-schema 1 -->

The web app's product record, for design work in `web/`. The team's signed brief is [`docs/PRODUCT.md`](../docs/PRODUCT.md) and the rules every surface codes to are in [`CLAUDE.md`](../CLAUDE.md); where they disagree with this file, they win. This file never widens them.

## Platform

web

Mobile web first. Not a native app, and not a wrapper around one.

## Users

- **Builder (primary).** On a phone, on a construction site, often in direct sunlight, often one-handed. Sets up a project, forwards the progress clips they already share in buyers' WhatsApp groups, uploads the demand letter and bill of quantities, and sends buyers a verified progress report. Wants to be paid without arguments.
- **Site supervisor.** Opens a gap-request link on their phone and films one short clip from a room's door tag.
- **Buyer and bank / lender.** Read one flat's report before paying a demand letter or releasing a stage. No login. The link often arrives forwarded on WhatsApp.
- **Hackathon judges.** See the product in a 2-minute demo and on a live URL, judged on creativity, technical ambition and whether it works.

## Product Purpose

SiteProof turns the progress clips builders already take into verified construction progress, so buyers and banks can release stage payments with evidence and builders get paid faster. Success: a buyer or bank can see, for each claim in a demand letter, what is Verified, Short or Not seen yet, with the frames that prove it, and a builder knows exactly which 5-second shot would clear the rest.

## Positioning

Proof that gets the builder paid faster, not a tool for catching cheats. Nobody films anything new: room tags place ordinary clips by room, models find and read, and only deterministic code decides an outcome. Every number shown links to its frames, and every quote matches its document word for word.

## Operating Context

- Construction sites in India: dust, glare, patchy mobile data, cheap Android phones.
- Inputs are messy on purpose: shaky WhatsApp clips in any order, PDFs of demand letters and BOQs, printed QR tags at each doorway.
- Reports are read on phones and forwarded, and may be printed or exported as a PDF for a bank's loan file.
- The demo story (docs/PRODUCT.md §9) is the canonical walkthrough: Flat 302, 9 of 12 windows, Bedroom 2 Short by 2, the kitchen Not seen yet until a 5-second clip clears it.

## Capabilities and Constraints

- Screens today: start page, project setup, project page with printable room tags, uploads with status, the report (builder and buyer/bank views, plan or 3D room picker), and the gap-request phone page. They run on mock data until the API is wired; see `web/README.md`.
- The three outcomes are **Verified**, **Short** and **Not seen yet**. Short appears only for a fully covered room. A claim that can't be counted in this version has its own neutral style, never Not seen yet.
- Shapes come from `@siteproof/contract`, which Furqaan owns. A field the UI needs and the contract lacks is a proposal (`web/lib/types.ts`), never a local addition.
- Undecided: auth for the builder view (proposed in `docs/decisions/2026-10-27-builder-access-by-secret-links-proposed.md`); real QR codes on the tags; server-side PDF export.
- Core freeze 31 October 2026; submission 4 November 2026.

## Brand Commitments

- Name: **SiteProof**.
- Use the product's words exactly: clip, room tag, segment, one-way sweep, coverage, claim, detection, count, Verified, Short, Not seen yet, gap request, query letter, demand letter, BOQ. No synonyms.
- Plain language for builders and buyers. No model names (SAM, Muse Spark) and no cloud or API jargon in the UI.
- Never round Not seen yet up to Verified, in copy or in a badge. Not seen yet is never an accusation and never shown as a zero.
- A gap request is always exact and small: "Need 5 s of Flat 302 kitchen, east wall". Never "re-shoot everything".
- Positioning line, never overstated: "SiteProof supports payment decisions with evidence. It doesn't replace an engineer's inspection of hidden or structural work."

## Evidence on Hand

- Sample demand letter and BOQ for Flat 302: `backend/fixtures/documents/` (fictional builder and allottee).
- Drawn placeholder frames and masks marked as mock: `web/public/mock/`.
- No real site footage, customers, testimonials, accuracy figures or pricing yet. Do not invent them. The accuracy table (SAM counts vs hand counts) is owed by William and Furqaan by 31 October.
- Real footage, when it exists, is never committed: it can show people and neighbouring homes.

## Product Principles

1. **No evidence, no number.** Every count shown links to its frames; every citation shown has been re-checked by code.
2. **Exact over alarming.** When something isn't proven, say precisely what is missing and the smallest step to fix it.
3. **Built for the site, not the office.** One hand, bright sun, slow data: big targets, high contrast, nothing that needs a second try.
4. **Payment support, not policing.** The tone helps an honest builder get paid; it never accuses.
5. **Models find, code decides.** The UI never presents a model's output as a verdict.

## Accessibility & Inclusion

- Outdoor legibility: text contrast at least 4.5:1, and the three outcomes told apart by pattern and words, never by colour alone.
- Touch targets at least 44 px; primary actions within thumb reach on a phone.
- Respect reduced-motion settings; the 3D view has a non-3D equivalent for every action.
- Users may read English as a second language: short sentences, common words. Hindi is a stretch goal, not a commitment.
