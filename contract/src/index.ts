/**
 * The SiteProof data contract.
 *
 * The shapes and paths agreed by the team on the night of 26 October 2026, written
 * out field for field from `docs/data-contract.md`. Furqaan owns this file: changing
 * a shape here is a change to the contract, not a local fix.
 *
 * No dependencies and no logic, so `web/` and `backend/` can both import it freely.
 * Runtime validation is Zod in `backend/`, where the untrusted input arrives.
 */

/** A clip's place in the pipeline. What `GET /clips/:id/status` returns. */
export type ClipStatus = "uploaded" | "processing" | "done" | "failed";

/**
 * The three outcomes. `"short"` is allowed only when the room is fully covered;
 * everything else is `"not_seen"`, with an exact request for footage.
 */
export type Outcome = "verified" | "short" | "not_seen";

/**
 * What SiteProof can count in this version. A claim's item and a detection's item
 * are both one of these, so they always join: wording never reaches the comparison.
 * How each becomes a SAM prompt is the pipeline's business, not the contract's.
 */
export type ItemKind = "window" | "door";

/** One flat in a project. `name` is for display, such as "302"; `id` is the key. */
export interface Flat {
  id: string;
  name: string;
}

/** The body of `POST /projects`: a project with its flats and their rooms. */
export interface CreateProject {
  name: string;
  builder: string;
  flats: { name: string; rooms: { name: string }[] }[];
}

/** What `POST /projects` returns: the project, and every room with its tag code to print. */
export interface CreatedProject {
  project: Project;
  rooms: Room[];
}

/**
 * A project's secret links, from `GET /projects/:id/links`: the builder link, which
 * opens everything in the project, and one read-only report link per flat, for its
 * buyer and bank. Each token goes in an `Authorization: Bearer` header. Only the team's
 * setup key or the project's own builder link may ask for them.
 */
export interface ProjectLinks {
  builder_token: string;
  report_tokens: { flat_id: string; token: string }[];
}

/** One builder's project. */
export interface Project {
  id: string;
  name: string;
  builder: string;
  flats: Flat[];
}

/** One room in a flat, with the QR tag printed for its doorway. */
export interface Room {
  id: string;
  /** The flat's id. */
  flat: string;
  name: string;
  qr_code: string;
}

/** One uploaded video file, with its capture time taken from the file's metadata. */
export interface Clip {
  id: string;
  project_id: string;
  url: string;
  /**
   * null when the file carries no capture time (WhatsApp may strip it). Never the
   * upload time: show null as "capture time unknown", never as a date.
   */
  captured_at: string | null;
  status: ClipStatus;
}

export type DocumentKind = "demand_letter" | "invoice" | "boq";

/**
 * One uploaded demand letter, invoice or BOQ. Its claims arrive in the report.
 * Where the file is stored stays server-side and is never part of the contract.
 */
export interface Document {
  id: string;
  project_id: string;
  /** null for a document that covers the whole project, such as a BOQ. */
  flat_id: string | null;
  kind: DocumentKind;
  /** The same lifecycle as a clip: uploaded → processing → done / failed. */
  status: ClipStatus;
  /**
   * Why it failed, in plain words a builder can act on; null unless `status` is
   * "failed". Chosen by code from a fixed list, never written by a model and never
   * quoting the document.
   */
  reason: string | null;
}

/**
 * Uploading a clip is two steps, so a clip and its job are saved only once the video
 * is confirmed in storage. `POST /clips` saves nothing: it answers with a link to
 * upload the video to and a signed ticket. `POST /clips/complete` with that ticket
 * registers the clip and returns it; sending the same ticket again returns the same clip.
 */
export interface ClipUploadRequest {
  project_id: string;
  content_type: "video/mp4" | "video/quicktime";
}

/** What `POST /clips` returns. `upload_url` takes one PUT of the video, until `expires_at`. */
export interface ClipUpload {
  upload_url: string;
  ticket: string;
  expires_at: string;
}

/** The body of `POST /clips/complete`. It returns the `Clip`. */
export interface CompleteClip {
  ticket: string;
}

/**
 * The part of a clip that belongs to one room.
 *
 * `room_id: null` means unplaced — the segment passed no room tag. Unplaced
 * segments are stored, but are never used for a per-room claim.
 *
 * `full_sweep` is true only for one continuous stretch that starts at the room's
 * QR tag and pans the whole room once in one direction, without panning back. It
 * is what the coverage rule reads.
 */
export interface Segment {
  clip_id: string;
  room_id: string | null;
  t_start: number;
  t_end: number;
  full_sweep: boolean;
}

/**
 * One line item read out of a demand letter, invoice or BOQ.
 *
 * `quote_verified` is set by code, never by a model: true only when `source_quote`
 * appears in the source document word for word. A claim with `quote_verified: false`
 * is an unverified claim and is never shown as a number.
 */
export interface Claim {
  id: string;
  doc_id: string;
  /**
   * A key from the closed vocabulary, never the document's wording, which lives in
   * `source_quote`. `"not_countable"` claims get no `Result`: they are not checked in
   * this version, and must never be shown as Not seen yet.
   */
  item: ItemKind | "not_countable";
  qty: number;
  /** null where the document states no unit ("Windows complete: 12"). Never filled in. */
  unit: string | null;
  room_id: string | null;
  source_quote: string;
  quote_verified: boolean;
}

/**
 * One tracked object. `track_id` is SAM's identity for that object within one clip,
 * which is what lets a window passed three times count once.
 */
export interface Detection {
  clip_id: string;
  room_id: string;
  item: ItemKind;
  track_id: string;
  best_frame_url: string;
  mask_url: string;
}

/**
 * One claim's outcome, from deterministic comparison only.
 *
 * `counted` is the highest count from any single clip for that room and item.
 * `evidence` is never empty for a counted object: no evidence, no number.
 */
export interface Result {
  claim_id: string;
  counted: number;
  outcome: Outcome;
  room_covered: boolean;
  evidence: string[];
  note?: string;
}

/**
 * The API, as agreed. Import these instead of writing a path in a component or a
 * fetch call, so a change to the contract is a change in one place.
 */
export const api = {
  /** Create a project with its flats and rooms. */
  createProject: () => "/projects",
  /** Get a link to upload a clip to, and a ticket. Saves nothing. */
  createClip: () => "/clips",
  /** Register an uploaded clip by its ticket. */
  completeClip: () => "/clips/complete",
  /** Upload a demand letter, invoice or BOQ for extraction. */
  createDocument: () => "/documents",
  /** Poll a clip through uploaded → processing → done / failed. */
  clipStatus: (clipId: string) => `/clips/${clipId}/status`,
  /** Poll a document through uploaded → processing → done / failed. */
  documentStatus: (documentId: string) => `/documents/${documentId}/status`,
  /** A project's builder link and its flats' report links. */
  projectLinks: (projectId: string) => `/projects/${projectId}/links`,
  /** The report. No login needed for the buyer/bank view. */
  projectReport: (projectId: string) => `/projects/${projectId}/report`,
  /** Create a gap request from the coverage map. */
  requestFootage: (roomId: string) => `/rooms/${roomId}/request-footage`,
} as const;
