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
  type ProjectOverview,
  type Report,
} from "@siteproof/contract";
import type { NewDocument, Registered } from "./types";

export interface DataSource {
  /** There is no list endpoint in the contract. The API source fails, and the home page shows no list. */
  listProjects(): Promise<Project[]>;
  /** The builder's whole project: flats, rooms, documents and clips. */
  getOverview(projectId: string): Promise<ProjectOverview>;
  /** One flat's report, for its builder. */
  getFlatReport(flatId: string): Promise<Report>;
  createProject(body: CreateProject): Promise<CreatedProject>;
  /** `roomHint` is used by the mock only. The real pipeline places a clip by its room tag. */
  registerClip(projectId: string, file: File, roomHint?: string | null): Promise<Registered<Clip>>;
  registerDocument(input: NewDocument, file: File): Promise<Registered<Document>>;
  upload(url: string, file: File, onProgress: (fraction: number) => void): Promise<void>;
  clipStatus(clipId: string): Promise<ClipStatus>;
  documentStatus(documentId: string): Promise<Document>;
  requestFootage(roomId: string): Promise<void>;
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

const base = process.env.NEXT_PUBLIC_API_URL ?? "";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(base + path, {
      ...init,
      headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers,
    });
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

const apiSource: DataSource = {
  listProjects: async () => {
    throw new DataError(501, NOT_READY);
  },
  getOverview: (projectId) => call<ProjectOverview>(api.projectOverview(projectId)),
  getFlatReport: (flatId) => call<Report>(api.flatReport(flatId)),
  createProject: (body) => call<CreatedProject>(api.createProject(), { method: "POST", body: JSON.stringify(body) }),
  // The request and response of POST /clips and POST /documents aren't agreed yet (William).
  registerClip: async () => {
    throw new DataError(501, NOT_READY);
  },
  registerDocument: async () => {
    throw new DataError(501, NOT_READY);
  },
  upload: putWithProgress,
  clipStatus: async (clipId) => {
    const body = await call<ClipStatus | { status: ClipStatus }>(api.clipStatus(clipId));
    return typeof body === "string" ? body : body.status;
  },
  documentStatus: (documentId) => call<Document>(api.documentStatus(documentId)),
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
    getFlatReport: wrap((m, flatId: string) => m.getFlatReport(flatId)),
    createProject: wrap((m, body: CreateProject) => m.createProject(body)),
    registerClip: wrap((m, projectId: string, file: File, roomHint?: string | null) => m.registerClip(projectId, file, roomHint ?? null)),
    registerDocument: wrap((m, input: NewDocument) => m.registerDocument(input)),
    upload: wrap((m, url: string, file: File, onProgress: (fraction: number) => void) => m.upload(url, file, onProgress)),
    clipStatus: wrap((m, clipId: string) => m.clipStatus(clipId)),
    documentStatus: wrap((m, documentId: string) => m.documentStatus(documentId)),
    requestFootage: wrap((m, roomId: string) => m.requestFootage(roomId)),
  };
}

/** Mock mode only: forget everything made in the demo and restore Flat 302. */
export async function resetMockData() {
  (await loadMock()).resetMock();
}

export const usingMock = process.env.NEXT_PUBLIC_DATA_SOURCE !== "api";

export const data: DataSource = usingMock ? fromMock() : apiSource;

export const DEMO_PROJECT_ID = "p-northfield";
