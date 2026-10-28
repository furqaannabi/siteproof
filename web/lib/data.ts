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
  type CreatedProject,
  type CreateProject,
  type Document,
  type Project,
  type ProjectLinks,
  type ProjectOverview,
  type Report,
} from "@siteproof/contract";
import { builderToken, knownProjects } from "./access";
import type { NewDocument, Registered } from "./types";

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
  /** `roomHint` is used by the mock only. The real pipeline places a clip by its room tag. */
  registerClip(projectId: string, file: File, roomHint?: string | null): Promise<Registered<Clip>>;
  registerDocument(input: NewDocument, file: File): Promise<Registered<Document>>;
  upload(url: string, file: File, onProgress: (fraction: number) => void): Promise<void>;
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

/** PUT a file to a presigned URL with progress. The URL is never logged. */
function putWithProgress(url: string, file: File, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (file.type) xhr.setRequestHeader("content-type", file.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new DataError(xhr.status, "The upload didn't finish. Try again.")));
    xhr.onerror = () => reject(new DataError(0, "The upload didn't finish. Check your connection and try again."));
    xhr.send(file);
  });
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
  // The request and response of POST /clips and POST /documents aren't agreed yet (William).
  registerClip: async () => {
    throw new DataError(501, NOT_READY);
  },
  registerDocument: async () => {
    throw new DataError(501, NOT_READY);
  },
  upload: putWithProgress,
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
    registerClip: wrap((m, projectId: string, file: File, roomHint?: string | null) => m.registerClip(projectId, file, roomHint ?? null)),
    registerDocument: wrap((m, input: NewDocument) => m.registerDocument(input)),
    upload: wrap((m, url: string, file: File, onProgress: (fraction: number) => void) => m.upload(url, file, onProgress)),
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
