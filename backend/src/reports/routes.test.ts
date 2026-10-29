import { expect, test } from "bun:test";
import { linkFor } from "../auth/links";
import type { ReportRows } from "./assemble";
import { reportRoutes } from "./routes";

const SECRET = "r".repeat(64);
const flatVersions: Record<string, number> = { f302: 1 };

const rows: ReportRows = {
  project: { id: "prj", name: "Northfield", builder: "Acme" },
  flat: { id: "f302", name: "302" },
  rooms: [],
  documents: [],
  claims: [],
  crossChecks: [],
  detections: [],
  segments: [],
  gap_requests: [],
};

const routes = () =>
  reportRoutes({
    secret: () => SECRET,
    flatLinkVersion: async (id) => flatVersions[id] ?? null,
    reportRows: async (id) => (id === "f302" ? rows : null),
    overview: async () => null,
    presign: (key) => `signed:${key}`,
  });

const open = (token?: string) =>
  routes().request("/report", { headers: token ? { Authorization: `Bearer ${token}` } : {} });

test("a flat's report link opens that flat's report, and it is never cached", async () => {
  const res = await open(linkFor("report", "f302", 1, SECRET));

  expect(res.status).toBe(200);
  expect(((await res.json()) as { flat: { id: string } }).flat.id).toBe("f302");
  expect(res.headers.get("Cache-Control")).toBe("no-store");
});

test("no link, a bad link, a replaced link or a builder link opens nothing", async () => {
  const statuses = await Promise.all([
    open(),
    open("f302.not-a-signature"),
    open(linkFor("report", "f302", 0, SECRET)),
    open(linkFor("builder", "f302", 1, SECRET)),
  ]);

  expect(statuses.map((r) => r.status)).toEqual([401, 401, 401, 401]);
});
