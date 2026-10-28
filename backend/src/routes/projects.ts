/**
 * `POST /projects`: create a project with its flats and rooms, and give every room
 * the code its printed tag will carry.
 *
 * See docs/decisions/2026-10-27-creating-a-project-returns-its-rooms-and-their-qr-codes.md
 */
import { Hono } from "hono";
import { z } from "zod";
import type { CreatedProject, CreateProject } from "@siteproof/contract";
import { api } from "@siteproof/contract";

/** What the store is asked to save: the request, with a code on every room. */
export interface NewProject {
  name: string;
  builder: string;
  flats: { name: string; rooms: { name: string; qr_code: string }[] }[];
}

export interface ProjectStore {
  /** Saves everything in one transaction, or nothing. */
  create(input: NewProject): Promise<CreatedProject>;
}

// Crockford's base 32: no I, L, O or U, so no character is mistaken for another,
// and all of them are in the QR alphanumeric set, which stores them compactly.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * `SP` and 8 random characters: ten in all, which fit the smallest QR version at the
 * highest error correction, so a tag survives blur and dirt. The prefix lets the
 * decoder ignore QR codes that are not ours, such as a window maker's sticker.
 */
export function newQrCode(): string {
  // 256 is a multiple of 32, so masking a random byte to 5 bits is unbiased.
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `SP${[...bytes].map((b) => CODE_ALPHABET[b & 31]).join("")}`;
}

const name = z.string().trim().min(1).max(80);

// Rooms carry only a name: a qr_code the client sends is stripped here, never kept.
const createProjectSchema = z.object({
  name,
  builder: name,
  flats: z.array(z.object({ name, rooms: z.array(z.object({ name })).min(1).max(30) })).min(1).max(50),
});

/**
 * The first name that appears twice, as it was first written, or null. Names count as
 * the same when they differ only in case, the rule the extraction parser matches
 * rooms by (the schema has already trimmed them).
 */
function firstDuplicate(names: readonly string[]): string | null {
  const seen = new Map<string, string>();
  for (const n of names) {
    const key = n.toLowerCase();
    const earlier = seen.get(key);
    if (earlier !== undefined) return earlier;
    seen.set(key, n);
  }
  return null;
}

/** Why the request's names cannot be saved, in words a builder can act on, or null. */
function duplicateNames(request: CreateProject): string | null {
  const flat = firstDuplicate(request.flats.map((f) => f.name));
  if (flat !== null) return `There are two flats named ${flat}.`;
  for (const f of request.flats) {
    const room = firstDuplicate(f.rooms.map((r) => r.name));
    // Two rooms with one name would leave every claim for either one unplaced.
    if (room !== null) return `Flat ${f.name} has two rooms named ${room}.`;
  }
  return null;
}

export function projectRoutes(store: ProjectStore) {
  const routes = new Hono();

  routes.post(api.createProject(), async (c) => {
    const parsed = createProjectSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "invalid", message: "A project needs a name, a builder, and at least one flat with at least one room." }, 400);
    }
    const request = parsed.data;
    const duplicate = duplicateNames(request);
    if (duplicate !== null) return c.json({ error: "invalid", message: duplicate }, 400);

    const created = await store.create({
      name: request.name,
      builder: request.builder,
      flats: request.flats.map((flat) => ({
        name: flat.name,
        rooms: flat.rooms.map((room) => ({ name: room.name, qr_code: newQrCode() })),
      })),
    });
    return c.json(created, 201);
  });

  return routes;
}
