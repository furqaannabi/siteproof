# The repo is a pnpm workspace of web, backend and contract, and the contract is hand-written TypeScript

**Date:** 27 October 2026
**Decided by:** William (repo setup), to be confirmed by Furqaan as contract owner
**Status:** Accepted

## Context

The team plan calls for a monorepo set up on 26 October, with Apurva's Next.js app, Furqaan's pipeline and William's API in it, and a shared data contract locked the same night so Apurva could build the UI against mock `Result`s from 27 October. Three people are writing code against the same shapes for four days before the core freeze on 31 October.

## Options

1. **pnpm workspace with `web/`, `backend/` and `contract/`.** The layout the team already knows from Sponing.
2. **One package, folders only.** Faster to start, no workspace plumbing, but nothing stops `web/` importing a backend module, and the contract becomes a relative import path.
3. **Generate the contract from the backend's Zod schemas** (the Sponing pattern) instead of hand-writing it.

## Decision

Option 1, with the contract hand-written: `contract/src/index.ts` is plain TypeScript types and `api` path helpers, with no dependencies and no build step, imported as `@siteproof/contract` by both `web/` and `backend/`.

Generating it from Zod (option 3) is the better pattern for a long-lived product, but it needs the backend's schemas to exist first, and Apurva needs typed `Result`s today. Runtime validation still happens with Zod in `backend/`, where untrusted input arrives.

`web/` and `backend/` are left unscaffolded by this commit. The Next.js app and design system are Apurva's and were started on 26 October; the service skeleton and Prisma schema are Furqaan's as lead. Scaffolding either here would have meant overwriting work in flight or committing someone else's decisions.

## Consequences

- The contract ships as TypeScript source, so `web/` needs `transpilePackages: ["@siteproof/contract"]` in `next.config.ts`.
- Hand-written types can drift from what the backend actually returns. Zod schemas in `backend/` are the guard; a mismatch found on integration day (30 October) is a contract fix, not a cast.
- `Flat` is recorded as `{ id, name }` because `Project.flats[]` in the plan never spelled it out. Furqaan to confirm.
