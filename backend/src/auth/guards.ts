/**
 * The guards as the app uses them: the setup key on creating a project, and the
 * builder link on every builder route, each told how to find the project a request
 * is about.
 *
 * Stores are imported on first use, as in the route stores, so loading the app never
 * needs a database.
 */
import type { Context } from "hono";
import { readTicket } from "../routes/upload-ticket";
import { requireBuilder } from "./builder";
import { requireSetupKey } from "./setup";
import { requireUploadAllowance } from "./upload-cap";

/** Reads a required setting on use, so the app loads without it. */
export const env = (name: string) => () => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set in backend/.env`);
  return value;
};

export const setupKeyRequired = requireSetupKey(() => process.env.SETUP_KEY);

export const builderLinkRequired = requireBuilder({
  secret: env("LINK_SECRET"),
  versionOf: async (id) => {
    const { db } = await import("../db");
    const project = await db.project.findUnique({ where: { id }, select: { link_version: true } });
    return project?.link_version ?? null;
  },
});

const field = (value: unknown) => (typeof value === "string" && value ? value : null);

/** The project named in a JSON body's `project_id`. */
export const projectInJson = async (c: Context) => field(((await c.req.json()) as { project_id?: unknown }).project_id);

/** The project named in a form's `project_id`. */
export const projectInForm = async (c: Context) => field((await c.req.parseBody()).project_id);

/**
 * The project an upload ticket was issued for. Its signature is checked, its expiry is
 * not: an expired ticket from the right builder should reach the route, which says
 * plainly that the upload took too long.
 */
export const projectInTicket = async (c: Context) => {
  const ticket = field(((await c.req.json()) as { ticket?: unknown }).ticket);
  const read = ticket ? readTicket(ticket, env("UPLOAD_TICKET_SECRET")(), 0) : null;
  return read?.ok ? read.body.project_id : null;
};

export const projectOfClip = async (c: Context) => {
  const { db } = await import("../db");
  const clip = await db.clip.findUnique({ where: { id: c.req.param("id") }, select: { project_id: true } });
  return clip?.project_id ?? null;
};

export const projectOfDocument = async (c: Context) => {
  const { db } = await import("../db");
  const document = await db.document.findUnique({ where: { id: c.req.param("id") }, select: { project_id: true } });
  return document?.project_id ?? null;
};

/** A project's link versions, for `GET /projects/:id/links`. */
export const projectLinkVersions = async (id: string) => {
  const { db } = await import("../db");
  return db.project.findUnique({
    where: { id },
    select: { link_version: true, flats: { select: { id: true, link_version: true }, orderBy: { name: "asc" } } },
  });
};

/** The cap on clips per project per day. */
export const uploadAllowance = requireUploadAllowance({
  clipsSince: async (projectId, since) => {
    const { db } = await import("../db");
    return db.clip.count({ where: { project_id: projectId, created_at: { gte: since } } });
  },
  now: () => new Date(),
});

/** Whether an upload ticket's clip is registered already: completing it again costs nothing. */
export const ticketClipRegistered = async (c: Context) => {
  const ticket = field(((await c.req.json()) as { ticket?: unknown }).ticket);
  const read = ticket ? readTicket(ticket, env("UPLOAD_TICKET_SECRET")(), 0) : null;
  if (!read?.ok) return false;
  const { db } = await import("../db");
  return (await db.clip.count({ where: { object_key: read.body.object_key } })) > 0;
};
