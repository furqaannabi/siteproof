import { expect, test } from "bun:test";
import { Hono } from "hono";
import { requireBuilder } from "./builder";
import { linkFor } from "./links";

const SECRET = "s".repeat(64);
const versions: Record<string, number> = { prj_mine: 1, prj_other: 1 };

/** A route behind the guard, for a request about whichever project its body names. */
function guarded() {
  const app = new Hono();
  const guard = requireBuilder({
    secret: () => SECRET,
    versionOf: async (id) => versions[id] ?? null,
  });
  app.post(
    "/clips",
    guard(async (c) => ((await c.req.json()) as { project_id?: string }).project_id ?? null),
    async (c) => c.json({ reached: true, body: await c.req.json() }),
  );
  return app;
}

const call = (body: object, token?: string) =>
  guarded().request("/clips", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

test("the builder link of a project lets its builder through, body intact", async () => {
  const res = await call({ project_id: "prj_mine" }, linkFor("builder", "prj_mine", 1, SECRET));

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ reached: true, body: { project_id: "prj_mine" } });
});

test("no link at all is refused", async () => {
  const res = await call({ project_id: "prj_mine" });

  expect(res.status).toBe(401);
});

test("a link that isn't valid is refused", async () => {
  const res = await call({ project_id: "prj_mine" }, "prj_mine.not-a-signature");

  expect(res.status).toBe(401);
});

test("a valid link for another project is answered as if that project did not exist", async () => {
  const res = await call({ project_id: "prj_other" }, linkFor("builder", "prj_mine", 1, SECRET));

  expect(res.status).toBe(404);
});

test("a report link never opens a builder route", async () => {
  const res = await call({ project_id: "prj_mine" }, linkFor("report", "prj_mine", 1, SECRET));

  expect(res.status).toBe(401);
});
