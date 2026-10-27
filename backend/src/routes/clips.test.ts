import { expect, test } from "bun:test";
import type { ClipRecord, ClipRouteDeps } from "./clips";
import { clipRoutes } from "./clips";
import { readTicket, signTicket } from "./upload-ticket";

const SECRET = "test-secret-not-a-real-one";
const NOW = Date.UTC(2026, 9, 27, 10, 0);
const MB = 1024 * 1024;
const KEY = "siteproof/clips/0123456789abcdef0123456789abcdef.mp4";

/** Fakes for the database and R2, a fixed clock, and a record of what the routes did. */
/** The first 12 bytes of a real MP4 from a phone: a size, then "ftyp", then the brand. */
const MP4_HEAD = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);

function fakes(opts: { size?: number | null; existing?: ClipRecord; head?: Uint8Array } = {}) {
  const created: { project_id: string; object_key: string }[] = [];
  const removed: string[] = [];
  const signed: { key: string; type: string; seconds: number }[] = [];
  const clips = new Map<string, ClipRecord>();
  if (opts.existing) clips.set(opts.existing.id, opts.existing);
  const deps: ClipRouteDeps = {
    store: {
      projectExists: async (id) => id === "prj_1",
      findById: async (id) => clips.get(id) ?? null,
      findByKey: async (key) => [...clips.values()].find((c) => c.object_key === key) ?? null,
      createWithJob: async (input) => {
        created.push(input);
        const clip: ClipRecord = { id: `clip_${created.length}`, ...input, captured_at: null, status: "uploaded" };
        clips.set(clip.id, clip);
        return clip;
      },
    },
    files: {
      presignUpload: (key, type, seconds) => {
        signed.push({ key, type, seconds });
        return `https://r2.test/${key}?sig=upload`;
      },
      presignRead: (key, seconds) => `https://r2.test/${key}?sig=read&s=${seconds}`,
      sizeOf: async () => (opts.size === undefined ? 30 * MB : opts.size),
      headOf: async () => opts.head ?? MP4_HEAD,
      remove: async (key) => void removed.push(key),
    },
    ticketSecret: () => SECRET,
    now: () => NOW,
  };
  return { deps, created, removed, signed };
}

const json = (r: Response) => r.json() as Promise<any>;
const post = (deps: ClipRouteDeps, path: string, body: unknown) =>
  clipRoutes(deps).request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const ticketFor = (over: Partial<Parameters<typeof signTicket>[0]> = {}) =>
  signTicket({ project_id: "prj_1", object_key: KEY, content_type: "video/mp4", expires_at: NOW + 60 * 60 * 1000, ...over }, SECRET);

// --- POST /clips: an upload link and a ticket, nothing saved ---------------------------

test("asking to upload returns a link signed for the video's type and a ticket, and saves nothing", async () => {
  const { deps, created, signed } = fakes();

  const res = await post(deps, "/clips", { project_id: "prj_1", content_type: "video/quicktime" });

  expect(res.status).toBe(200);
  const body = await json(res);
  expect(signed).toEqual([{ key: expect.stringMatching(/^siteproof\/clips\/[0-9a-f]{32}\.mov$/), type: "video/quicktime", seconds: 1800 }]);
  expect(body.upload_url).toBe(`https://r2.test/${signed[0]!.key}?sig=upload`);
  expect(body.expires_at).toBe(new Date(NOW + 30 * 60 * 1000).toISOString());
  expect(readTicket(body.ticket, SECRET, NOW)).toEqual({
    ok: true,
    body: { project_id: "prj_1", object_key: signed[0]!.key, content_type: "video/quicktime", expires_at: NOW + 60 * 60 * 1000 },
  });
  expect(created).toHaveLength(0);
});

test("an upload for a project that does not exist is a plain 404, and no link is signed", async () => {
  const { deps, signed } = fakes();

  const res = await post(deps, "/clips", { project_id: "prj_guessed", content_type: "video/mp4" });

  expect([res.status, await json(res)]).toEqual([404, { error: "not_found" }]);
  expect(signed).toHaveLength(0);
});

test("only MP4 and MOV are offered a link: SAM reads nothing else", async () => {
  for (const body of [{ project_id: "prj_1", content_type: "video/webm" }, { project_id: "prj_1" }]) {
    const { deps, signed } = fakes();
    const res = await post(deps, "/clips", body);
    expect([res.status, (await json(res)).message]).toEqual([400, "Send an MP4 or MOV video, and the project it belongs to."]);
    expect(signed).toHaveLength(0);
  }
});

