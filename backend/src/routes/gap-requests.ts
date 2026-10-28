/**
 * `POST /rooms/:id/request-footage`: send the site an exact, small ask for footage of a
 * room that is Not seen yet.
 *
 * It creates the room's gap request, or returns the one already live, and marks it
 * sent. The request line is written here, by code; only the filming steps come from
 * Muse Spark, checked. A room that has a full one-way sweep and nothing Not seen yet
 * can't be asked about: there is nothing to film.
 *
 * See docs/decisions/2026-10-28-gap-request-text-and-pdf-export.md
 */
import { Hono } from "hono";
import type { GapRequest } from "@siteproof/contract";
import { api } from "@siteproof/contract";

export interface RoomToRequest {
  /** The room's and its flat's names, as the builder set them up. */
  room: string;
  flat: string;
  /** No full one-way sweep of the room yet, or a claim in it is Not seen yet. */
  notSeen: boolean;
}

export interface GapRequestStore {
  /** The room and whether it is Not seen yet, or null when there is no such room. */
  roomToRequest(roomId: string): Promise<RoomToRequest | null>;
  /** The room's request that is open or sent and not yet cleared, if any. */
  liveRequest(roomId: string): Promise<GapRequest | null>;
  /** Saves a new request, already sent. */
  createSent(input: { room_id: string; text: string; steps: string[] }): Promise<GapRequest>;
  markSent(id: string): Promise<GapRequest>;
}

export interface GapRequestRouteDeps {
  store: GapRequestStore;
  /** Checked steps for the room, or fixed ones; never throws. */
  writeSteps(room: string): Promise<string[]>;
}

/**
 * The request line, written by code from names alone, so it is always exact and small.
 * It names the room, not a wall, until the coverage map can say which wall wasn't seen.
 */
export function requestText(flat: string, room: string): string {
  return `Need 5 s of Flat ${flat} ${room.toLowerCase()}, one slow sweep from its room tag`;
}

export function gapRequestRoutes({ store, writeSteps }: GapRequestRouteDeps) {
  const routes = new Hono();

  routes.post(api.requestFootage(":id"), async (c) => {
    const roomId = c.req.param("id");
    const room = roomId ? await store.roomToRequest(roomId) : null;
    if (!roomId || !room) return c.json({ error: "not_found" }, 404);
    if (!room.notSeen) {
      return c.json({ error: "covered", message: "This room already has a one-way sweep from its room tag, so there's nothing to film." }, 409);
    }

    // Asking again sends the same request, never a second one for the same room.
    const live = await store.liveRequest(roomId);
    if (live) return c.json(live.status === "sent" ? live : await store.markSent(live.id), 200);

    const steps = await writeSteps(room.room);
    return c.json(await store.createSent({ room_id: roomId, text: requestText(room.flat, room.room), steps }), 201);
  });

  return routes;
}
