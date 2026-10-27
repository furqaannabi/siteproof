/**
 * The one place screens get data from. Set NEXT_PUBLIC_DATA_SOURCE=api to talk to
 * the backend at NEXT_PUBLIC_API_URL; anything else uses the in-browser mock.
 *
 * Paths come from the contract's `api` helpers, never a literal. Where the backend or
 * the contract isn't ready, the API source fails with a plain message instead of
 * guessing at a shape nobody has agreed.
 */
import { api, type Clip, type ClipStatus, type Document, type Project } from "@siteproof/contract";
import { MockError, mockSource } from "./mock-store";
import type { CreateProject, CreateProjectResponse, NewDocument, Registered, Report } from "./types";

export interface DataSource {
  /** There is no list endpoint in the contract. The API source fails, and the home page shows no list. */
  listProjects(): Promise<Project[]>;
  getReport(projectId: string): Promise<Report>;
  createProject(body: CreateProject): Promise<CreateProjectResponse>;
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
  getReport: (projectId) => call<Report>(api.projectReport(projectId)),
  createProject: (body) => call<CreateProjectResponse>(api.createProject(), { method: "POST", body: JSON.stringify(body) }),
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
  // The gap-request shape isn't agreed yet (Apurva + Furqaan).
  requestFootage: async () => {
    throw new DataError(501, NOT_READY);
  },
};

function fromMock(source: typeof mockSource): DataSource {
  const wrap =
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        return await fn(...args);
      } catch (e) {
        if (e instanceof MockError) throw new DataError(e.status, e.message);
        throw e;
      }
    };
  return {
    listProjects: wrap(source.listProjects),
    getReport: wrap(source.getReport),
    createProject: wrap(source.createProject),
    registerClip: wrap((projectId: string, file: File, roomHint?: string | null) => source.registerClip(projectId, file, roomHint ?? null)),
    registerDocument: wrap((input: NewDocument) => source.registerDocument(input)),
    upload: wrap(source.upload),
    clipStatus: wrap(source.clipStatus),
    documentStatus: wrap(source.documentStatus),
    requestFootage: wrap(source.requestFootage),
  };
}

export const usingMock = process.env.NEXT_PUBLIC_DATA_SOURCE !== "api";

export const data: DataSource = usingMock ? fromMock(mockSource) : apiSource;

export const DEMO_PROJECT_ID = "p-northfield";
