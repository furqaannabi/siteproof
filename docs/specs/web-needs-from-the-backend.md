# What the web app needs from the backend

**Date:** 28 October 2026
**From:** Apurva
**For:** Furqaan
**Status:** Open

The web app is moved to the contract of 28 October: per-flat reports, the project overview, and secret links ([ADR](../decisions/2026-10-28-builder-access-by-secret-links-accepted.md)). It works end to end on mock data and against a stand-in server with the contract's shapes. Against `hack.furqaannabi.com` only creating a project and the share links can work, because these are not there yet. Uploads are wired to `POST /clips`, `POST /clips/complete` and `POST /documents`, but the upload page opens from the project overview, so it waits on `GET /projects/:id` too. Wednesday's plan is wiring the screens to the real API, so these block it.

## 1. Let the web app call the API (`WEB_ORIGINS`)

The server answers no browser until its origin is in `WEB_ORIGINS` (`backend/src/app.ts`). Checked on 28 October: a preflight from `http://localhost:3000` gets no `Access-Control-Allow-Origin`. Please add:

- `http://localhost:3000`, for development;
- the frontend's deployed address, once the hosting is decided.

**Also the R2 bucket.** A clip's video goes from the phone straight to R2 through the `upload_url` that `POST /clips` hands back, a `PUT` with `content-type` set to the clip's type. A browser makes that request only if the bucket's CORS rules allow it, so the bucket needs a rule for the same origins: `PUT` allowed, the `content-type` header allowed. Without it every clip upload fails in the browser, while the same request from `curl` works.

## 2. The three routes the screens read

All three are in the contract with Furqaan as owner. Each answers 404 on the hosted API today.

| Route | Auth | Screens waiting on it |
| --- | --- | --- |
| `GET /projects/:id` → `ProjectOverview` | Builder link | Project page, upload page, the projects list, and the first step of the report page (which flat to show) |
| `GET /flats/:id/report` → `Report` | Builder link of the flat's project | The builder's report page |
| `GET /reports/:token` → `Report` | The report link itself, as `Authorization: Bearer` | `/report`, what buyers and banks open |

What the web side relies on, so it matches what is built:

- A missing or invalid link is `401`, a valid link for another project `404`, as the contract says. The screens word those differently ("open this project from its link" / "this link doesn't open anything").
- `GET /reports/:token` takes the token in the `Authorization` header. The path also carries it, as `api.reportByLink(token)` builds it; the web app sends both. If the path should carry it alone, say so.
- A `Report` carries only what the contract lists for one flat: no clip URLs, no other flats' documents.

## 3. The gap request: built, room only

`POST /rooms/:id/request-footage` is built ([decision](../decisions/2026-10-28-gap-request-text-and-pdf-export.md)): code writes "Need 5 s of Flat 302 kitchen, one slow sweep from its room tag", Muse Spark writes only the filming steps, checked, with fixed steps when it can't. It names the room, not a wall, because nothing yet says which part of a room wasn't seen. If the coverage map comes to name a wall, only `requestText` in `backend/src/routes/gap-requests.ts` changes.

**For the report routes:** read a flat's gap requests with `gapRequestsOf(roomIds)` from `backend/src/routes/gap-request-store.ts`. It works out `cleared` (a full one-way sweep of the room in a clip uploaded after the request), so the pipeline needs no change to clear one.

## Also open, from earlier today

[Clip placement and capture time](../decisions/2026-10-28-clip-placement-and-capture-time-proposed.md): the project page can't say where a clip was placed or that it passed no room tag, and the report can't say when its evidence was filmed.
