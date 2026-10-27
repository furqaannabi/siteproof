# backend — API, jobs and the pipelines

Hono on Bun, TypeScript. PostgreSQL through Prisma. A jobs table in Postgres, run by this same service; a job is written in the same transaction as the change it belongs to.

Not scaffolded in this commit: the service skeleton and the Prisma schema are Furqaan's call as lead.

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
