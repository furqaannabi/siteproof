/**
 * Loads what a flat's report and a project's overview are made of, from Postgres.
 *
 * The queries already keep to one flat, and `assembleReport` filters again, so a
 * mistake in either alone cannot put another flat in a buyer's report. The Prisma
 * client is imported on first use, as in the route stores.
 */
import type { Clip, Document, ProjectOverview, Room, Segment } from "@siteproof/contract";
import { gapRequestsOf } from "../routes/gap-request-store";
import type { ReportRows } from "./assemble";

const DOCUMENT = { id: true, project_id: true, flat_id: true, kind: true, status: true, reason: true } as const;

const toRoom = (r: { id: string; flat_id: string; name: string; qr_code: string }): Room => ({
  id: r.id,
  flat: r.flat_id,
  name: r.name,
  qr_code: r.qr_code,
});

const toSegment = (s: {
  clip_id: string;
  room_id: string | null;
  t_start: number;
  t_end: number;
  full_sweep: boolean;
  clip: { captured_at: Date | null };
}): Segment => ({
  clip_id: s.clip_id,
  room_id: s.room_id,
  t_start: s.t_start,
  t_end: s.t_end,
  full_sweep: s.full_sweep,
  captured_at: s.clip.captured_at?.toISOString() ?? null,
});

const SEGMENT = {
  clip_id: true,
  room_id: true,
  t_start: true,
  t_end: true,
  full_sweep: true,
  clip: { select: { captured_at: true } },
} as const;

/** Everything one flat's report is made of, or null if there is no such flat. */
export async function loadReportRows(flatId: string): Promise<ReportRows | null> {
  const { db } = await import("../db");
  const flat = await db.flat.findUnique({
    where: { id: flatId },
    select: {
      id: true,
      name: true,
      project: { select: { id: true, name: true, builder: true } },
      rooms: { select: { id: true, flat_id: true, name: true, qr_code: true }, orderBy: { name: "asc" } },
    },
  });
  if (!flat) return null;
  const roomIds = flat.rooms.map((r) => r.id);

  const documents: Document[] = await db.document.findMany({
    where: { project_id: flat.project.id, OR: [{ flat_id: flat.id }, { flat_id: null, kind: "boq" }] },
    select: DOCUMENT,
    orderBy: { created_at: "asc" },
  });
  const claims = await db.claim.findMany({
    where: { doc_id: { in: documents.map((d) => d.id) } },
    select: { id: true, doc_id: true, item: true, qty: true, unit: true, room_id: true, source_quote: true, quote_verified: true },
  });
  const [crossChecks, detections, segments, gap_requests] = await Promise.all([
    db.crossCheck.findMany({ where: { room_id: { in: roomIds } }, select: { clip_id: true, room_id: true, item: true, count: true } }),
    db.detection.findMany({
      where: { room_id: { in: roomIds } },
      select: { clip_id: true, room_id: true, item: true, track_id: true, best_frame_key: true, mask_key: true },
    }),
    db.segment.findMany({ where: { room_id: { in: roomIds } }, select: SEGMENT, orderBy: { t_start: "asc" } }),
    gapRequestsOf(roomIds),
  ]);

  return {
    project: flat.project,
    flat: { id: flat.id, name: flat.name },
    rooms: flat.rooms.map(toRoom),
    documents,
    claims,
    crossChecks,
    detections,
    segments: segments.map(toSegment),
    gap_requests,
  };
}

/** The builder's whole project, or null if there is no such project. */
export async function loadOverview(
  projectId: string,
  presign: (key: string) => string,
): Promise<ProjectOverview | null> {
  const { db } = await import("../db");
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      builder: true,
      flats: {
        select: {
          id: true,
          name: true,
          rooms: { select: { id: true, flat_id: true, name: true, qr_code: true }, orderBy: { name: "asc" } },
        },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!project) return null;

  const [documents, clips, segments] = await Promise.all([
    db.document.findMany({ where: { project_id: projectId }, select: DOCUMENT, orderBy: { created_at: "asc" } }),
    db.clip.findMany({
      where: { project_id: projectId },
      select: { id: true, project_id: true, object_key: true, captured_at: true, status: true },
      orderBy: { created_at: "asc" },
    }),
    db.segment.findMany({ where: { clip: { project_id: projectId } }, select: SEGMENT, orderBy: { t_start: "asc" } }),
  ]);

  return {
    project: { id: project.id, name: project.name, builder: project.builder, flats: project.flats.map((f) => ({ id: f.id, name: f.name })) },
    rooms: project.flats.flatMap((f) => f.rooms.map(toRoom)),
    documents,
    clips: clips.map(
      (c): Clip => ({
        id: c.id,
        project_id: c.project_id,
        url: presign(c.object_key),
        captured_at: c.captured_at?.toISOString() ?? null,
        status: c.status,
      }),
    ),
    segments: segments.map(toSegment),
  };
}

/**
 * Whether a room still needs footage: no full sweep of it yet, or a claim on it the
 * engine judges Not seen yet. Worked out by the same engine as the report.
 */
export async function roomIsNotSeen(roomId: string): Promise<boolean> {
  const { db } = await import("../db");
  const room = await db.room.findUnique({ where: { id: roomId }, select: { flat_id: true } });
  const rows = room ? await loadReportRows(room.flat_id) : null;
  if (!rows) return false;
  const { assembleReport } = await import("./assemble");
  const report = assembleReport(rows, () => "");
  const swept = rows.segments.some((s) => s.room_id === roomId && s.full_sweep);
  return !swept || report.results.some((r) => r.room_id === roomId && r.outcome === "not_seen");
}
