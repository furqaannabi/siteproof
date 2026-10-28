/**
 * Load the demo project into a running backend in one command: Flat 302 with its
 * rooms, then the sample BOQ, demand letter and invoice, waiting until each has
 * been read. Talks to the API over HTTP, as the app does, so the access checks
 * and the job worker are the real ones.
 *
 *   pnpm --filter @siteproof/backend dev                     # in one terminal
 *   bun --env-file=.env scripts/seed-demo.ts [--api URL]     # in another
 *
 * Needs SETUP_KEY in backend/.env. Prints the project's builder and report links:
 * they are credentials, so they go to this terminal only, never to a file.
 *
 * The rooms here must match the room names in the sample documents. When the real
 * flat's names and counts arrive, change both together.
 */
import { join, resolve } from "node:path";
import { api, type ClipStatus, type CreatedProject, type CreateProject, type Document, type ProjectLinks } from "@siteproof/contract";

const ROOMS = ["Living Room", "Kitchen", "Bedroom 1", "Bedroom 2", "Bedroom 3"];
const DOCUMENTS: { kind: Document["kind"]; file: string }[] = [
  { kind: "boq", file: "boq.pdf" },
  { kind: "demand_letter", file: "demand-letter.pdf" },
  { kind: "invoice", file: "invoice.pdf" },
];
const FIXTURES = resolve(import.meta.dir, "../fixtures/documents");
// Reading a document takes 20-30 s; allow for a queue behind it.
const WAIT_SECONDS = 180;

const at = Bun.argv.indexOf("--api");
const base = at === -1 ? `http://localhost:${process.env.PORT ?? 4000}` : Bun.argv[at + 1]!;
const setupKey = process.env.SETUP_KEY;
if (!setupKey) throw new Error("SETUP_KEY must be set in backend/.env");

/** One API call; stops the script with the API's own plain message on a refusal. */
async function call<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } }).catch(() => {
    throw new Error(`No backend at ${base}. Start it with: pnpm --filter @siteproof/backend dev`);
  });
  const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${body.message ?? body.error ?? "no message"}`);
  return body as T;
}

const project: CreateProject = {
  name: "Northfield Residency (demo)",
  builder: "Northfield Constructions (sample)",
  flats: [{ name: "302", rooms: ROOMS.map((name) => ({ name })) }],
};
const created = await call<CreatedProject>(api.createProject(), setupKey, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(project),
});
const flat = created.project.flats[0]!;
const links = await call<ProjectLinks>(api.projectLinks(created.project.id), setupKey);
const builder = links.builder_token;

const uploaded = await Promise.all(
  DOCUMENTS.map(async ({ kind, file }) => {
    const form = new FormData();
    form.set("project_id", created.project.id);
    form.set("flat_id", flat.id);
    form.set("kind", kind);
    form.set("file", new File([await Bun.file(join(FIXTURES, file)).arrayBuffer()], file, { type: "application/pdf" }));
    return call<Document>(api.createDocument(), builder, { method: "POST", body: form });
  }),
);
console.log(`Uploaded ${uploaded.length} documents; waiting for them to be read...`);

/** Polls a document until it is done or failed, as the upload screen does. */
async function settled(id: string): Promise<Document & { reason?: string | null }> {
  const until = Date.now() + WAIT_SECONDS * 1000;
  for (;;) {
    const doc = await call<Document & { reason?: string | null }>(api.documentStatus(id), builder);
    const status: ClipStatus = doc.status;
    if (status === "done" || status === "failed" || Date.now() > until) return doc;
    await Bun.sleep(2000);
  }
}
const finished = await Promise.all(uploaded.map((d) => settled(d.id)));

console.log(`\nDemo project: ${created.project.name}, Flat ${flat.name}`);
console.log(`  project id            ${created.project.id}`);
console.log(`  builder link token    ${builder}`);
console.log(`    (a credential: it can upload to this project. Keep it out of chats and files.)`);
for (const r of links.report_tokens) console.log(`  report link, Flat ${flat.name}  ${r.token}`);
console.log(`\nRoom tags to print:`);
for (const room of created.rooms) console.log(`  ${room.name.padEnd(12)} ${room.qr_code}`);
console.log(`\nDocuments:`);
for (const doc of finished) {
  const still = doc.status !== "done" && doc.status !== "failed" ? " (still not finished: is the job worker running?)" : "";
  console.log(`  ${doc.kind.padEnd(14)} ${doc.status}${doc.reason ? `: ${doc.reason}` : ""}${still}`);
}
