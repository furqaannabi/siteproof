/**
 * A pretend backend that lives in the browser, so every screen works before the API
 * does. It keeps what you create in localStorage (when the browser allows it) and
 * walks each upload through uploaded → processing → done on a timer.
 *
 * It never decides an outcome the way the real engine will. The one piece of
 * "pipeline" it fakes is the demo story's last step: a clip filmed from a gap request
 * in the demo project clears that room, as the real kitchen clip will on stage.
 */
import type { Clip, ClipStatus, CreatedProject, CreateProject, Document, GapRequest, Project, ProjectLinks, ProjectOverview, Report, Room } from "@siteproof/contract";
import { detections, flat302 } from "@/mocks/flat-302";
import type { NewDocument } from "./types";

// v2: one record per project, cut into an overview and per-flat reports (contract of 28 October).
const KEY = "siteproof-mock-v2";

/** Everything the mock holds for one project. The server keeps the same, in tables. */
export type MockProject = ProjectOverview & Omit<Report, "project" | "flat" | "rooms" | "documents">;
const UPLOADED_FOR_MS = 1500;
const PROCESSING_FOR_MS = 5000;

interface Upload {
  kind: "clip" | "document";
  project_id: string;
  /** When the file finished uploading. null while it is still on its way. */
  uploaded_at: number | null;
  /** Mock only: the room a gap-request clip was filmed for. The real pipeline reads the room tag instead. */
  room_hint: string | null;
}

interface State {
  projects: Record<string, MockProject>;
  uploads: Record<string, Upload>;
  /** Which version of the demo seed the saved demo project was copied from. */
  seed?: string;
}

// A fingerprint of the demo seed. When mocks/flat-302.ts changes, a browser that saved
// the old demo gets the new one; projects the user created are kept.
const SEED = (() => {
  const text = JSON.stringify(flat302);
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return String(h);
})();

let state: State | null = null;

function load(): State {
  if (state) return state;
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved) state = JSON.parse(saved) as State;
  } catch {
    // Private window or blocked storage: start fresh, in memory only.
  }
  state ??= { projects: {}, uploads: {} };
  if (state.seed !== SEED || !state.projects[flat302.project.id]) {
    state.projects[flat302.project.id] = structuredClone(flat302);
    state.seed = SEED;
  }
  return state;
}

function save() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable: the mock still works until the tab closes.
  }
}

/** Forget everything created in mock mode and restore the demo project. */
export function resetMock() {
  state = { projects: {}, uploads: {}, seed: SEED };
  state.projects[flat302.project.id] = structuredClone(flat302);
  save();
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Same alphabet as the backend: Crockford's base 32, no I, L, O or U.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function tagCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return "SP" + Array.from(bytes, (b) => ALPHABET[b % 32]).join("");
}

function statusOf(upload: Upload | undefined): ClipStatus {
  if (!upload || upload.uploaded_at === null) return "uploaded";
  const age = Date.now() - upload.uploaded_at;
  if (age < UPLOADED_FOR_MS) return "uploaded";
  if (age < UPLOADED_FOR_MS + PROCESSING_FOR_MS) return "processing";
  return "done";
}

function projectOf(projectId: string): MockProject {
  const project = load().projects[projectId];
  if (!project) throw new MockError(404, "not_found");
  return project;
}

/** One flat's report, holding nothing of any other flat: what `GET /flats/:id/report` returns. */
function cutReport(p: MockProject, flatId: string): Report {
  const flat = p.project.flats.find((f) => f.id === flatId);
  if (!flat) throw new MockError(404, "not_found");
  const rooms = p.rooms.filter((r) => r.flat === flatId);
  const roomIds = new Set(rooms.map((r) => r.id));
  // The documents that bill this flat, plus the project's BOQ.
  const documents = p.documents.filter((d) => d.flat_id === flatId || (d.flat_id === null && d.kind === "boq"));
  const docIds = new Set(documents.map((d) => d.id));
  const claims = p.claims.filter((c) => docIds.has(c.doc_id) && (c.room_id === null || roomIds.has(c.room_id)));
  const claimIds = new Set(claims.map((c) => c.id));
  return {
    project: { id: p.project.id, name: p.project.name, builder: p.project.builder },
    flat,
    rooms,
    documents,
    claims,
    results: p.results.filter((r) => claimIds.has(r.claim_id)),
    not_checked: p.not_checked.filter((n) => claimIds.has(n.claim_id)),
    detections: p.detections.filter((d) => roomIds.has(d.room_id)),
    segments: p.segments.filter((s) => s.room_id !== null && roomIds.has(s.room_id)),
    gap_requests: p.gap_requests.filter((g) => roomIds.has(g.room_id)),
    query_letters: p.query_letters.filter((q) => claimIds.has(q.claim_id)),
  };
}