// --- POST /clips/complete: check the video arrived, then save the clip and its job ------

test("completing an upload saves the clip and its job together, and returns the clip", async () => {
  const { deps, created } = fakes();

  const res = await post(deps, "/clips/complete", { ticket: ticketFor() });

  expect(res.status).toBe(201);
  const clip = await json(res);
  expect(clip).toEqual({ id: "clip_1", project_id: "prj_1", url: `https://r2.test/${KEY}?sig=read&s=900`, captured_at: null, status: "uploaded" });
  expect(clip).not.toHaveProperty("object_key");
  expect(created).toEqual([{ project_id: "prj_1", object_key: KEY }]);
});

test("completing twice returns the same clip, with no second clip and no second job", async () => {
  const { deps, created } = fakes();
  const ticket = ticketFor();

  const first = await json(await post(deps, "/clips/complete", { ticket }));
  const again = await post(deps, "/clips/complete", { ticket });

  expect(again.status).toBe(200);
  expect(await json(again)).toEqual(first);
  expect(created).toHaveLength(1);
});

test("a forged, altered or expired ticket saves nothing", async () => {
  const forged = signTicket({ project_id: "prj_1", object_key: KEY, content_type: "video/mp4", expires_at: NOW + 3600_000 }, "another-secret");
  const cases: [string, number, string][] = [
    [forged, 400, "invalid"],
    ["junk", 400, "invalid"],
    [ticketFor({ expires_at: NOW - 1 }), 400, "expired"],
  ];
  for (const [ticket, status, error] of cases) {
    const { deps, created } = fakes();
    const res = await post(deps, "/clips/complete", { ticket });
    expect([res.status, (await json(res)).error, created.length]).toEqual([status, error, 0]);
  }
});

test("a video that has not finished uploading is not registered yet", async () => {
  const { deps, created } = fakes({ size: null });

  const res = await post(deps, "/clips/complete", { ticket: ticketFor() });

  expect([res.status, await json(res)]).toEqual([400, { error: "not_uploaded", message: "The clip hasn't finished uploading. Try again when it has." }]);
  expect(created).toHaveLength(0);
});

test("a video over 250 MB is deleted and refused, with what to do instead", async () => {
  const { deps, created, removed } = fakes({ size: 250 * MB + 1 });

  const res = await post(deps, "/clips/complete", { ticket: ticketFor() });

  expect([res.status, await json(res)]).toEqual([400, { error: "too_large", message: "This clip is over 250 MB. Film at 1080p rather than 4K." }]);
  expect([created.length, removed]).toEqual([0, [KEY]]);
});

// --- GET /clips/:id/status ----------------------------------------------------------------

test("a clip's status comes with a fresh viewing link and its capture time", async () => {
  const existing: ClipRecord = { id: "clip_9", project_id: "prj_1", object_key: KEY, captured_at: new Date(Date.UTC(2026, 9, 26, 9, 15)), status: "processing" };
  const { deps } = fakes({ existing });

  const res = await clipRoutes(deps).request("/clips/clip_9/status");

  expect(await json(res)).toEqual({ id: "clip_9", project_id: "prj_1", url: `https://r2.test/${KEY}?sig=read&s=900`, captured_at: "2026-10-26T09:15:00.000Z", status: "processing" });
});

test("a clip id we do not have is a plain 404", async () => {
  const res = await clipRoutes(fakes().deps).request("/clips/clip_guessed/status");

  expect([res.status, await json(res)]).toEqual([404, { error: "not_found" }]);
});

test("a video that is not MP4 or MOV by its contents is deleted and refused, whatever the link said", async () => {
  // WebM's own first bytes: R2 stores it happily through a link signed for MP4.
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81]);
  const { deps, created, removed } = fakes({ head: webm });

  const res = await post(deps, "/clips/complete", { ticket: ticketFor() });

  expect([res.status, await json(res)]).toEqual([400, { error: "not_a_video", message: "This isn't an MP4 or MOV video." }]);
  expect([created.length, removed]).toEqual([0, [KEY]]);
});

test("a MOV from an iPhone is accepted: its brand is qt, not isom", async () => {
  const mov = new Uint8Array([0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20]);
  const { deps, created } = fakes({ head: mov });

  expect((await post(deps, "/clips/complete", { ticket: ticketFor() })).status).toBe(201);
  expect(created).toHaveLength(1);
});
