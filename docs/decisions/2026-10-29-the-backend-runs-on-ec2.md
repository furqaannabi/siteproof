# The backend runs on one EC2 instance, behind Caddy, under pm2

**Date:** 29 October 2026
**Decided by:** Furqaan
**Status:** Accepted

## Context

Backend hosting was the last undecided row in CLAUDE.md. The backend shells out to `ffmpeg`, `ffprobe` and poppler's `pdftotext`, runs a job worker continuously in the same process as the API, and needs Postgres. That rules out serverless hosts that cannot install system binaries or that sleep when idle. The frontend is on Vercel over HTTPS, so the API must be served over HTTPS too, or browsers block the calls.

## Options

1. **An EC2 instance Furqaan already runs**, shared with another app (`cleared`).
2. **Railway**: Docker from the repo, a Postgres add-on, Singapore region.
3. **Fly.io**: Docker on Machines, Mumbai region, Postgres from a separate provider.

## Decision

Option 1, deployed on 28 October and live at `https://hack.furqaannabi.com`:

- **Caddy** terminates HTTPS and proxies to the backend on `127.0.0.1:3001`.
- **pm2** runs the backend (`bun --env-file=.env src/index.ts`, `NODE_ENV=production`), the API and job worker in one process, restarted on failure and on reboot.
- **Postgres 18** runs from the repo's `compose.yaml` in Docker on `127.0.0.1:5544`, never exposed.
- The server has its own `LINK_SECRET`, `SETUP_KEY` and `UPLOAD_TICKET_SECRET`, never a laptop's.
- Updating is `git pull`, `pnpm install --frozen-lockfile`, `prisma migrate deploy`, `pm2 restart siteproof`.

It is a machine already paid for and already in reach, and it takes system packages with no container build. Railway and Fly would each have needed a Dockerfile and a new account four days before the freeze.

## Consequences

- The instance is shared with `cleared`: a deploy of either touches the other's host, Bun version (1.3.13 there, 1.4.0 in development) and disk. Upgrading Bun on the server affects both.
- The security group exposes only 22, 80 and 443; Postgres and the backend port are bound or kept private.
- `pm2 restart` sends SIGINT; until the worker handles it like SIGTERM, a restart mid-job leaves that job to be taken back after its 15-minute lock expires.
- No redundancy: if the instance is down, the API is down. Acceptable for the hackathon.
