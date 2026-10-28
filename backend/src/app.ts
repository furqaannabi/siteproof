/**
 * The SiteProof API.
 *
 * Kept apart from the server entry point so tests can call `app.request()` without
 * opening a port. Routes are added one at a time, against `@siteproof/contract`.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { api } from "@siteproof/contract";
import {
  builderLinkRequired,
  env,
  projectInForm,
  projectInJson,
  projectInTicket,
  projectOfClip,
  projectLinkVersions,
  projectOfDocument,
  setupKeyRequired,
  ticketClipRegistered,
  uploadAllowance,
} from "./auth/guards";
import { linkRoutes } from "./auth/links-route";
import { checkReadablePdf } from "./documents/read-pdf";
import { r2Files } from "./r2";
import { prismaClipStore } from "./routes/clip-store";
import { clipRoutes } from "./routes/clips";
import { prismaDocumentStore } from "./routes/document-store";
import { documentRoutes } from "./routes/documents";
import { prismaProjectStore } from "./routes/project-store";
import { projectRoutes } from "./routes/projects";

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

// Who may do what, checked before any route runs: the team's setup key to create a
// project, and the project's builder link for everything a builder does in it.
app.on("POST", api.createProject(), setupKeyRequired);
app.on("POST", api.createClip(), builderLinkRequired(projectInJson));
app.on("POST", api.completeClip(), builderLinkRequired(projectInTicket));
// At most 30 clips a project a day, checked when the link is asked for and again when
// the clip is registered, which is what queues the paid SAM 3.1 run.
app.on("POST", api.createClip(), uploadAllowance({ projectOf: projectInJson }));
app.on("POST", api.completeClip(), uploadAllowance({ projectOf: projectInTicket, alreadyRegistered: ticketClipRegistered }));
app.on("GET", api.clipStatus(":id"), builderLinkRequired(projectOfClip));
app.on("POST", api.createDocument(), builderLinkRequired(projectInForm));
app.on("GET", api.documentStatus(":id"), builderLinkRequired(projectOfDocument));

app.route("/", projectRoutes(prismaProjectStore));
app.route(
  "/",
  linkRoutes({ secret: env("LINK_SECRET"), setupKey: () => process.env.SETUP_KEY, project: projectLinkVersions }),
);
app.route(
  "/",
  clipRoutes({
    store: prismaClipStore,
    files: r2Files,
    // Read on use, so the app loads without it; a request without it is a 500.
    ticketSecret: () => {
      const secret = process.env.UPLOAD_TICKET_SECRET;
      if (!secret) throw new Error("UPLOAD_TICKET_SECRET must be set in backend/.env");
      return secret;
    },
    now: Date.now,
  }),
);
app.route("/", documentRoutes({ store: prismaDocumentStore, files: r2Files, checkReadable: checkReadablePdf }));

app.notFound((c) => c.json({ error: "not_found" }, 404));

// Never send a stack trace or an internal message to the client. Log the path and
// the error's name only: request bodies can hold presigned URLs or document text.
app.onError((err, c) => {
  console.error(`unhandled ${c.req.method} ${c.req.path}: ${err.name}`);
  return c.json({ error: "internal" }, 500);
});
