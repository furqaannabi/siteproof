# backend — API, jobs and the pipelines

Hono on Bun, TypeScript. PostgreSQL through Prisma. A jobs table in Postgres, run by this same service; a job is written in the same transaction as the change it belongs to.

```bash
cp backend/.env.example backend/.env    # then fill it in — gitignored, and this repo is public
pnpm db:up                              # local Postgres from compose.yaml (needs Docker)
pnpm --filter @siteproof/backend db:generate   # rebuild the Prisma client after a schema change (pnpm install also runs it)
pnpm --filter @siteproof/backend db:migrate    # apply prisma/schema.prisma to the database
pnpm --filter @siteproof/backend dev    # reads backend/.env, serves on PORT (default 4000)
curl localhost:4000/health
```

`src/app.ts` is the Hono app, kept apart from `src/index.ts` (the Bun entry) so tests can call `app.request()` without a port. Browsers may call it only from the origins in `WEB_ORIGINS` (comma-separated: `http://localhost:3000` and the deployed frontend, `https://siteproof-alpha.vercel.app`); with none set, every site is refused. `src/pipeline/` holds the pipeline steps, one module each; `pnpm --filter @siteproof/backend test` runs their tests (ffmpeg, ffprobe, poppler's `pdftotext` and zbar's `zbarimg` must be on the PATH: `brew install ffmpeg poppler zbar`; the server needs them too, `apt install zbar-tools` there). `src/db.ts` is the one Prisma client (Prisma 7, through the `pg` driver adapter). `prisma/schema.prisma` has every contract shape plus the jobs table, with snake_case fields matching the contract; where the contract carries a URL, the database holds the R2 object key and the URL is presigned on read. The job worker runs inside the same service (`src/jobs/`): it takes the oldest ready job with `FOR UPDATE SKIP LOCKED`, runs it with the handler for its kind, retries with backoff while the handler says another attempt could help, and otherwise gives up so the document or clip shows `failed` with a reason. A kind with no handler (today, `ingest_clip`) waits in the queue. Set `WORKER=off` to serve the API without running jobs. Access (`src/auth/`): `POST /projects` needs `SETUP_KEY`; every builder route needs the project's builder link, signed with `LINK_SECRET` and checked in one place in `app.ts` before any route runs. `GET /projects/:id/links` hands out the links. Clips are capped at 30 per project in any 24 hours (`src/auth/upload-cap.ts`). The screens read `src/reports/`: `GET /projects/:id` (the builder's overview), `GET /flats/:id/report` (builder link) and `GET /report` (a flat's report link, in the header only). A report holds one flat and nothing of any other, filtered in `assemble.ts` whatever the query fetched, and is never cached.

| Part | Owner |
| --- | --- |
| Video pipeline: FFmpeg frame sampling → QR decode → room segments → one-way sweep detection → SAM 3.1 detect/track → per-room counts and evidence frames | Furqaan |
| Verification engine: claimed vs counted vs plan, coverage rule, tolerance, the three outcomes | Furqaan |
| Query letters: Muse Spark drafts, code re-checks every citation before it is shown | Furqaan |
| Jobs table, retries, timeouts, deployment | Furqaan |
| Prisma schema | Furqaan |
| Document pipeline: Muse Spark reads the demand letter and BOQ into structured line items; code checks every quote word for word | William |
| API endpoints for projects, rooms, clips and documents | William |
| Presigned-upload service and clip registration | William |
| Report endpoint and server-side PDF export | Apurva |

Rules that apply here:

- **Models find, code decides.** No model call produces an outcome or a number.
- Validate every request body and every model response with Zod. Model output that fails the schema is unverified, never a default.
- Documents, transcripts and narration are untrusted input. Nothing in them changes the schema, the rules or the outcome.
- Never log API keys, presigned URLs, or whole documents and transcripts. Project / clip / claim ids only.
