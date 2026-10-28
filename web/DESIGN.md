---
name: SiteProof
description: Verified construction progress from the footage builders already take.
colors:
  safety-orange: "#e8590c"
  safety-orange-night: "#f26b1d"
  site-paper: "#f4f1ea"
  sheet-white: "#fffdf8"
  drafting-ink: "#1e1d1a"
  drafting-ink-soft: "#3e3b35"
  drafting-ink-muted: "#5c5850"
  ruling-grey: "#cfcac0"
  blueprint-navy: "#163a6b"
  blueprint-deep: "#0f2a4f"
  night-blueprint: "#0b1b30"
  night-sheet: "#102641"
  tracing-line: "#dce9f7"
  night-ink: "#e8eef5"
  night-ink-muted: "#9db0c6"
  approved-green: "#2f6b3a"
  approved-green-night: "#6fd08c"
  approved-green-plan: "#1d5550"
  shortfall-rust: "#b4440a"
  shortfall-rust-night: "#ff9a5c"
  shortfall-wash: "#fbe3d2"
  shortfall-rust-plan: "#5b3524"
  pencil-grey: "#4f4b44"
  pencil-grey-night: "#b8c7d8"
  highlighter-yellow: "#ffe7a8"
  highlighter-wash: "#fff3c4"
  blueprint-amber: "#f59e5b"
  tracing-line-soft: "#c5d2e0"
  plan-ink: "#f4f8fc"
  plan-label-green: "#9be7b0"
  plan-label-amber: "#ffb37a"
  tag-paper: "#ffffff"
  overlay-ink: "#e9e5dc"
  overlay-bg: "rgba(0, 0, 0, 0.55)"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(44px, 10vw, 72px)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.01em"
  page:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(40px, 9vw, 64px)"
    fontWeight: 700
    lineHeight: 0.95
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "36px"
    fontWeight: 700
    lineHeight: 1.05
  numeral:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tnum"
  subhead:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.05
  brand:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    letterSpacing: "0.02em"
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0.03em"
  minor-head:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "20px"
    fontWeight: 700
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  small:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  ref:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.08em"
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "28px"
    fontWeight: 500
    lineHeight: 1.2
    fontFeature: "tnum"
rounded:
  none: "0px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.drafting-ink}"
    textColor: "{colors.site-paper}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "44px"
  button-mark:
    backgroundColor: "{colors.safety-orange}"
    textColor: "{colors.drafting-ink}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.drafting-ink}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "44px"
  toggle-segment-active:
    backgroundColor: "{colors.drafting-ink}"
    textColor: "{colors.site-paper}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "44px"
  panel:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.drafting-ink}"
    rounded: "{rounded.none}"
    padding: "18px 20px"
  input:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.drafting-ink}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "48px"
  plan-room-verified:
    backgroundColor: "{colors.approved-green-plan}"
    textColor: "{colors.tracing-line}"
    rounded: "{rounded.none}"
    padding: "12px 14px"
  plan-room-short:
    backgroundColor: "{colors.shortfall-rust-plan}"
    textColor: "{colors.tracing-line}"
    rounded: "{rounded.none}"
    padding: "12px 14px"
  quote:
    backgroundColor: "{colors.highlighter-yellow}"
    textColor: "{colors.drafting-ink}"
    typography: "{typography.label}"
    padding: "0 3px"
---

# Design System: SiteProof

## Overview

**Creative North Star: "The Site Drawing Set"**

SiteProof looks like an architect's drawing set carried onto a construction site. The plan is a blueprint: navy ground, a faint drafting grid, pale tracing lines and a title block along its foot. Judgements are rubber stamps, Verified, Short and Not seen yet, pressed slightly crooked onto the sheet. Evidence reads like a marked-up document: the claim's source line highlighted in yellow, the counted object outlined in safety orange.

