import { expect, test } from "bun:test";
import type { GapRequest } from "@siteproof/contract";
import type { GapRequestRouteDeps, RoomToRequest } from "./gap-requests";
import { gapRequestRoutes, requestText } from "./gap-requests";

const STEPS = ["Start at the kitchen's room tag.", "Pan slowly one way.", "Stop. Don't pan back."];

/** Rooms: r_kitchen is Not seen yet, r_living is covered; anything else does not exist. */
function fakes(live: GapRequest | null = null) {
  const created: { room_id: string; text: string; steps: string[] }[] = [];
  const sent: string[] = [];
  let stepCalls = 0;
  const rooms: Record<string, RoomToRequest> = {
    r_kitchen: { room: "Kitchen", flat: "302", notSeen: true },
    r_living: { room: "Living Room", flat: "302", notSeen: false },
  };
  const deps: GapRequestRouteDeps = {
    store: {
      roomToRequest: async (id) => rooms[id] ?? null,
      liveRequest: async () => live,
      createSent: async (input) => {
        created.push(input);
        return { id: "g_new", ...input, status: "sent" };
      },
      markSent: async (id) => {
        sent.push(id);
        return { ...live!, status: "sent" };
      },
    },
    writeSteps: async () => {
      stepCalls++;
      return STEPS;
    },
  };
  return { deps, created, sent, stepCalls: () => stepCalls };
}

const ask = (deps: GapRequestRouteDeps, roomId: string) => gapRequestRoutes(deps).request(`/rooms/${roomId}/request-footage`, { method: "POST" });

test("the request line is exact and small, written from names alone", () => {
  expect(requestText("302", "Kitchen")).toBe("Need 5 s of Flat 302 kitchen, one slow sweep from its room tag");
});

test("a room that is Not seen yet gets a new request, already sent", async () => {
  const f = fakes();
  const res = await ask(f.deps, "r_kitchen");

  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({
    id: "g_new",
    room_id: "r_kitchen",
    text: "Need 5 s of Flat 302 kitchen, one slow sweep from its room tag",
    steps: STEPS,
    status: "sent",
  });
});

test("asking again returns the live request, never a second one", async () => {
  const live: GapRequest = { id: "g_1", room_id: "r_kitchen", text: "Need 5 s of Flat 302 kitchen, one slow sweep from its room tag", steps: STEPS, status: "open" };
  const f = fakes(live);
  const res = await ask(f.deps, "r_kitchen");

  expect(res.status).toBe(200);
  expect(((await res.json()) as GapRequest).id).toBe("g_1");
  expect(f.created).toEqual([]);
  expect(f.sent).toEqual(["g_1"]);
  // No second Muse Spark call for a request that already has its steps.
  expect(f.stepCalls()).toBe(0);
});

test("a covered room can't be asked about, and nothing is saved", async () => {
  const f = fakes();
  const res = await ask(f.deps, "r_living");

  expect(res.status).toBe(409);
  expect(((await res.json()) as { error: string }).error).toBe("covered");
  expect(f.created).toEqual([]);
  expect(f.stepCalls()).toBe(0);
});

test("a room that doesn't exist is a 404 that says nothing more", async () => {
  const res = await ask(fakes().deps, "r_nope");

  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "not_found" });
});
