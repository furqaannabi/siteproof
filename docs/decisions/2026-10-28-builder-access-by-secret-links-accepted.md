# Builder access by secret links: accepted, with answers to the open questions

**Date:** 28 October 2026
**Decided by:** Furqaan
**Status:** Accepted. Accepts [the proposal of 27 October](2026-10-27-builder-access-by-secret-links-proposed.md)

## Context

Apurva's proposal set out three ways to keep the API's write routes and every flat's report from being open to anyone with the URL, recommended secret links, and left five questions for Furqaan. William raised the same hole from the backend: `POST /projects`, `POST /documents` and `POST /clips` answer anyone, and CORS stops other websites but not `curl`.

## Decision

**Option 1, secret links, no accounts.** The answers to the proposal's questions:

1. **Which option.** Secret links. A phone or email code (option 2) is the roadmap, named in the README.
2. **The report link is a contract change, accepted.** A buyer or bank reaches one flat's report by its link, as `GET /reports/:token`, and never sees a project id. `GET /projects/:id/report` becomes builder-only. The exact shape lands in `docs/data-contract.md` when it is built.
3. **Who builds it.** Furqaan builds the server side: the token check on every builder route, a token pair made with each project, the report route, and the upload cap. Apurva builds the web side.
4. **Judges get a working builder link**, to the demo project, so they can upload their own clip and watch it go through. Uploads are capped at **30 clips per project per day**: at about $0.36 of SAM 3.1 per 60-second clip, a leaked link costs at most about $11 a day.
5. **Links never expire.** A link works until it is replaced, which cuts off everyone who held it. A report link a buyer bookmarks keeps working through a stage payment and through judging.

Only a hash of each token is stored. A token is long and random, carried in an `Authorization` header from the web app, and never logged.

## Consequences

- Until the token check lands, the write routes must not be deployed open. This is the gate on the first backend deploy.
- Anyone holding a builder link has full access to that project, and access can be withdrawn only from everyone at once, by replacing the link. Accepted for the hackathon; not how the paid product ships.
- The upload cap needs a count of clips per project per day, checked at `POST /clips`.
