# Builders get in by a secret project link; buyers and banks by a per-flat report link

**Date:** 27 October 2026
**Proposed by:** Apurva
**Decided by:** Furqaan, with Apurva (CLAUDE.md lists "Auth for the builder view" as theirs)
**Status:** Proposed, not decided. Needs Furqaan's answer to the questions at the end, ideally by 28 October, so it can be built before the 31 October deploy

## Context

Nothing in the API checks who is calling. `POST /projects`, `POST /documents`, `POST /clips` and `POST /clips/complete` answer anyone who has the URL, and William's ADRs each end with "No auth yet: this route must not be deployed open." On a laptop that is fine. On a public deployment it means anyone could:

- **Upload clips at our cost.** Every clip runs through SAM 3.1, paid per frame, and is stored in R2.
- **Open another builder's project**, with real site footage that can show people and neighbouring homes.
- **Read any flat's report**, when the rule is that a buyer sees only their own flat's report.

The judging checklist also needs a live URL with no login to view the report. So this is not blocking any coding, but it is blocking a real deployment.

There are two kinds of visitor:

| Who | Needs | Login |
| --- | --- | --- |
| Builder | Set up a project, upload, see the builder view, send gap requests | To decide here |
| Buyer / bank | Read one flat's report | None. Already decided. But they must reach only their own flat |

## Options

1. **Secret links, no accounts.** Each project gets a long random *builder link* (full access to that project). Each flat gets a *report link* (read-only, that flat only). The token rides in an `Authorization` header from the web app; the server stores only a hash of each one.
   - For: no passwords, no new dependency, about a day to build. Matches how builders already share things on WhatsApp. Judges can try it from a link.
   - Against: whoever holds a link has its access. Access can't be withdrawn from one person, only by replacing the link for everyone. Not how a paid product would ship.
2. **One-time code by phone or email for builders.** Builder accounts; report links as in option 1.
   - For: feels like a real product; access belongs to a person.
   - Against: needs an SMS or email provider (setup, cost, a new dependency) and more screens, two working days before the freeze.
3. **A hosted login service** (Clerk, Auth.js or similar). Report links as in option 1.
   - For: the most complete: sessions, revoking, account recovery.
   - Against: a new dependency with its own setup and pricing, for a feature the demo barely shows.

## Recommendation

Option 1 for the hackathon, with option 2 named as the roadmap in the README. It closes every hole above in the time left, adds no dependency, and keeps the "builder just forwards a link" story.

Whatever is chosen, cap uploads per project per day (say 30 clips), so a leaked builder link cannot run up the model bill.

## What changes if option 1 is accepted

- **Contract (Furqaan):** a way to reach a report by its link instead of by project id, such as `GET /reports/:token`, so a buyer never sees a project id. `GET /projects/:id/report` becomes builder-only.
- **Backend:** a check on every builder route, a token pair made when a project is created, and the upload cap.
- **Web (Apurva):** the builder link opens the project and remembers its token. The report link opens the buyer/bank view only. The Builder / Buyer-bank toggle on today's report page is removed for buyers.
- **Demo:** a builder link for the demo project, shared with judges on the submission page, under the same upload cap.

## Questions for Furqaan

1. Which option: 1, 2 or 3?
2. Is the per-flat report link (`GET /reports/:token`, or another shape you prefer) acceptable as a contract change?
3. Who builds the server side? It touches every route, which sits between your API core and William's endpoints. Apurva can take the web side and the report link.
4. Should judges get a working builder link to upload their own clip, or only the report link? If builder, what upload cap?
5. Does a builder link ever expire, or only change when it is replaced?
