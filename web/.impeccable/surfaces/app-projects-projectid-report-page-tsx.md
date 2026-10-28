---
version: 1
slug: "app-projects-projectid-report-page-tsx"
primary_target: "app/projects/[projectId]/report/page.tsx"
related_targets: []
---

# Report (`/projects/[projectId]/report`)

**Mode:** Operate (read to decide).
**Audience:** a buyer or a bank deciding whether to pay a demand letter, often on a phone, from a forwarded link. The builder uses the same page through the Builder / Buyer-bank toggle, second.
**Task:** know in seconds what can be paid against and what is still open, then check the frames and the document lines behind any room.
**Must keep:** the Plan / 3D room view, the blueprint plan, the Windows / Doors switch, the Builder / Buyer-bank toggle on one page, every outcome rule (Not seen yet never a number, quotes only when matched, query letters only when re-checked, not-countable claims in their own neutral row), the gap request, the query letter, the builder's note, empty states and the stale-refresh notice.
**Constraints:** the Site Drawing Set world in DESIGN.md, unchanged. Product words exactly. No eyebrow labels stacked above headings.

## Direction contract

THESIS: One answer line, then rooms and their evidence side by side: a ranked list of rooms on the left, the selected room's evidence on the right. It refuses the dashboard of summary tiles over a grid of cards.

OWN-WORLD: Site Paper under a drafting grid; the blueprint plan and 3D in Blueprint Navy; the room list ruled like a drawing schedule in Drafting Ink; the evidence as a plate with registration ticks at its corners and its outcome stamp pressed half off the plate's edge; the letter and BOQ lines on Highlighter Yellow in the evidence panel's margin. Square, ruled, no shadows.

STORY: The reader sees how many of the claimed items are verified and how many are open, sees the open rooms first, opens one, checks its frame, counts and source lines, and knows what would clear it.

FIRST VIEWPORT: Header with the toggle and print. An answer row: the verified count at monumental scale ("9 of 12"), its breakdown and the tally, the Windows / Doors switch at its right. Below, two columns: left (about 460px) the plan or 3D with its switch, then the room schedule, open rooms first, each with its index (R1 to R5), count and outcome; right, the selected room's evidence panel: index and name, In the plan / Counted / Coverage, the plate with its stamp, and the margin of source lines and what clears the room. On a phone the columns stack (answer, plan, schedule, evidence) and choosing a room brings its evidence into view.

FORM: Rooms and evidence side by side (master-detail), fourth on my re-roll list, safer register. seed:413af77e6772bfab. Raised by the declined hand: one monumental number; source lines in the margin; the schedule ranked by weight and rules, never size; the stamp half off the plate with corner ticks; room index numbers matching the plan; the Windows / Doors switch re-renders the whole sheet in place. Signature interaction: choosing a room presses its outcome stamp onto the new plate, once; reduced motion shows it at rest.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
