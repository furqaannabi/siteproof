/**
 * The one place screens get data from. Set NEXT_PUBLIC_DATA_SOURCE=api to talk to
 * the backend at NEXT_PUBLIC_API_URL; anything else uses the in-browser mock.
 *
 * Paths come from the contract's `api` helpers, never a literal. Where the backend or
 * the contract isn't ready, the API source fails with a plain message instead of
 * guessing at a shape nobody has agreed.
 */
import {
  api,
  type Clip,
  type ClipStatus,
  type ClipUpload,
  type ClipUploadRequest,
  type CreatedProject,
  type CreateProject,
  type Document,
  type Project,
  type ProjectLinks,
  type ProjectOverview,
  type Report,
} from "@siteproof/contract";
import { builderToken, knownProjects } from "./access";
import type { NewDocument } from "./types";

/**
 * Every builder call names its project: that picks the builder link it sends. There is no
 * list of projects in the API; the list is the projects whose links this device holds.
 */
export interface DataSource {
  listProjects(): Promise<Project[]>;
  /** The builder's whole project: flats, rooms, documents and clips. */
  getOverview(projectId: string): Promise<ProjectOverview>;
  /** One flat's report, for its builder. */
  getFlatReport(projectId: string, flatId: string): Promise<Report>;
  /** One flat's report from its report link, for its buyer and bank. No builder link. */
  getReportByLink(token: string): Promise<Report>;
  /** The project's builder link and each flat's report link. */
  getLinks(projectId: string, setupKey?: string): Promise<ProjectLinks>;
  /** Needs the team's setup key. */
  createProject(body: CreateProject, setupKey: string): Promise<CreatedProject>;
  /**
   * Sends one clip and registers it, reporting the transfer's progress. `roomHint` is used
   * by the mock only; the real pipeline places a clip by its room tag.
   */
  uploadClip(projectId: string, file: File, onProgress: (fraction: number) => void, roomHint?: string | null): Promise<Clip>;
  /** Sends one demand letter, invoice or BOQ, reporting the transfer's progress. */
  uploadDocument(input: NewDocument, file: File, onProgress: (fraction: number) => void): Promise<Document>;
  clipStatus(projectId: string, clipId: string): Promise<ClipStatus>;
  documentStatus(projectId: string, documentId: string): Promise<Document>;
  requestFootage(projectId: string, roomId: string): Promise<void>;
}

export class DataError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const NOT_READY = "This part of SiteProof isn't connected yet.";

// A trailing slash in the env ("https://api.example.com/") would double up with each path.
const base = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

/** `token` goes in `Authorization: Bearer`. It is never logged. */
async function call<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(base + path, { ...init, headers });
  } catch {
    throw new DataError(0, "Can't reach SiteProof. Check your connection and try again.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new DataError(res.status, body?.message ?? body?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

/**
 * Sends a file with progress, which fetch can't report. Answers the reply's JSON, or a
 * DataError with the server's own plain message. URLs and tokens are never logged.
 */
function send(
  method: "PUT" | "POST",
  url: string,
  body: File | FormData,
  headers: Record<string, string>,
  onProgress: (fraction: number) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let reply: { error?: string; message?: string } | null = null;
      try {
        reply = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        // Storage answers a PUT with an empty body or XML, not JSON.
      }
      if (xhr.status < 300) resolve(reply);
      else reject(new DataError(xhr.status, reply?.message ?? "The upload didn't finish. Try again."));
    };
    xhr.onerror = () => reject(new DataError(0, "The upload didn't finish. Check your connection and try again."));
    xhr.send(body);
  });
}

/**
 * The clip's type as the server signs it. The upload must declare the same type, so a
 * file the phone left untyped is named by its extension.
 */
function clipType(file: File): ClipUploadRequest["content_type"] {
  if (file.type === "video/quicktime" || file.name.toLowerCase().endsWith(".mov")) return "video/quicktime";
  return "video/mp4";
}

/** A builder call for one project, with that project's link, or a plain refusal without one. */
function asBuilder<T>(projectId: string, path: string, init?: RequestInit): Promise<T> {
  const token = builderToken(projectId);
  if (!token) return Promise.reject(new DataError(401, "no_link"));
  return call<T>(path, token, init);
}

