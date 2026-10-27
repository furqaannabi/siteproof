/**
 * The SiteProof API.
 *
 * Kept apart from the server entry point so tests can call `app.request()` without
 * opening a port. Routes are added one at a time, against `@siteproof/contract`.
 */
import { Hono } from "hono";

export const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

app.notFound((c) => c.json({ error: "not_found" }, 404));

// Never send a stack trace or an internal message to the client. Log the path and
// the error's name only: request bodies can hold presigned URLs or document text.
app.onError((err, c) => {
  console.error(`unhandled ${c.req.method} ${c.req.path}: ${err.name}`);
  return c.json({ error: "internal" }, 500);
});
