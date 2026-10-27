# web — the SiteProof app

**Owner: Apurva.** Next.js on Vercel.

Next.js 16 (App Router, TypeScript), wired to `@siteproof/contract`. Styling is CSS Modules over the design tokens in `app/globals.css` (light and dark), with fonts from `next/font`: no UI library.

```bash
cp web/.env.example web/.env.local      # NEXT_PUBLIC_API_URL=http://localhost:4000
pnpm --filter @siteproof/web dev        # http://localhost:3000
```

Deployed on Vercel at [siteproof-alpha.vercel.app](https://siteproof-alpha.vercel.app). The backend only answers browser calls from origins listed in its `WEB_ORIGINS`, which includes this one and `http://localhost:3000`; a Vercel preview URL is refused until it is added there.

`cacheComponents` and `partialPrefetching` are on because they are the template's defaults, not a decision. `AGENTS.md` is written by `next dev` itself and points coding agents at the docs bundled with this Next version.

## Screens

| Route | What |
| --- | --- |
| `/` | Start: set up a project, the demo report, projects made in mock mode |
| `/projects/new` | Project, flat and room setup. Same name rules as `POST /projects` |
| `/projects/[id]` | Next steps, the printable room tags, every document and clip with its status |
| `/projects/[id]/upload` | Clips and documents: type checks, upload progress, status polling |
| `/projects/[id]/report` | The report, builder and buyer/bank views. No login |
| `/projects/[id]/rooms/[roomId]/request` | The gap request on the site supervisor's phone, with record or upload |

## Mock data and the real API

Every screen reads through `lib/data.ts`. With `NEXT_PUBLIC_DATA_SOURCE` empty it uses `lib/mock-store.ts`, a pretend backend in the browser seeded with the Flat 302 demo (`mocks/flat-302.ts`, built from the sample documents in `backend/fixtures/documents/`). It walks uploads through uploaded → processing → done, and a clip filmed from the kitchen gap request clears the kitchen, so the whole demo story runs with no backend. Set it to `api` to use the backend; parts whose shapes aren't agreed yet say so on screen instead of guessing.

Shapes the screens need that the contract doesn't have yet (the report envelope, gap requests, query letters, the `POST /projects` body) are proposals in `lib/types.ts`, for Furqaan.

**Evidence images.** `public/mock/` holds drawn placeholder frames and masks, never footage. `components/evidence-frame.tsx` draws a frame at its real pixel size and lays each mask over it through an SVG filter, which reads the mask's brightness as the object's shape and paints the orange fill and outline itself. So real masks need only be a shape image, white on transparent or white on black, the same size as their frame, at any resolution or orientation; the colours stay in the design tokens.

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
