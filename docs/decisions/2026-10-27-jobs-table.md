# Pipeline work runs from one jobs table, claimed with SKIP LOCKED

**Date:** 27 October 2026
**Decided by:** Furqaan
**Status:** Accepted

## Context

Ingesting a clip, segmenting it with SAM 3.1, extracting a document with Muse Spark and drafting a query letter are all slow, can fail, and must survive a restart. CLAUDE.md already settles that this runs from our own jobs table in Postgres, run by the backend service, with each job written in the same transaction as the change it belongs to. What it does not settle is the table's shape and how a worker takes a job.

The table is internal to the backend. It is not part of the data contract, and nothing outside `backend/` reads it.

## Options

1. **One jobs table, claimed with `SELECT … FOR UPDATE SKIP LOCKED`.** The pattern used on Sponing.
2. **No jobs table: status columns on `Clip` and `Document`,** with the worker scanning for work. Fewer moving parts, but retries, timeouts and every later step (counting, query letters) each need a scan of their own.
3. **pg-boss**, a queue library on Postgres. Retries and scheduling built in, but a new dependency with its own tables, and a job cannot easily be written inside the same Prisma transaction as its change.

## Decision

Option 1. One table:

| Column | Meaning |
| --- | --- |
| `id` | The job |
| `kind` | What to do, such as ingesting a clip or extracting a document |
| `payload` | JSON holding **ids only** — never a presigned URL, a storage key, or document text |
| `status` | `queued` · `running` · `done` · `failed` |
| `attempts`, `max_attempts` | Retries |
| `run_after` | Not before this time; used for backoff |
| `locked_at` | When a worker took it. A `running` job locked longer than its timeout is taken again |
| `last_error_code` | A short code only, never a message that could carry a URL or document text |
| `created_at` | |

A worker claims the oldest `queued` job whose `run_after` has passed with `FOR UPDATE SKIP LOCKED`, so two workers never take the same job. A job is inserted in the same transaction as the row it works on: a clip is never registered without its ingest job, and never gets an ingest job without being registered.

## Consequences

- Prisma has no `SKIP LOCKED`, so claiming is one raw SQL query; everything else uses the Prisma client.
- Because the payload holds ids only, a job row is safe to log and to show in an admin view.
- How a job that has used up its retries reaches the builder — as the clip's or document's `failed` status, with a plain-language reason — is settled when the first job handler is built.
