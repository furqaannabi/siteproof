# Gap requests: code writes the ask, Muse Spark writes the steps; PDF export stays in the browser

**Date:** 28 October 2026
**Decided by:** Apurva
**Status:** Accepted

## Context

Two of Apurva's tasks in `docs/PRODUCT.md` are the gap request (`POST /rooms/:id/request-footage`, the AI feature) and server-side PDF export (the backend service). The report routes moved to Furqaan in [builder access by secret links](2026-10-28-builder-access-by-secret-links-accepted.md).

A gap request has to be exact and small ("Need 5 s of Flat 302 kitchen, east wall"), and "models find, code decides" rules out a model writing text a builder acts on unchecked. Nothing in the backend yet says which part of a room was not seen, only whether the room has a full one-way sweep (`Segment.full_sweep`); the question is with Furqaan in [what the web app needs from the backend](../specs/web-needs-from-the-backend.md).

## Decision

**The request line is written by code.** From the flat and room names only: "Need 5 s of Flat 302 kitchen, one slow sweep from its room tag". It names the room, not a wall, until the coverage map can say which wall; then only this line changes.

**Muse Spark writes the filming steps**, two to four short sentences for the site supervisor's phone. Its answer is held to a strict schema, and refused if any step has a digit in it, is longer than 140 characters, or the call fails or takes over 15 seconds. A refused answer is replaced by three fixed steps in code, so a request is never blocked on the model, and never carries a number or a claim the model made up.

**`POST /rooms/:id/request-footage` sends the request.** It creates the room's request, or returns the one already live, marks it `sent`, and answers with the `GapRequest`. A room may be asked about only while it is Not seen yet: it has no full one-way sweep, or one of its claims has the outcome Not seen yet. A request turns `cleared` once a clip uploaded after it has a full one-way sweep of the room; that is worked out when the request is read, so the pipeline needs no change.

**Server-side PDF export is cut.** The report's "Print or save PDF" already produces the PDF from the browser on a phone or a laptop. A server-side copy would need headless Chrome on the backend host (about 170 MB) or a second layout of the report, for the third item on the plan's cut list. The print layout gets the polish instead.

## Consequences

- One new table, `GapRequest`, with the contract's fields plus `created_at`.
- Furqaan's report routes read gap requests through `gapRequestsOf(roomIds)` in `backend/src/routes/gap-request-store.ts`, which works out `cleared`.
- A Muse Spark call per new request, a few hundred tokens: a fraction of a cent.
- When the coverage map can name a wall, the request line changes in one function.