The world is square, ruled and stamped. Corners are hard, rules are 2px ink, and nothing floats on a shadow. Density is that of a working document, not a dashboard: big condensed numerals for the answer, small mono labels for provenance, plain sans for the sentences in between. It has to hold up on a cheap phone in direct sun, so contrast and pattern do the work that subtle colour would do indoors.

Two themes share one drawing. The light theme is paper and ink with blueprint inserts; the dark theme is the blueprint itself, navy ground and tracing-line ink. The plan, the 3D model and the gap-request phone screen stay blueprint in both.

**Key Characteristics:**
- Square corners everywhere (0px), 2px ink rules, no drop shadows.
- Condensed display numerals answer the question; mono labels say where the answer came from.
- Three outcomes told apart by fill, pattern and word, never by colour alone.
- Safety orange marks evidence and the next action; it never decorates.
- A faint drafting grid on every ground: 24px on pages, 20px on plans.

## Colors

Paper, ink and blueprint, with one marking colour and three outcome colours that each have a day, night and plan shade.

### Primary
- **Safety Orange** ({colors.safety-orange}; {colors.safety-orange-night} at night): the marker's colour. Object outlines and fills on evidence frames, the selected room's outline, the brand mark, the one most important action on a screen (create the project, record the clip, send the gap request), and focus rings.

### Secondary
- **Blueprint Navy** ({colors.blueprint-navy}) with **Blueprint Deep** ({colors.blueprint-deep}): the plan, the 3D stage, the footage-request band and the whole gap-request phone screen. Always carries the drafting grid.
- **Tracing Line** ({colors.tracing-line}): lines, walls, labels and ink on blueprint. **Plan Ink** ({colors.plan-ink}) for names and counts on the plan, **Tracing Line Soft** ({colors.tracing-line-soft}) for secondary text on the 3D stage, **Plan Label Green** ({colors.plan-label-green}) and **Plan Label Amber** ({colors.plan-label-amber}) for outcome labels on plan tiles, and **Blueprint Amber** ({colors.blueprint-amber}) for the Short rule round a plan tile and for eyebrows on blueprint.

### Tertiary (the outcomes)
- **Approved Green** ({colors.approved-green}; {colors.approved-green-night} at night; {colors.approved-green-plan} on the plan): Verified. Solid fill.
- **Shortfall Rust** ({colors.shortfall-rust}; {colors.shortfall-rust-night} at night; {colors.shortfall-rust-plan} on the plan) with **Shortfall Wash** ({colors.shortfall-wash}): Short. A rust outline round a pale wash. In the light theme it doubles as the link colour.
- **Pencil Grey** ({colors.pencil-grey}; {colors.pencil-grey-night} at night): Not seen yet. A dashed outline over a 45° hatch, never a solid fill.
- **Highlighter Yellow** ({colors.highlighter-yellow}) on **Highlighter Wash** ({colors.highlighter-wash}): a document's own words, quoted word for word.

### Neutral
- **Site Paper** ({colors.site-paper}): the light page ground, under a blueprint-tinted 24px grid.
- **Sheet White** ({colors.sheet-white}): panels and inputs on Site Paper.
- **Drafting Ink** ({colors.drafting-ink}): text, rules and the primary button. **Drafting Ink Soft** ({colors.drafting-ink-soft}) for secondary text, **Drafting Ink Muted** ({colors.drafting-ink-muted}) for labels and notes.
- **Ruling Grey** ({colors.ruling-grey}): hairline dividers and quiet borders.
- **Tag Paper** ({colors.tag-paper}): printed room tags and the printed report stay plain white, whatever the theme.
- **Overlay** ({colors.overlay-ink} on {colors.overlay-bg}): small badges drawn over an evidence frame, where the photo underneath is unknown.
- **Night Blueprint** ({colors.night-blueprint}), **Night Sheet** ({colors.night-sheet}), **Night Ink** ({colors.night-ink}) and **Night Ink Muted** ({colors.night-ink-muted}): the dark theme's ground, panels and text.