function projectOfFlat(flatId: string): MockProject {
  const project = Object.values(load().projects).find((p) => p.project.flats.some((f) => f.id === flatId));
  if (!project) throw new MockError(404, "not_found");
  return project;
}

/** Bring every upload's status up to date, and apply the demo's gap-filling clip once it is done. */
function settle(report: MockProject) {
  const uploads = load().uploads;
  for (const clip of report.clips) {
    const upload = uploads[clip.id];
    if (!upload) continue;
    const status = statusOf(upload);
    if (status === clip.status) continue;
    clip.status = status;
    if (status === "done" && upload.room_hint) fillGap(report, clip, upload.room_hint);
  }
  for (const doc of report.documents) {
    if (uploads[doc.id]) doc.status = statusOf(uploads[doc.id]);
  }
}

function fillGap(report: MockProject, clip: Clip, roomId: string) {
  if (report.project.id !== flat302.project.id) return;
  report.segments.push({ clip_id: clip.id, room_id: roomId, t_start: 0, t_end: 5, full_sweep: true, captured_at: clip.captured_at });
  for (const claim of report.claims.filter((c) => c.room_id === roomId)) {
    if (claim.item === "not_countable") continue;
    const result = report.results.find((r) => r.claim_id === claim.id);
    if (!result || result.outcome !== "not_seen") continue;
    const found = detections(roomId, claim.item, claim.qty, clip.id);
    report.detections.push(...found);
    Object.assign(result, {
      counted: claim.qty,
      outcome: "verified",
      room_covered: true,
      evidence: [...new Set(found.map((d) => d.best_frame_url))],
    });
  }
  for (const g of report.gap_requests) if (g.room_id === roomId) g.status = "cleared";
}

/** Reports progress in steps, as a real upload would, then starts the status clock. */
async function pretendToSend(id: string, file: File, onProgress: (fraction: number) => void) {
  const steps = Math.min(20, Math.max(5, Math.round(file.size / 2_000_000)));
  for (let i = 1; i <= steps; i++) {
    await delay(120);
    onProgress(i / steps);
  }
  const upload = load().uploads[id];
  if (upload) upload.uploaded_at = Date.now();
  save();
}

