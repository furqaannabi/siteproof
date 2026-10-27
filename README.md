# SiteProof

**Verified construction progress from the footage builders already take.**

Under-construction homes in India are paid for in stages. The builder sends a demand letter — "slab 5 done, pay 10%" — and the buyer and the bank pay against a paper claim. Buyers do not have the time or the expertise to check, and by the next stage the work is plastered over.

SiteProof takes the progress clips a builder already posts in the buyers' WhatsApp group, places them by room from a printed QR tag at each doorway, reads the demand letter and the bill of quantities, counts the installed items it can see, and reports one of three outcomes per claim — **Verified**, **Short**, or **Not seen yet** — with the frame and outline for every object counted.

It is proof that gets the builder paid faster, not a tool for catching cheats. SiteProof supports payment decisions with evidence; it does not replace an engineer's inspection of hidden or structural work.

Built for the Meta Global AI Developer Hackathon, Indie track, by Furqaan, William and Apurva.

## How it works

```
clips · demand letter · BOQ
        │
   1 Ingest   store each clip with its capture time, sample frames at 1–2 fps
   2 Locate   decode the QR room tags, split into room segments, detect one-way sweeps
   3 Read     Muse Spark reads the documents into line items, every quote checked word for word
   4 Count    SAM 3.1 tracks each object so a window passed three times counts once
   5 Compare  deterministic code: claimed vs counted vs plan, with the coverage rule
   6 Report   frames and masks for every count, gap requests, query letters, PDF
```

Three rules the code holds to, everywhere:

- **Models find, code decides.** SAM counts and Muse Spark reads. The outcome comes only from deterministic comparison.
- **No evidence, no number.** Every count links to its frames and masks; every quote must match the document word for word; every citation in a query letter is re-checked by code before it is shown.
- **Short is only for fully covered rooms.** A room is covered only when one continuous clip starts at its tag and sweeps it once in one direction. Anything less is **Not seen yet**, with an exact request for five seconds of footage — never an accusation.

The full product brief is in [docs/PRODUCT.md](docs/PRODUCT.md).

## Repo map

| Path | What | Owner |
| --- | --- | --- |
| [`web/`](web/) | Next.js app: setup, uploads, status, report views, gap requests, PDF export | Apurva |
| [`backend/`](backend/) | Hono on Bun: API, jobs, the video and document pipelines, Prisma schema | Furqaan · William · Apurva |
| [`contract/`](contract/src/index.ts) | The shared data contract as TypeScript. No logic, no dependencies | Furqaan |
| [`docs/`](docs/) | [PRODUCT.md](docs/PRODUCT.md), [the data contract](docs/data-contract.md), [decisions](docs/decisions/), [specs](docs/specs/) | All |
| [`CLAUDE.md`](CLAUDE.md) | How agents work in this repo: authority, trust rules, security, domain language | All |

`web/` never imports from `backend/`. Both import from `contract/`.

## Getting set up

```bash
pnpm install
cp backend/.env.example backend/.env   # then fill it in — .env is gitignored, and this repo is public
pnpm --filter @siteproof/backend dev
```

The backend runs on Bun, the frontend on Node; `web/` is not scaffolded yet (see [the decision record](docs/decisions/2026-10-27-repo-layout-and-package-manager.md)). Model API keys, Postgres and object storage credentials go in `backend/.env`, never in code.

## Stack

| Job | Choice |
| --- | --- |
| Detecting, segmenting and tracking installed items from text prompts | SAM 3.1 |
| Reading whole demand letters and bills of quantities in one pass; drafting letters | Muse Spark |
| Walk-and-talk narration into room labels (stretch) | Voice Transcribe |
| Frontend | Next.js on Vercel |
| API and jobs | Hono on Bun, TypeScript, a jobs table in Postgres |
| Video | FFmpeg frame sampling, QR decoding |
| Data | PostgreSQL through Prisma |
| Clips, frames, masks | Cloudflare R2, private, presigned URLs only |

## Not written yet

Owned, dated, and deliberately not faked here:

- **Try it** — the deployed URL and the steps to run the demo project (Apurva, by 31 October)
- **Accuracy** — SAM counts against hand counts on 15–20 labelled clips (William and Furqaan, by 31 October)
- **Who it's for** — the pitch section (William, by 31 October)