### Named Rules
**The Three Stamps Rule.** Verified is solid, Short is outlined, Not seen yet is hatched. Every outcome mark carries its pattern and its word, so it survives sunlight, greyscale printing and colour blindness.

**The One Marker Rule.** Safety Orange marks evidence and the next action, nothing else. If two things on a screen are orange, one of them is wrong.

## Typography

**Display Font:** Barlow Condensed (with Arial Narrow)
**Body Font:** IBM Plex Sans (with system-ui)
**Label/Mono Font:** IBM Plex Mono (with ui-monospace)

**Character:** Condensed drawing-sheet capitals for answers and headings, a sturdy engineering sans for sentences, and a monospace for anything that is a reference: a quote, a clip time, a tag code, a count.

### Hierarchy
Every size is a role token on `:root` (`--text-display` … `--text-label`); components use the token, never a raw pixel value.
- **Display** (700, clamp(44px, 10vw, 72px), 0.95): the report's one answer, "9 of 12 windows verified". The word "of" drops to weight 500 in the muted ink. Tabular figures, so the count doesn't shift as it changes.
- **Page** (700, clamp(40px, 9vw, 64px)): page titles, and the gap request's ask on the phone.
- **Headline** (700, 36px, 1.05): a room's name in the evidence panel.
- **Numeral** (700, 34px, tabular): counts on the plan, "2 / 4".
- **Subhead** (600, 28px): callout titles, the gap request in the report, empty-frame titles. Balanced wrapping.
- **Title** (600, 24px, uppercase, 0.03em): section heads such as ROOMS; also the outcome stamp at 0.1em.
- **Minor head** (700, 20px): a flat's name over its tags, the phone screen's wordmark. **Brand** (26px) is the header wordmark only.
- **Body** (400, 16px, 1.5): anything that is a sentence, from summaries to the query letter. Ledes run to about 640px. Pretty wrapping.
- **Control** (600, 15px): buttons, toggles, chips, plan tile names.
- **Small** (400, 14px): helper text, notes, captions, field errors.
- **Ref** (mono 400, 13px): quotes, clip times, tag codes, the plan's title block.
- **Label** (mono 400, 12px, uppercase, 0.08em): eyebrows, stat labels, status badges, outcome labels. **The floor: nothing in the app is smaller.**
- **Data** (mono 500, 28px, tabular): the In the plan / Counted figures.

### Named Rules
**The Provenance Rule.** Anything that came from somewhere (a quoted line, a clip time, a tag code) is set in mono. Anything SiteProof says in its own voice is set in sans.

**The Twelve Floor Rule.** Nothing renders below 12px, and anything that is a sentence is 16px. On a site in direct sun, small type is the first thing to go.

## Layout

Pages sit on a 1320px max container with 16px side gutters on phones and 24px from 640px up. Spacing steps are 4, 8, 12, 16, 20 and 28px; sibling groups use flex or grid with gap, and sections are 28px apart.

The report runs in two columns that wrap: the room picker (plan or 3D) on the left at a basis of 440px, the evidence panel on the right at 560px and a larger share of the width. On a phone they stack, picker first. The plan is a 3-column grid at 640px and up, 2 columns below, with the first room spanning two cells; empty cells stay open blueprint.

Forms and step pages narrow to 820px. On a phone the main action sticks to the bottom edge, full width, within thumb reach.

### Named Rules
**The Thumb Rule.** Every target is at least 44px tall, and on a phone the screen's main action is reachable without changing grip.

## Elevation & Depth

Flat. There are no drop shadows anywhere; depth comes from ink rules, tonal panels (Sheet White on Site Paper, Night Sheet on Night Blueprint) and the blueprint inserts. Inset box-shadows are used only as drawn lines: the Short outline, a selected chip's border and the wall lines of the plan.

### Named Rules
**The Flat Sheet Rule.** Nothing lifts. State is shown by fill, outline and pattern, never by elevation.

## Shapes

