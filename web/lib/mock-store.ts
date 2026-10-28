/**
 * A pretend backend that lives in the browser, so every screen works before the API
 * does. It keeps what you create in localStorage (when the browser allows it) and
 * walks each upload through uploaded → processing → done on a timer.
 *
 * It never decides an outcome the way the real engine will. The one piece of
 * "pipeline" it fakes is the demo story's last step: a clip filmed from a gap request
 * in the demo project clears that room, as the real kitchen clip will on stage.
 */
import type { Clip, ClipStatus, Document, Project, Room } from "@siteproof/contract";
import { detections, flat302 } from "@/mocks/flat-302";
import type { CreateProject, CreateProjectResponse, NewDocument, Registered, Report } from "./types";

const KEY = "siteproof-mock-v1";
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
  reports: Record<string, Report>;
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
  state ??= { reports: {}, uploads: {} };
  if (state.seed !== SEED || !state.reports[flat302.project.id]) {
    state.reports[flat302.project.id] = structuredClone(flat302);
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
  state = { reports: {}, uploads: {}, seed: SEED };
  state.reports[flat302.project.id] = structuredClone(flat302);
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

function reportOf(projectId: string): Report {
  const report = load().reports[projectId];
  if (!report) throw new MockError(404, "not_found");
  return report;
}

/** Bring every upload's status up to date, and apply the demo's gap-filling clip once it is done. */
function settle(report: Report) {
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

function fillGap(report: Report, clip: Clip, roomId: string) {
  if (report.project.id !== flat302.project.id) return;
  report.segments.push({ clip_id: clip.id, room_id: roomId, t_start: 0, t_end: 5, full_sweep: true });
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
  report.gap_requests = report.gap_requests.filter((g) => g.room_id !== roomId);
}

export const mockSource = {
  async listProjects(): Promise<Project[]> {
    await delay(100);
    return Object.values(load().reports).map((r) => r.project);
  },

  async getReport(projectId: string): Promise<Report> {
    await delay(200);
    const report = reportOf(projectId);
    settle(report);
    save();
    return structuredClone(report);
  },

  async createProject(body: CreateProject): Promise<CreateProjectResponse> {
    await delay(400);
    const s = load();
    const projectId = crypto.randomUUID();
    const flats = body.flats.map((f) => ({ id: crypto.randomUUID(), name: f.name.trim() }));
    const rooms: Room[] = body.flats.flatMap((f, i) =>
      f.rooms.map((r) => ({ id: crypto.randomUUID(), flat: flats[i].id, name: r.name.trim(), qr_code: tagCode() })),
    );
    const project = { id: projectId, name: body.name.trim(), builder: body.builder.trim(), flats };
    s.reports[projectId] = {
      project,
      flat: flats[0],
      stage: null,
      rooms,
      documents: [],
      clips: [],
      segments: [],
      claims: [],
      results: [],
      detections: [],
      gap_requests: [],
      query_letters: [],
    };
    save();
    return { project, rooms };
  },

  async registerClip(projectId: string, file: File, roomHint: string | null = null): Promise<Registered<Clip>> {
    await delay(200);
    const report = reportOf(projectId);
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
    return { item: clip, upload_url: `mock://${clip.id}` };
  },

  async registerDocument(input: NewDocument): Promise<Registered<Document>> {
    await delay(200);
    const report = reportOf(input.project_id);
    const doc: Document = { id: crypto.randomUUID(), ...input, status: "uploaded" };
    report.documents.push(doc);
    load().uploads[doc.id] = { kind: "document", project_id: input.project_id, uploaded_at: null, room_hint: null };
    save();
    return { item: doc, upload_url: `mock://${doc.id}` };
  },

  /** Pretends to PUT the file: reports progress in steps, then starts the status clock. */
  async upload(url: string, file: File, onProgress: (fraction: number) => void): Promise<void> {
    const id = url.replace("mock://", "");
    const steps = Math.min(20, Math.max(5, Math.round(file.size / 2_000_000)));
    for (let i = 1; i <= steps; i++) {
      await delay(120);
      onProgress(i / steps);
    }
    const upload = load().uploads[id];
    if (upload) upload.uploaded_at = Date.now();
    save();
  },

  async clipStatus(clipId: string): Promise<ClipStatus> {
    await delay(100);
    return statusOf(load().uploads[clipId]);
  },

  async documentStatus(documentId: string): Promise<Document> {
    await delay(100);
    for (const report of Object.values(load().reports)) {
      const doc = report.documents.find((d) => d.id === documentId);
      if (doc) return { ...doc, status: statusOf(load().uploads[doc.id]) };
    }
    throw new MockError(404, "not_found");
  },

  async requestFootage(roomId: string): Promise<void> {
    await delay(200);
    for (const report of Object.values(load().reports)) {
      for (const g of report.gap_requests) if (g.room_id === roomId) g.status = "sent";
    }
    save();
  },
};