export const mockSource = {
  async listProjects(): Promise<Project[]> {
    await delay(100);
    return Object.values(load().projects).map((p) => p.project);
  },

  async getOverview(projectId: string): Promise<ProjectOverview> {
    await delay(150);
    const p = projectOf(projectId);
    settle(p);
    save();
    return structuredClone({ project: p.project, rooms: p.rooms, documents: p.documents, clips: p.clips, segments: p.segments });
  },

  async getFlatReport(flatId: string): Promise<Report> {
    await delay(200);
    const p = projectOfFlat(flatId);
    settle(p);
    save();
    return structuredClone(cutReport(p, flatId));
  },

  /** Pretend links. The mock checks no tokens: every project on this device is open. */
  async getLinks(projectId: string): Promise<ProjectLinks> {
    await delay(100);
    const p = projectOf(projectId);
    return {
      builder_token: `mock-builder-${projectId}`,
      report_tokens: p.project.flats.map((f) => ({ flat_id: f.id, token: `mock-report-${f.id}` })),
    };
  },

  async getReportByLink(token: string): Promise<Report> {
    const flatId = token.startsWith("mock-report-") ? token.slice("mock-report-".length) : "";
    return this.getFlatReport(flatId);
  },

  async createProject(body: CreateProject): Promise<CreatedProject> {
    await delay(400);
    const s = load();
    const projectId = crypto.randomUUID();
    const flats = body.flats.map((f) => ({ id: crypto.randomUUID(), name: f.name.trim() }));
    const rooms: Room[] = body.flats.flatMap((f, i) =>
      f.rooms.map((r) => ({ id: crypto.randomUUID(), flat: flats[i].id, name: r.name.trim(), qr_code: tagCode() })),
    );
    const project = { id: projectId, name: body.name.trim(), builder: body.builder.trim(), flats };
    s.projects[projectId] = {
      project,
      rooms,
      documents: [],
      clips: [],
      segments: [],
      claims: [],
      results: [],
      not_checked: [],
      detections: [],
      gap_requests: [],
      query_letters: [],
    };
    save();
    return { project, rooms };
  },

  /** Registers the clip at once, then pretends to send it and starts its status clock. */
  async uploadClip(projectId: string, file: File, onProgress: (fraction: number) => void, roomHint: string | null = null): Promise<Clip> {
    await delay(200);
    const report = projectOf(projectId);
    const clip: Clip = {
      id: crypto.randomUUID(),
      project_id: projectId,
      url: "",
      captured_at: file.lastModified ? new Date(file.lastModified).toISOString() : null,
      status: "uploaded",
    };
    report.clips.push(clip);
    load().uploads[clip.id] = { kind: "clip", project_id: projectId, uploaded_at: null, room_hint: roomHint };
    save();
    await pretendToSend(clip.id, file, onProgress);
    return clip;
  },

  async uploadDocument(input: NewDocument, file: File, onProgress: (fraction: number) => void): Promise<Document> {
    await delay(200);
    const report = projectOf(input.project_id);
    const doc: Document = { id: crypto.randomUUID(), ...input, status: "uploaded", reason: null };
    report.documents.push(doc);
    load().uploads[doc.id] = { kind: "document", project_id: input.project_id, uploaded_at: null, room_hint: null };
    save();
    await pretendToSend(doc.id, file, onProgress);
    return doc;
  },

  async clipStatus(clipId: string): Promise<ClipStatus> {
    await delay(100);
    return statusOf(load().uploads[clipId]);
  },

  async documentStatus(documentId: string): Promise<Document> {
    await delay(100);
    for (const report of Object.values(load().projects)) {
      const doc = report.documents.find((d) => d.id === documentId);
      if (doc) return { ...doc, status: statusOf(load().uploads[doc.id]) };
    }
    throw new MockError(404, "not_found");
  },

  /** As the backend: send the room's live request, or write one with the fixed steps. */
  async requestFootage(roomId: string): Promise<GapRequest> {
    await delay(300);
    const p = Object.values(load().projects).find((x) => x.rooms.some((r) => r.id === roomId));
    const room = p?.rooms.find((r) => r.id === roomId);
    if (!p || !room) throw new MockError(404, "not_found");
    const live = p.gap_requests.find((g) => g.room_id === roomId && g.status !== "cleared");
    if (live) {
      live.status = "sent";
      save();
      return structuredClone(live);
    }
    const swept = p.segments.some((s) => s.room_id === roomId && s.full_sweep);
    const notSeen = p.claims.some((c) => c.room_id === roomId && p.results.some((r) => r.claim_id === c.id && r.outcome === "not_seen"));
    if (swept && !notSeen) throw new MockError(409, "This room already has a one-way sweep from its room tag, so there's nothing to film.");
    const flat = p.project.flats.find((f) => f.id === room.flat);
    const lower = room.name.toLowerCase();
    const gap: GapRequest = {
      id: crypto.randomUUID(),
      room_id: roomId,
      text: `Need 5 s of Flat ${flat?.name ?? ""} ${lower}, one slow sweep from its room tag`,
      steps: [`Start with the ${lower}'s room tag in view, at the door.`, "Turn slowly one way until you have seen every wall.", "Stop there. Don't pan back."],
      status: "sent",
    };
    p.gap_requests.push(gap);
    save();
    return structuredClone(gap);
  },
};
