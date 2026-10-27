# Creating a project returns its rooms and their QR codes; codes are short and server-made; room names are unique per flat

**Date:** 27 October 2026
**Decided by:** William
**Status:** Accepted for the QR codes and unique names. The response and request types are contract surface — proposed, awaiting Furqaan's approval

## Context

`POST /projects` creates a project with its flats and rooms, but the contract had no request shape and nothing returned rooms: `Project` holds `Flat { id, name }` only. The builder needs every room's `qr_code` to print the tags, and the setup screen needs the rooms to show them.

Rooms are matched to document lines by name, and the extraction parser leaves a claim unplaced when two rooms share one. Tags are decoded from shaky, compressed WhatsApp footage, often in dusty doorways, on sites where UPVC windows arrive with the manufacturer's own QR stickers.

## Decisions

**1. The response is `{ project: Project, rooms: Room[] }`**, with a `CreateProject` request of `{ name, builder, flats: [{ name, rooms: [{ name }] }] }`. Purely additive: no existing shape changes. Each `Room` already carries its flat's id, so grouping is the reader's. Nesting rooms inside `Flat` was declined because it would change a shape mid-sprint for no new capability; a separate rooms endpoint was declined because it does not exist and printing tags would need it.

**2. The server makes every `qr_code`: `SP` followed by 8 characters** from `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (Crockford's base 32: no I, L, O or U). The client never supplies one.

- Ten uppercase characters fit QR alphanumeric mode in the smallest QR version even at error correction level H, which recovers from about 30% of the tag being damaged. Fewer modules means bigger modules on the same printed tag, which survive blur, distance and dirt. A 36-character UUID would need a denser code.
- The `SP` prefix lets the decoder ignore QR codes that are not ours, such as a window manufacturer's sticker on the glass.
- Eight characters give about a trillion codes, so a collision with the database's global uniqueness rule is not a practical concern.
- People check a tag by the label printed under it ("Flat 302 · Bedroom 2"), not by reading the code.

A readable client-chosen code (`302-BED2`) was declined: every project has one, and `qr_code` is unique across all projects.

**3. Duplicate names are refused with a 400 that names them:** two rooms with one name in a flat, or two flats with one name in a project. Names are compared trimmed and case-insensitively, the same rule the parser matches rooms by. The same room name in different flats is allowed. Auto-renaming was declined because it invents a name no document will ever contain.

Limits: at least one flat, each with at least one room; names of 1 to 80 characters; at most 50 flats and 30 rooms per flat.

## Consequences

- Furqaan's tag decoder should accept only `SP`-prefixed codes. Told separately.
- The two new types live in `backend/src/routes/projects.ts` until approved, then move to `contract/`.
- A BOQ covering a multi-flat project, where every flat has a Bedroom 2, fails safe today: the parser leaves the claim unplaced rather than guess a flat. The cover goes in the `extract_document` job, where the room list is built: a document with a flat is offered only that flat's rooms; a whole-project document in a project with several flats is offered names qualified by flat ("302 / Bedroom 2"), which are unique, so the parser needs no change. A BOQ line that names no flat stays unplaced. The MVP is one flat, so the demo never reaches this.
- Not settled here: who may call this endpoint. There is no auth yet, so it must not be deployed open.