Every corner is square (0px): buttons, panels, inputs, tags, frames and plan rooms. Panels are bounded by 2px Drafting Ink rules in the light theme and 1px Tracing Line rules at night. The only angled element is the outcome stamp, rotated -5° with a double rule (a 3px border and a 1px outline 3px outside it), like a rubber stamp pressed by hand. Not seen yet's stamp and markers use a dashed line.

## Components

### Buttons
- **Shape:** square (0px), 44px minimum height, 0 16px padding, 14px semi-bold label.
- **Primary:** Drafting Ink fill, Site Paper text. The default action.
- **Mark:** Safety Orange fill, Drafting Ink text. The one most important action on a screen.
- **Secondary:** transparent with a 2px Drafting Ink rule.
- **Focus:** a 3px Safety Orange outline, 2px offset. Disabled buttons drop to 55% opacity.

### Segmented toggles
- **Style:** a 2px ink frame around flat segments; the active segment fills with Drafting Ink and Site Paper text and is marked `aria-pressed` or `aria-current`. Used for Builder / Buyer-bank view, Project / Upload / Report, Windows / Doors and Plan / 3D.

### Panels
- **Corner Style:** square.
- **Background:** Sheet White (Night Sheet at night).
- **Border:** 2px Drafting Ink (1px Tracing Line at 45% at night).
- **Internal Padding:** 18px 20px.

### Inputs / Fields
- **Style:** 48px tall, 2px ink rule, Sheet White fill, square, 16px text so phones don't zoom.
- **Focus:** the Safety Orange focus ring.
- **Error:** the rule turns Shortfall Rust and a rust message sits under the field.

### Status badges
- **Style:** 12px mono uppercase in a 1.5px outline of its own colour. Uploaded is muted, Processing is dashed, Done is Approved Green, Failed is Shortfall Rust on its wash.

### Outcome stamp (signature)
The room's verdict at the head of the evidence panel: Barlow Condensed 700, 24px, 0.1em tracking, uppercase, rotated -5°, double-ruled in the outcome's colour. Not seen yet's stamp is dashed.

### The plan (signature)
A blueprint sheet: Blueprint Navy under a 20px grid, rooms as tiles walled in Tracing Line, each tile filled by its outcome (Approved Green Plan, Shortfall Rust Plan with an orange inner rule, or the navy hatch), with the room name, the count in Numeral and the outcome in a small uppercase label. A title block of mono cells runs along its foot. The selected room gets a 4px Safety Orange outline inset 10px.

### Evidence frame (signature)
The best frame for each counted object, drawn at its real size with the object's mask painted over it as a Safety Orange fill at 25% and a solid Safety Orange outline. A small mono badge in the corner reads "Tracked · 2 outlined". A room that is Not seen yet shows a dashed, hatched box with "No complete sweep yet" instead of a frame.

### Tally bar
One segment per claimed item, 22px tall with 4px gaps, in claim order: Verified solid green, then Short outlined rust, then Not seen yet hatched grey. A legend repeats the counts in words.

## Do's and Don'ts

### Do:
- **Do** keep every corner square (0px) and every panel ruled in 2px Drafting Ink.
- **Do** give each outcome its fill, its pattern and its word together: solid Verified, outlined Short, hatched Not seen yet.
- **Do** set quotes, clip times and tag codes in IBM Plex Mono, with quotes on Highlighter Yellow.
- **Do** keep the plan, the 3D stage and the gap-request screen on the blueprint in both themes.
- **Do** keep touch targets at 44px or taller; set sentences at 16px and nothing below 12px.

### Don't:
- **Don't** add drop shadows, rounded corners or gradients; state is fill, outline and pattern.
- **Don't** use Safety Orange for decoration or for more than one action on a screen.
- **Don't** show Not seen yet as a number or a zero; its count is "–".
- **Don't** tell outcomes apart by colour alone.
- **Don't** add motion beyond progress and the 3D camera; respect reduced motion.
