/**
 * Puts one flat's report together from what the database holds.
 *
 * A report is what a buyer or bank opens with no login, so it holds this flat and
 * nothing of any other. Everything is filtered here, not only in the query that
 * loads it, so a loader that fetches too much still cannot leak another flat.
 * See docs/decisions/2026-10-28-the-report-is-per-flat-and-every-claim-is-judged-or-explained.md.
 */
import { judge } from "../compare/judge";
import type {
  Claim,
  Detection,
  Document,
  Flat,
  GapRequest,
  NotChecked,
  Project,
  Report,
  Result,
  Room,
  Segment,
} from "@siteproof/contract";

/** What the loader hands over. Storage keys, never URLs: links are minted here. */
export interface ReportRows {
  project: Pick<Project, "id" | "name" | "builder">;
  flat: Flat;
  /** This flat's rooms. */
  rooms: Room[];
  documents: Document[];
  claims: Claim[];
  /** Muse Spark's counts, which the engine needs to agree before any outcome. */
  crossChecks: { clip_id: string; room_id: string; item: "window" | "door"; count: number }[];
  detections: {
    clip_id: string;
    room_id: string;
    item: "window" | "door";
    track_id: string;
    best_frame_key: string;
    mask_key: string;
  }[];
  segments: Segment[];
  gap_requests: GapRequest[];
}

export function assembleReport(rows: ReportRows, presign: (key: string) => string): Report {
  // The documents that bill this flat, and the BOQ, which covers the whole project.
  const documents = rows.documents.filter((d) => d.flat_id === rows.flat.id || (d.flat_id === null && d.kind === "boq"));
  const roomIds = new Set(rows.rooms.map((r) => r.id));
  const ownDocuments = new Set(documents.filter((d) => d.flat_id === rows.flat.id).map((d) => d.id));
  const documentIds = new Set(documents.map((d) => d.id));

  // A claim in one of this flat's rooms, or one with no room on a document that bills
  // this flat alone. A BOQ line with no room could be any flat's, so it stays out.
  const claims = rows.claims.filter(
    (c) => documentIds.has(c.doc_id) && (c.room_id ? roomIds.has(c.room_id) : ownDocuments.has(c.doc_id)),
  );

  const inFlat = (roomId: string | null) => roomId !== null && roomIds.has(roomId);

  // Outcomes are worked out here, on read, by the comparison engine: deterministic,
  // and never stale against the evidence. Every claim is judged or explained.
  const judged = judge({
    rooms: rows.rooms,
    documents,
    claims,
    segments: rows.segments.filter((g) => inFlat(g.room_id)),
    detections: rows.detections.filter((d) => inFlat(d.room_id)),
    crossChecks: rows.crossChecks.filter((c) => inFlat(c.room_id)),
  });
  const results: Result[] = judged.results.map(({ evidence_keys, ...r }) => ({ ...r, evidence: evidence_keys.map(presign) }));
  const not_checked: NotChecked[] = judged.not_checked;
  const detections: Detection[] = rows.detections
    .filter((d) => inFlat(d.room_id))
    .map((d) => ({
      clip_id: d.clip_id,
      room_id: d.room_id,
      item: d.item,
      track_id: d.track_id,
      best_frame_url: presign(d.best_frame_key),
      mask_url: presign(d.mask_key),
    }));

  return {
    project: { id: rows.project.id, name: rows.project.name, builder: rows.project.builder },
    flat: rows.flat,
    rooms: rows.rooms,
    documents,
    claims,
    results,
    not_checked,
    detections,
    // Placed in this flat's rooms only: an unplaced segment is no flat's.
    segments: rows.segments.filter((g) => inFlat(g.room_id)),
    gap_requests: rows.gap_requests.filter((g) => inFlat(g.room_id)),
    query_letters: [],
  };
}