const apiSource: DataSource = {
  listProjects: async () => {
    // A link that no longer opens its project (replaced, or the project is gone) is left out.
    const found = await Promise.all(knownProjects().map((id) => apiSource.getOverview(id).catch(() => null)));
    return found.filter((o): o is ProjectOverview => o !== null).map((o) => o.project);
  },
  getOverview: (projectId) => asBuilder<ProjectOverview>(projectId, api.projectOverview(projectId)),
  getFlatReport: (projectId, flatId) => asBuilder<Report>(projectId, api.flatReport(flatId)),
  getReportByLink: (token) => call<Report>(api.reportByLink(token), token),
  getLinks: (projectId, setupKey) =>
    setupKey ? call<ProjectLinks>(api.projectLinks(projectId), setupKey) : asBuilder<ProjectLinks>(projectId, api.projectLinks(projectId)),
  createProject: (body, setupKey) => call<CreatedProject>(api.createProject(), setupKey, { method: "POST", body: JSON.stringify(body) }),
  // Two steps, so a clip is saved only once its video is in storage: a link and a ticket,
  // the video straight to storage, then the ticket back to register it.
  uploadClip: async (projectId, file, onProgress) => {
    const content_type = clipType(file);
    const request: ClipUploadRequest = { project_id: projectId, content_type };
    const { upload_url, ticket } = await asBuilder<ClipUpload>(projectId, api.createClip(), { method: "POST", body: JSON.stringify(request) });
    // The upload link is signed on its own: it takes no builder link.
    await send("PUT", upload_url, file, { "content-type": content_type }, onProgress);
    return asBuilder<Clip>(projectId, api.completeClip(), { method: "POST", body: JSON.stringify({ ticket }) });
  },
  uploadDocument: async (input, file, onProgress) => {
    const token = builderToken(input.project_id);
    if (!token) throw new DataError(401, "no_link");
    const form = new FormData();
    form.set("project_id", input.project_id);
    form.set("kind", input.kind);
    if (input.flat_id) form.set("flat_id", input.flat_id);
    form.set("file", file);
    return (await send("POST", base + api.createDocument(), form, { authorization: `Bearer ${token}` }, onProgress)) as Document;
  },
  clipStatus: async (projectId, clipId) => {
    const body = await asBuilder<ClipStatus | { status: ClipStatus }>(projectId, api.clipStatus(clipId));
    return typeof body === "string" ? body : body.status;
  },
  documentStatus: (projectId, documentId) => asBuilder<Document>(projectId, api.documentStatus(documentId)),
  // POST /rooms/:id/request-footage isn't built on the backend yet (Apurva).
  requestFootage: async () => {
    throw new DataError(501, NOT_READY);
  },
};

/**
 * The in-browser mock, loaded only when it's in use, so a build pointed at the real
 * API never ships the demo data or the pretend backend.
 */
const loadMock = () => import("./mock-store");

function fromMock(): DataSource {
  type Mock = Awaited<ReturnType<typeof loadMock>>;
  const wrap =
    <A extends unknown[], R>(fn: (mock: Mock["mockSource"], ...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      const mock = await loadMock();
      try {
        return await fn(mock.mockSource, ...args);
      } catch (e) {
        if (e instanceof mock.MockError) throw new DataError(e.status, e.message);
        throw e;
      }
    };
  return {
    listProjects: wrap((m) => m.listProjects()),
    getOverview: wrap((m, projectId: string) => m.getOverview(projectId)),
    getFlatReport: wrap((m, _projectId: string, flatId: string) => m.getFlatReport(flatId)),
    getReportByLink: wrap((m, token: string) => m.getReportByLink(token)),
    getLinks: wrap((m, projectId: string) => m.getLinks(projectId)),
    // The mock needs no setup key.
    createProject: wrap((m, body: CreateProject) => m.createProject(body)),
    uploadClip: wrap((m, projectId: string, file: File, onProgress: (fraction: number) => void, roomHint?: string | null) =>
      m.uploadClip(projectId, file, onProgress, roomHint ?? null),
    ),
    uploadDocument: wrap((m, input: NewDocument, file: File, onProgress: (fraction: number) => void) => m.uploadDocument(input, file, onProgress)),
    clipStatus: wrap((m, _projectId: string, clipId: string) => m.clipStatus(clipId)),
    documentStatus: wrap((m, _projectId: string, documentId: string) => m.documentStatus(documentId)),
    requestFootage: wrap((m, _projectId: string, roomId: string) => m.requestFootage(roomId)),
  };
}

/** Mock mode only: forget everything made in the demo and restore Flat 302. */
export async function resetMockData() {
  (await loadMock()).resetMock();
}

export const usingMock = process.env.NEXT_PUBLIC_DATA_SOURCE !== "api";

export const data: DataSource = usingMock ? fromMock() : apiSource;

export const DEMO_PROJECT_ID = "p-northfield";
