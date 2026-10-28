import { expect, test } from "bun:test";
import type { ProjectLinks } from "@siteproof/contract";
import { linkFor, verifyLink } from "./links";
import { linkRoutes } from "./links-route";

const SECRET = "l".repeat(64);
const SETUP = "k".repeat(64);
const projects: Record<string, { link_version: number; flats: { id: string; link_version: number }[] }> = {
  prj_1: { link_version: 1, flats: [{ id: "flat_302", link_version: 1 }, { id: "flat_303", link_version: 2 }] },
  prj_2: { link_version: 1, flats: [] },
};

const routes = () =>
  linkRoutes({
    secret: () => SECRET,
    setupKey: () => SETUP,
    project: async (id) => projects[id] ?? null,
  });

const get = (id: string, token?: string) =>
  routes().request(`/projects/${id}/links`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

test("with the team's setup key, a project's links come back, and each one opens what it should", async () => {
  const res = await get("prj_1", SETUP);
  const links = (await res.json()) as ProjectLinks;

  expect(res.status).toBe(200);
  expect(await verifyLink("builder", links.builder_token, async () => 1, SECRET)).toBe("prj_1");
  expect(links.report_tokens.map((r) => r.flat_id)).toEqual(["flat_302", "flat_303"]);
  const versions: Record<string, number> = { flat_302: 1, flat_303: 2 };
  for (const r of links.report_tokens) {
    expect(await verifyLink("report", r.token, async (id) => versions[id] ?? null, SECRET)).toBe(r.flat_id);
  }
});

test("a builder can see their own project's links with its builder link", async () => {
  const res = await get("prj_1", linkFor("builder", "prj_1", 1, SECRET));

  expect(res.status).toBe(200);
});

test("a builder link for another project sees nothing", async () => {
  const res = await get("prj_1", linkFor("builder", "prj_2", 1, SECRET));

  expect(res.status).toBe(404);
});

test("no key and no link sees nothing", async () => {
  expect((await get("prj_1")).status).toBe(401);
  expect((await get("prj_1", linkFor("report", "flat_302", 1, SECRET))).status).toBe(401);
});
