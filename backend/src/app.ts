/**
 * The SiteProof API.
 *
 * Kept apart from the server entry point so tests can call `app.request()` without
 * opening a port. Routes are added one at a time, against `@siteproof/contract`.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { prismaDocumentStore } from "./routes/document-store";
import { documentRoutes } from "./routes/documents";

export const app = new Hono();

// Only the sites listed in WEB_ORIGINS may call the API from a browser. With none
// listed, every site is refused: deny by default.
app.use(
  cors({
    origin: (origin) => {
      const allowed = (process.env.WEB_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
      return allowed.includes(origin) ? origin : null;
    },
  }),
);

app.get("/health", (c) => c.json({ ok: true }));

app.route("/", documentRoutes(prismaDocumentStore));

app.notFound((c) => c.json({ error: "not_found" }, 404));

// Never send a stack trace or an internal message to the client. Log the path and
// the error's name only: request bodies can hold presigned URLs or document text.
app.onError((err, c) => {
  console.error(`unhandled ${c.req.method} ${c.req.path}: ${err.name}`);
  return c.json({ error: "internal" }, 500);
});
