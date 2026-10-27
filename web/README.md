# web — the SiteProof app

**Owner: Apurva.** Next.js on Vercel.

A bare Next.js 16 skeleton (`create-next-app --empty`, App Router, TypeScript), wired to `@siteproof/contract` and nothing else. Styling, linting, auth, the design system and every page are Apurva's to choose.

```bash
cp web/.env.example web/.env.local      # NEXT_PUBLIC_API_URL=http://localhost:4000
pnpm --filter @siteproof/web dev        # http://localhost:3000
```

Deployed on Vercel at [siteproof-alpha.vercel.app](https://siteproof-alpha.vercel.app). The backend only answers browser calls from origins listed in its `WEB_ORIGINS`, which includes this one and `http://localhost:3000`; a Vercel preview URL is refused until it is added there.

`cacheComponents` and `partialPrefetching` are on because they are the template's defaults, not a decision. `AGENTS.md` is written by `next dev` itself and points coding agents at the docs bundled with this Next version.

What lives here, per the plan:

- Project, flat and room setup
- Upload UI and processing status (polls `GET /clips/:id/status`)
- The report view: claims, counts, annotated frames with mask overlays, outcome badges
- Builder and buyer/bank views. **The buyer/bank report needs no login**
- Gap requests from the coverage map
- Mobile layout and polish — builders are on their phones, on a site, in sunlight

Rules that apply here:

- Import shapes from `@siteproof/contract`. Never write an API path in a component; use the `api` helpers. Next.js needs `transpilePackages: ["@siteproof/contract"]` in `next.config.ts`, since the contract ships as TypeScript source.
- Never round **Not seen yet** up to **Verified**, in copy or in a badge.
- Every count shown links to its frames. No evidence, no number.
- Never show a citation the backend has not marked as re-checked.
