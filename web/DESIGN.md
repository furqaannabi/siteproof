---
name: SiteProof
description: Verified construction progress from the footage builders already take.
colors:
  binding-green: "#1d4a3c"
  binding-green-light: "#2a5d4d"
  binding-ink: "#e9f1ec"
  form-ground: "#eef2ed"
  form-panel: "#f8faf6"
  ticket-paper: "#fffdf7"
  book-ink: "#15201b"
  book-ink-soft: "#3c4a43"
  book-ink-muted: "#56645d"
  printed-rule: "#9db8aa"
  printed-rule-strong: "#2f6b57"
  link-green: "#1f5c49"
  stamp-violet: "#5a3d9a"
  stamp-violet-tint: "#ece6f7"
  verified-green: "#1f6b45"
  verified-tint: "#dcefe3"
  short-amber: "#a35408"
  short-fill: "#f8e7d2"
  short-panel: "#fbf1e6"
  not-seen-slate: "#4c5a54"
  marker-orange: "#ff7a1a"
  plan-green: "#1d4a3c"
  plan-deep: "#133428"
  plan-line: "#cfe3d8"
  plan-ink: "#f2f8f4"
  plan-verified: "#2a6b4f"
  plan-short: "#6b4120"
  plan-label-verified: "#a8ecc0"
  plan-label-short: "#ffc27a"
  plan-amber: "#f2a65a"
  tag-paper: "#ffffff"
typography:
  answer:
    fontFamily: "Anek Latin, Arial Narrow, sans-serif"
    fontSize: "clamp(64px, 16vw, 128px)"
    fontWeight: 800
    lineHeight: 0.9
    fontFeature: "tnum"
  display:
    fontFamily: "Anek Latin, Arial Narrow, sans-serif"
    fontSize: "clamp(44px, 10vw, 72px)"
    fontWeight: 800
    lineHeight: 0.95
  page:
    fontFamily: "Anek Latin, Arial Narrow, sans-serif"
    fontSize: "clamp(40px, 9vw, 64px)"
    fontWeight: 800
    lineHeight: 1
  headline:
    fontFamily: "Anek Latin, Arial Narrow, sans-serif"
    fontSize: "36px"
    fontWeight: 800
    lineHeight: 1.05
  numeral:
    fontFamily: "Anek Latin, Arial Narrow, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tnum"
  subhead:
    fontFamily: "Anek Latin, Arial Narrow, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.08
  brand:
    fontFamily: "Anek Latin, Arial Narrow, sans-serif"
    fontSize: "26px"
    fontWeight: 700
  section:
    fontFamily: "Anek Latin, Arial Narrow, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.1
  minor-head:
    fontFamily: "Anek Latin, Arial Narrow, sans-serif"
    fontSize: "20px"
    fontWeight: 700
  body:
    fontFamily: "Mukta, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  control:
    fontFamily: "Mukta, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  small:
    fontFamily: "Mukta, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  ref:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "Mukta, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    letterSpacing: "0.06em"
rounded:
  tag: "4px"
  control: "6px"
  panel: "8px"
  card: "16px"
  pill: "999px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.binding-green}"
    textColor: "{colors.binding-ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.form-panel}"
    textColor: "{colors.book-ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-pill:
    backgroundColor: "{colors.binding-green}"
    textColor: "{colors.binding-ink}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "46px"
  button-record:
    backgroundColor: "{colors.marker-orange}"
    textColor: "{colors.book-ink}"
    rounded: "{rounded.pill}"
    height: "60px"
    width: "100%"
  nav-item-current:
    backgroundColor: "{colors.binding-green-light}"
    textColor: "{colors.tag-paper}"
    rounded: "{rounded.panel}"
    padding: "0 14px"
    height: "44px"
  panel:
    backgroundColor: "{colors.form-panel}"
    textColor: "{colors.book-ink}"
    rounded: "{rounded.panel}"
    padding: "18px 20px"
  input:
    backgroundColor: "{colors.form-panel}"
    textColor: "{colors.book-ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "48px"
  notice:
    backgroundColor: "{colors.tag-paper}"
    textColor: "{colors.book-ink}"
    rounded: "{rounded.card}"
    padding: "36px 28px 30px"
  ticket:
    backgroundColor: "{colors.ticket-paper}"
    textColor: "{colors.book-ink}"
    rounded: "{rounded.panel}"
  quote:
    backgroundColor: "{colors.stamp-violet-tint}"
    textColor: "{colors.book-ink}"
    typography: "{typography.ref}"
    padding: "0 3px"
