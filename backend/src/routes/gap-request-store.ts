/**
 * The gap requests' store, backed by Postgres through Prisma.
 *
 * Imports the Prisma client on first use, for the same reason as the other stores:
 * `db.ts` refuses to load without DATABASE_URL, and `app.ts` mounts this route.
 *
 * A request is stored as open or sent. It reads as `cleared` once a clip uploaded after
 * it has a full one-way sweep of its room, so the pipeline needs no change to clear it.
 */
import type { GapRequest } from "@siteproof/contract";
import type { GapRequestStore } from "./gap-requests";

interface Row {
  id: string;
  room_id: string;
  text: string;
  steps: string[];
  status: "open" | "sent";
  created_at: Date;
}

const ROW = { id: true, room_id: true, text: true, steps: true, status: true, created_at: true } as const;

/** When the room last had a full one-way sweep, from the clip's upload time; null if never. */
async function lastFullSweep(roomIds: string[]): Promise<Map<string, Date>> {
  const { db } = await import("../db");
  const sweeps = await db.segment.findMany({
    where: { room_id: { in: roomIds }, full_sweep: true },
    select: { room_id: true, clip: { select: { created_at: true } } },
  });
  const last = new Map<string, Date>();
  for (const s of sweeps) {
    if (!s.room_id) continue;
    const seen = last.get(s.room_id);
    if (!seen || s.clip.created_at > seen) last.set(s.room_id, s.clip.created_at);
  }
  return last;
}

function toContract(row: Row, sweptAt: Date | undefined): GapRequest {
  const cleared = sweptAt !== undefined && sweptAt > row.created_at;
  return { id: row.id, room_id: row.room_id, text: row.text, steps: row.steps, status: cleared ? "cleared" : row.status };
}

/**
 * Every gap request for these rooms, with `cleared` worked out. For the report routes:
 * a flat's report passes its rooms' ids.
 */
export async function gapRequestsOf(roomIds: string[]): Promise<GapRequest[]> {
  if (roomIds.length === 0) return [];
  const { db } = await import("../db");
  const [rows, swept] = await Promise.all([
    db.gapRequest.findMany({ where: { room_id: { in: roomIds } }, select: ROW, orderBy: { created_at: "asc" } }),
    lastFullSweep(roomIds),
  ]);
  return rows.map((row) => toContract(row, swept.get(row.room_id)));
}

/** The project a room belongs to, for the builder link check. */
export async function projectOfRoomId(roomId: string): Promise<string | null> {
  const { db } = await import("../db");
  const room = await db.room.findUnique({ where: { id: roomId }, select: { flat: { select: { project_id: true } } } });
  return room?.flat.project_id ?? null;
}

export const prismaGapRequestStore: GapRequestStore = {
  async roomToRequest(roomId) {
    const { db } = await import("../db");
    const room = await db.room.findUnique({
      where: { id: roomId },
      select: { name: true, flat: { select: { name: true } } },
    });
    if (!room) return null;
    // Outcomes are worked out on read by the comparison engine, not stored. Imported
    // here, not at the top: the report loader imports this module.
    const { roomIsNotSeen } = await import("../reports/load");
    return { room: room.name, flat: room.flat.name, notSeen: await roomIsNotSeen(roomId) };
  },

  async liveRequest(roomId) {
    const live = (await gapRequestsOf([roomId])).filter((g) => g.status !== "cleared");
    return live.at(-1) ?? null;
  },

  async createSent(input) {
    const { db } = await import("../db");
    const row = await db.gapRequest.create({ data: { ...input, status: "sent" }, select: ROW });
    // Just made, so nothing uploaded after it can have cleared it yet.
    return toContract(row, undefined);
  },

  async markSent(id) {
    const { db } = await import("../db");
    const row = await db.gapRequest.update({ where: { id }, data: { status: "sent" }, select: ROW });
    return toContract(row, (await lastFullSweep([row.room_id])).get(row.room_id));
  },
};
