# The report is per flat and buyer-safe, and every claim in it is judged or explained

**Date:** 28 October 2026
**Decided by:** Furqaan, from Apurva's proposal in `web/lib/types.ts`
**Status:** Accepted

## Context

Apurva built every screen against proposed shapes for the report, gap requests and query letters, and asked Furqaan to settle them. Since then, report links per flat were accepted ([secret links](2026-10-28-builder-access-by-secret-links-accepted.md)): a buyer or bank opens one flat's report with no login, which makes the report the most exposed thing the API returns. Checked against the trust rules, the proposal had five problems:

1. **`Report` held one `flat` but was served per project**, and carried every clip in the project with a link to the whole video, the list of every flat, and every document. Through a report link, a buyer would see other flats' demand letters and footage that can show people and neighbouring homes.
2. **No place for "not checked".** A claim with no `Result` is either not countable or asks for more than the BOQ holds. With nothing saying which, the natural fallback renders it as Not seen yet, which promises a five-second clip will clear plastering.
3. **`QueryLetter.citations_rechecked: boolean`** would carry a letter that failed its re-check to the browser, trusting the UI to hide it. The rule is that such a citation is not shown.
4. **`QueryLetter.body` was free text from Muse Spark**, and would hold numbers ("12 billed, 9 seen"). No model call may produce a number shown to a buyer.
5. **`stage` ("Stage 6")** had no source but a model reading a demand letter: a claim shown to a bank with no checked quote behind it.

## Decision

- **`Report` is one flat, the same for its buyer, bank and builder.** It holds the flat's rooms; the documents that bill it plus the project's BOQ; the claims, results, detections and segments for its rooms; evidence frames rather than whole clips; and the project's id, name and builder, never its other flats. Served at `GET /reports/:token` (report link, no login) and `GET /flats/:id/report` (builder link).
- **`ProjectOverview`** at `GET /projects/:id` gives the builder the whole project: every flat, room, document and clip with its status. The builder's project page reads it instead of the report.
- **`Report.not_checked: NotChecked[]`**, reason `not_countable` or `exceeds_plan`. Every claim is in `results` or `not_checked`. This settles where an over-plan claim says so.
- **`QueryLetter.citations`** is the cited lines and frames themselves: `invoice_claim_id`, `plan_claim_id` (null where the BOQ is silent), `evidence`. A letter in a response has passed its re-check; one that failed is never sent. **Every number in `body` is put there by code** from the `Result`; Muse Spark writes only the wording around them.
- **`GapRequest`** gains an `id` and the status `cleared`, for when footage covering the room arrives — the moment the demo turns on.
- **No `stage`.** The demand letter's claims, with their verified quotes, say what is billed.

`GET /projects/:id/report` stays in the contract, marked replaced, only until the web app has moved to the new routes.

## Consequences

- Building the report means filtering by flat on the server, and minting frame links rather than clip links for it.
- The query-letter generator fills every number from the `Result` and leaves only the prose to Muse Spark, which is less fluent than free drafting and cannot invent a figure.
- Apurva's screens move from `web/lib/types.ts` to these types: the report view reads `not_checked` for its third visual state, the project page reads `ProjectOverview`.