---

# Design System: SiteProof

## Overview

**Creative North Star: "The Measurement Book"**

SiteProof looks like the measurement book a site engineer carries: a bottle-green cloth binding round cool, ruled form stock, filled in by hand and checked with a rubber stamp. The binding is the shell (the sidebar, the header, the phone's tab bar, the primary actions). The pages are the ground and the panels, ruled with one printed hairline. A violet stamp means one thing: SiteProof's code checked this. A quote matched word for word, a count with its frames, a citation re-checked.

It is a working book, not a dashboard. Each page opens on what needs the builder first, then the evidence, in big condensed numerals for the answer and a plain, sturdy sans for every sentence. It has to hold up on a cheap phone in direct sun, so contrast, pattern and words do the work that subtle colour would do indoors. It runs in one light theme only.

Depth is soft and sparing: cards lift a little off the page, buttons are rounded and quiet, and the flat is drawn as a small plan at an angle so a builder can tell rooms apart at a glance. The plan is never to scale, and nothing on it pretends to know where a wall, a door or a window is.

**Key Characteristics:**
- A bottle-green binding for everything that moves you around; cool form stock for everything you read.
- Violet means checked by code, and nothing else.
- Three outcomes told apart by fill, pattern and word, never by colour alone.
- Marker orange outlines evidence and marks the one room to film; it never decorates.
- Gently rounded (6–8px) controls and panels, pill-shaped actions, soft shadows only under cards that float.

## Colors

A green binding, cool paper and one hairline rule, with a violet stamp, three outcome colours and one marker.

### Primary
- **Binding Green** ({colors.binding-green}): the sidebar, the header, the phone's tab bar, the next-step band and primary buttons. **Binding Green Light** ({colors.binding-green-light}) is its hover and the band's ground, and **Binding Ink** ({colors.binding-ink}) is text and icons on it.
- **Stamp Violet** ({colors.stamp-violet}) on **Stamp Violet Tint** ({colors.stamp-violet-tint}): checked by code. Quotes matched word for word, the "quote checked" mark, the counted-number ring, re-checked citations, the text selection and the caret.

### Secondary
- **Marker Orange** ({colors.marker-orange}): the one colour that must read on any photo. Object outlines on evidence frames, the selected room's outline on the plan, the room to film on the gap request, the gap request's ticket edge and its record button.
- **Link Green** ({colors.link-green}): links in running text.

### Tertiary (the outcomes)
- **Verified Green** ({colors.verified-green}) on **Verified Tint** ({colors.verified-tint}): Verified. Solid fill.
- **Short Amber** ({colors.short-amber}) with **Short Fill** ({colors.short-fill}) and **Short Panel** ({colors.short-panel}): Short. An outline round a pale fill; also warnings, errors and the "couldn't refresh" strip.
- **Not Seen Slate** ({colors.not-seen-slate}): Not seen yet. A dashed outline over a 45° hatch, never a solid fill.

### Neutral
- **Form Ground** ({colors.form-ground}): the page ground.
- **Form Panel** ({colors.form-panel}): panels and inputs. **Ticket Paper** ({colors.ticket-paper}): the gap request's ticket. **Tag Paper** ({colors.tag-paper}): notice cards, printed room tags and the printed report, which stay plain white.
- **Book Ink** ({colors.book-ink}): text and the focus ring. **Book Ink Soft** ({colors.book-ink-soft}) for secondary text, **Book Ink Muted** ({colors.book-ink-muted}) for labels, notes and placeholders.
- **Printed Rule** ({colors.printed-rule}): the one hairline, on panels, dividers and the plan's unlit rooms. **Printed Rule Strong** ({colors.printed-rule-strong}) for input borders and quiet emphasis.
- **The plan's greens**: **Plan Green** ({colors.plan-green}) and **Plan Deep** ({colors.plan-deep}) for the 3D stage, **Plan Line** ({colors.plan-line}) and **Plan Ink** ({colors.plan-ink}) for lines and names on it, **Plan Verified** ({colors.plan-verified}) and **Plan Short** ({colors.plan-short}) for room floors, with **Plan Label Verified** ({colors.plan-label-verified}), **Plan Label Short** ({colors.plan-label-short}) and **Plan Amber** ({colors.plan-amber}) for labels and the Short rule.

### Named Rules
**The Stamp Rule.** Violet means SiteProof's code checked it. A model's output, a builder's claim or a link is never violet.

**The Three Patterns Rule.** Verified is solid, Short is outlined, Not seen yet is dashed and hatched. Every outcome mark carries its pattern and its word, so it survives sunlight, greyscale printing and colour blindness.

**The One Marker Rule.** Marker Orange outlines evidence or marks the one room to film. If two unrelated things on a screen are orange, one of them is wrong.

## Typography

**Display Font:** Anek Latin, condensed through its width axis (with Arial Narrow)
**Body Font:** Mukta (with system-ui)
**Reference Font:** the system monospace (ui-monospace, SF Mono, Menlo, Consolas)

**Character:** Tall, condensed figures for answers and headings, like numbers entered in a ruled column; a warm, plain sans for every sentence, drawn for Indian languages as well as Latin; and a monospace for anything copied from somewhere else.

### Hierarchy
Every size is a role token on `:root` (`--text-answer` … `--text-label`); components use the token, never a raw pixel value. Figures are tabular everywhere, so counts don't shift as they change.
- **Answer** (800, clamp(64px, 16vw, 128px)): the report's one verified count, "9 of 12".
- **Display** (800, clamp(44px, 10vw, 72px)) and **Page** (800, clamp(40px, 9vw, 64px)): page titles.
- **Headline** (800, 36px): a room's name in the evidence panel. **Numeral** (800, 34px): counts.
- **Subhead** (800, 28px): the gap request's ask, a notice's title, card titles. Balanced wrapping.
- **Section** (800, 24px): section heads such as "Needs you" and "Room by room".
- **Minor head** (700, 20px); **Brand** (700, 26px) is the wordmark only.
- **Body** (Mukta 400, 16px, 1.5): anything that is a sentence.
- **Control** (Mukta 600, 15px): buttons, toggles, chips, nav items.
- **Small** (Mukta 400, 14px): helper text, notes, captions, field errors.
- **Ref** (mono 13px): quotes, clip times, tag codes.
- **Label** (Mukta 700, 12px, uppercase, 0.06em): eyebrows, stat labels, the ticket's field names. **The floor: nothing in the app is smaller.**

### Named Rules
**The Provenance Rule.** Anything copied from somewhere (a quoted line, a clip time, a tag code) is set in mono. Anything SiteProof says in its own voice is set in sans.

**The Twelve Floor Rule.** Nothing renders below 12px, and anything that is a sentence is 16px. On a site in direct sun, small type is the first thing to go.

## Layout

On a computer (960px and up) the builder's pages sit beside a fixed 240px sidebar in Binding Green: All projects, then each project with its Overview, Upload and Report under it, then New project. The sidebar is the same on every page, so nothing moves when you switch. Above each page runs a light strip with where you are ("All projects › Northfield Residency, Tower B › Overview") and the page's own controls. Below 960px the sidebar gives way to a tab bar along the bottom edge: the project's three pages and Projects, or All projects and New project.

Pages sit in a 1240px container with 16px side gutters on phones and 24px from 640px up. Spacing steps are 4, 8, 12, 16, 20 and 28px; sibling groups use flex or grid with gap, and sections are 28px apart. Breakpoints are 520px (tight phone), 640px (gutters and two columns) and 960px (the sidebar).

The pages a buyer, a bank or a site supervisor opens from a link (the report link and the gap request) have no sidebar and no tab bar: a link opens one flat or one room and leads nowhere else in the app. The gap request is a single 560px column with its record button fixed to the bottom edge, full width.

### Named Rules
**The Thumb Rule.** Every target is at least 44px tall, and on a phone the screen's main action is reachable without changing grip.

**The Steady Shell Rule.** The sidebar and tab bar never change between a project's pages; only the highlighted item does.

## Elevation & Depth

Mostly flat, with soft lift where something floats. Panels sit on the ground with a hairline and no shadow. Cards that stand alone (a notice, the gap request's ticket, the to-do list, the projects list's boxes) lift with a soft green-black shadow (0 10–12px 26–30px at 7–10%). The record button carries an orange glow (0 8px 20px, orange at 35%). Insets are drawn lines, not depth: the orange bar on the current nav item and the Short outline.

### Named Rules
**The Soft Lift Rule.** Only a card that stands on its own lifts. Rows, panels and anything inside a card stay flat.

## Shapes

Gently rounded. Status badges and tags at 4px, inputs and buttons at 6px, panels, nav items and the ticket at 8px, notice cards at 16px. Actions that lead somewhere (the next-step band, the header's controls, notices, the gap request) are pills (999px). The violet "checked" stamp is a circle, rotated -6°, and Not seen yet's stamp is dashed. The plan is drawn at an angle (isometric) with low walls, so rooms read as rooms without pretending to be to scale.

## Components

### Buttons
- **Primary:** Binding Green fill, Binding Ink text, 6px corners, 44px tall, 0 16px padding. Hover goes to Binding Green Light.
- **Secondary:** Form Panel fill with a 1px Book Ink border; hover goes white.
- **Pill:** the same colours at 999px and 46px tall, for the next-step band, the header controls and notices.
- **Record:** Marker Orange, full width, 60px, pill-shaped, with a camera icon and an orange glow. The gap request's one action.
- **States:** a press nudges down 1px; disabled drops to 55%; focus is a 3px Book Ink outline, 2px offset (Binding Ink on the dark header).

### Navigation
- **Sidebar item:** 44px, 8px corners, Binding Ink at 82% with a 20px icon. Hover lightens the background and keeps the light text. The current item gets a lighter fill, white text and an orange bar on its left edge.
- **Tab bar:** icons over labels on Binding Green; the current tab has an orange line along its top.
- **Crumbs:** on the light strip, chevrons between, the current page in Book Ink.

### Panels
- **Background:** Form Panel, a 1px Printed Rule border, 8px corners, 18px 20px padding, no shadow.

### Inputs / Fields
- **Style:** 48px tall, 1px Printed Rule Strong border, Form Panel fill, 6px corners, 16px text so phones don't zoom. The label sits above in Small, semi-bold.
- **Error:** the border turns Short Amber and a message sits under the field.
- **Room chips:** rooms typed into New project become removable chips; Enter or a comma adds one.

### Status badges
- **Style:** 13px semi-bold in a 1.5px outline of its own colour, 4px corners. Processing is violet and dashed, Done is Verified Green filled, Failed is Short Amber on its panel.

### Notice (signature)
Every dead end uses one card: a broken or replaced link, a project that isn't there, no connection, the 404. White, 16px corners, a soft lift, centred: a 68px icon in a circle, a Subhead title, one plain sentence on what to do, and at most two pill buttons. Server trouble and errors turn the icon Short Amber. A report link's notice has no button at all.

### Gap request ticket (signature)
The site supervisor's page is a job ticket on Ticket Paper with a 6px orange edge: "Footage needed" in amber capitals, Flat and Room in boxes, a small plan of the flat with the room to film lit orange and pinned ("Plan not to scale"), the request's own sentence, and the steps numbered 01, 02, 03 on ruled lines.

### The plan (signature)
The flat drawn at an angle: each room a floor tile coloured by its outcome, with low walls, far outer walls drawn full height, windows and doors as markers set into or standing on the walls, and a pill label with a state dot. The selected room gets a Binding Green label and an orange floor outline. The projects list draws a tiny flat version of the same plan for each flat.

### Evidence frame (signature)
The best frame for each counted object at its real size, the object's mask in Marker Orange at 25% with a solid orange outline. A small badge in the corner says how many are outlined. A room that is Not seen yet shows a dashed, hatched box instead of a frame.

### Tally bar
One segment per claimed item, in claim order: Verified solid green, Short outlined amber, Not seen yet hatched. A legend repeats the counts in words.

## Do's and Don'ts

### Do:
- **Do** keep the sidebar and tab bar identical on every page of a project.
- **Do** give each outcome its fill, its pattern and its word together: solid Verified, outlined Short, dashed and hatched Not seen yet.
- **Do** keep violet for what code has checked: matched quotes, counts with frames, re-checked citations.
- **Do** set quotes, clip times and tag codes in mono, with quotes on Stamp Violet Tint.
- **Do** say "Plan not to scale" wherever the plan points at a room, and mark the room, never a spot in it.
- **Do** keep touch targets at 44px or taller; set sentences at 16px and nothing below 12px.

### Don't:
- **Don't** use violet for a model's output, a builder's claim or decoration.
- **Don't** use Marker Orange for more than evidence and the room to film.
- **Don't** show Not seen yet as a number or a zero; its count is "–".
- **Don't** tell outcomes apart by colour alone.
- **Don't** shadow rows or panels; only standalone cards lift.
- **Don't** put a sidebar, tab bar or link into the builder's pages on a buyer's, bank's or supervisor's link page.
- **Don't** add motion beyond progress, a card rising in, a stamp pressing and the 3D camera; respect reduced motion.
