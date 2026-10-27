/**
 * Shapes the UI needs that are NOT in `@siteproof/contract` yet.
 *
 * Every type here is a PROPOSAL for Furqaan, not a local addition to the contract.
 * When the contract settles one, it is deleted here and imported from the contract.
 */
import type { Claim, Clip, Detection, Document, DocumentKind, Flat, Project, Result, Room, Segment } from "@siteproof/contract";

/** An exact ask for a short clip of a room that is Not seen yet. */
export interface GapRequest {
  room_id: string;
  /** "Need 5 s of Flat 302 kitchen, east wall". Always exact, always small. */
  text: string;
  /** The steps shown on the builder's phone. */
  steps: string[];
  status: "open" | "sent";
}

/** A polite letter about a real shortfall. Shown only once code has re-checked every citation. */
export interface QueryLetter {
  claim_id: string;
  body: string;
  /** Set by the backend after the invoice line, plan clause and frame ids all resolve. */
  citations_rechecked: boolean;
  citation_count: number;
}

/** What `GET /projects/:id/report` returns. Also what the project page reads, since there is no GET /projects/:id. */
export interface Report {
  project: Project;
  flat: Flat;
  /** Display only, such as "Stage 6". null until a demand letter has been read. */
  stage: string | null;
  rooms: Room[];
  documents: Document[];
  clips: Clip[];
  segments: Segment[];
  claims: Claim[];
  results: Result[];
  detections: Detection[];
  gap_requests: GapRequest[];
  query_letters: QueryLetter[];
}

/**
 * The body of `POST /projects`, as William's ADR of 27 October proposes it. It lives
 * in `backend/src/routes/projects.ts` until Furqaan approves it into the contract.
 */
export interface CreateProject {
  name: string;
  builder: string;
  flats: { name: string; rooms: { name: string }[] }[];
}

export interface CreateProjectResponse {
  project: Project;
  rooms: Room[];
}

/** What `POST /clips` and `POST /documents` hand back. The request and response shapes are not agreed yet. */
export interface Registered<T> {
  item: T;
  /** Where the browser PUTs the file. Short-lived; never logged, never stored. */
  upload_url: string;
}

export interface NewDocument {
  project_id: string;
  flat_id: string | null;
  kind: DocumentKind;
}
