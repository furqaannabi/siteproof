import { expect, test } from "bun:test";
import type { CreatedProject } from "@siteproof/contract";
import type { NewProject, ProjectStore } from "./projects";
import { projectRoutes } from "./projects";

/** A store that numbers what it is given and remembers every call. */
function fakeStore() {
  const calls: NewProject[] = [];
  const store: ProjectStore = {
    async create(input) {
      calls.push(input);
      let n = 0;
      const flats = input.flats.map((f) => ({ id: `flat_${++n}`, name: f.name, rooms: f.rooms }));
      const created: CreatedProject = {
        project: { id: "prj_1", name: input.name, builder: input.builder, flats: flats.map(({ id, name }) => ({ id, name })) },
        rooms: flats.flatMap((f) => f.rooms.map((r) => ({ id: `room_${++n}`, flat: f.id, name: r.name, qr_code: r.qr_code }))),
      };
      return created;
    },
  };
  return { store, calls };
}

function post(store: ProjectStore, body: unknown) {
  return projectRoutes(store).request("/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const FLAT_302 = {
  name: "Northfield Residency",
  builder: "Northfield Constructions",
  flats: [{ name: "302", rooms: [{ name: "Living Room" }, { name: "Kitchen" }, { name: "Bedroom 2" }] }],
};

test("creates the project and returns it with every room and its QR code", async () => {
  const { store } = fakeStore();

  const res = await post(store, FLAT_302);

  expect(res.status).toBe(201);
  const body = (await res.json()) as CreatedProject;
  expect(body.project).toEqual({ id: "prj_1", name: "Northfield Residency", builder: "Northfield Constructions", flats: [{ id: "flat_1", name: "302" }] });
  expect(body.rooms.map((r) => [r.flat, r.name])).toEqual([
    ["flat_1", "Living Room"],
    ["flat_1", "Kitchen"],
    ["flat_1", "Bedroom 2"],
  ]);
});

test("every room gets its own short code, SP and 8 characters a QR stores compactly", async () => {
  const { store } = fakeStore();

  const { rooms } = (await (await post(store, FLAT_302)).json()) as CreatedProject;

  for (const room of rooms) expect(room.qr_code).toMatch(/^SP[0-9A-HJKMNP-TV-Z]{8}$/);
  expect(new Set(rooms.map((r) => r.qr_code)).size).toBe(rooms.length);
});

test("a QR code sent by the client is ignored: nobody chooses which code names a room", async () => {
  const { store, calls } = fakeStore();
  const chosen = { ...FLAT_302, flats: [{ name: "302", rooms: [{ name: "Kitchen", qr_code: "SPAAAAAAAA" }] }] };

  await post(store, chosen);

  expect(calls[0]!.flats[0]!.rooms[0]!.qr_code).not.toBe("SPAAAAAAAA");
});

test("two rooms with one name in a flat are refused, naming them: their claims could never be placed", async () => {
  const { store, calls } = fakeStore();
  const twice = { ...FLAT_302, flats: [{ name: "302", rooms: [{ name: "Bedroom 2" }, { name: " bedroom 2 " }] }] };

  const res = await post(store, twice);

  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: "invalid", message: "Flat 302 has two rooms named Bedroom 2." });
  expect(calls).toHaveLength(0);
});

test("two flats with one name are refused", async () => {
  const { store, calls } = fakeStore();
  const twice = { ...FLAT_302, flats: [{ name: "302", rooms: [{ name: "Kitchen" }] }, { name: "302 ", rooms: [{ name: "Kitchen" }] }] };

  const res = await post(store, twice);

  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: "invalid", message: "There are two flats named 302." });
  expect(calls).toHaveLength(0);
});

test("the same room name in different flats is fine: every flat has a Bedroom 2", async () => {
  const { store } = fakeStore();
  const two = { ...FLAT_302, flats: [{ name: "302", rooms: [{ name: "Bedroom 2" }] }, { name: "303", rooms: [{ name: "Bedroom 2" }] }] };

  expect((await post(store, two)).status).toBe(201);
});

test("a request missing what a project needs, or past the limits, is refused and nothing is saved", async () => {
  const rooms = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Room ${i + 1}` }));
  const bad: [string, unknown][] = [
    ["not JSON", "{name: Northfield"],
    ["no builder", { name: "Northfield Residency", flats: FLAT_302.flats }],
    ["no flats", { ...FLAT_302, flats: [] }],
    ["a flat with no rooms", { ...FLAT_302, flats: [{ name: "302", rooms: [] }] }],
    ["a blank room name", { ...FLAT_302, flats: [{ name: "302", rooms: [{ name: "   " }] }] }],
    ["a name over 80 characters", { ...FLAT_302, name: "N".repeat(81) }],
    ["31 rooms in a flat", { ...FLAT_302, flats: [{ name: "302", rooms: rooms(31) }] }],
    ["51 flats", { ...FLAT_302, flats: Array.from({ length: 51 }, (_, i) => ({ name: `${i}`, rooms: rooms(1) })) }],
  ];

  for (const [why, body] of bad) {
    const { store, calls } = fakeStore();
    const res = await post(store, body);
    expect([why, res.status]).toEqual([why, 400]);
    expect([why, calls.length]).toEqual([why, 0]);
  }
});
