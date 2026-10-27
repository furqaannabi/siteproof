/**
 * The projects route's store, backed by Postgres through Prisma.
 *
 * Imports the Prisma client on first use, for the same reason as the document store:
 * `db.ts` refuses to load without DATABASE_URL, and `app.ts` mounts this route.
 */
import type { CreatedProject, ProjectStore } from "./projects";

export const prismaProjectStore: ProjectStore = {
  async create(input) {
    const { db } = await import("../db");

    // One nested create is one transaction: the project, every flat and every room,
    // or nothing at all.
    const saved = await db.project.create({
      data: {
        name: input.name,
        builder: input.builder,
        flats: {
          create: input.flats.map((flat) => ({
            name: flat.name,
            rooms: { create: flat.rooms.map((room) => ({ name: room.name, qr_code: room.qr_code })) },
          })),
        },
      },
      include: { flats: { include: { rooms: true } } },
    });

    // Prisma returns related rows in no set order and the ids are random, so put them
    // back in the order the request listed them. Names are unique per project and per
    // flat (the route has checked), so a name finds exactly one row.
    const flats = input.flats.map((wanted) => {
      const flat = saved.flats.find((f) => f.name === wanted.name)!;
      return { flat, rooms: wanted.rooms.map((r) => flat.rooms.find((room) => room.name === r.name)!) };
    });

    const created: CreatedProject = {
      project: {
        id: saved.id,
        name: saved.name,
        builder: saved.builder,
        flats: flats.map(({ flat }) => ({ id: flat.id, name: flat.name })),
      },
      rooms: flats.flatMap(({ flat, rooms }) =>
        rooms.map((room) => ({ id: room.id, flat: flat.id, name: room.name, qr_code: room.qr_code })),
      ),
    };
    return created;
  },
};
