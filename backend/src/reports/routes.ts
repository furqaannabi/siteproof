/**
 * The routes the screens read: a project's overview and a flat's report for the
 * builder, and a flat's report for its buyer and bank by report link.
 *
 * The builder routes are guarded in `app.ts` with the project's builder link. The
 * report link is checked here: it opens one flat's report and nothing else.
 */
import { api, type ProjectOverview } from "@siteproof/contract";
import { Hono, type Context } from "hono";
import { verifyLink } from "../auth/links";
import { bearerToken } from "../auth/setup";
import { assembleReport, type ReportRows } from "./assemble";

export interface ReportRouteDeps {
  secret: () => string;
  /** A flat's report-link version, or null if there is no such flat. */
  flatLinkVersion: (flatId: string) => Promise<number | null>;
  reportRows: (flatId: string) => Promise<ReportRows | null>;
  overview: (projectId: string) => Promise<ProjectOverview | null>;
  presign: (key: string) => string;
}

// A report holds one flat's evidence: no shared or proxy cache may keep it.
const private_ = (c: Context) => c.header("Cache-Control", "no-store");

export function reportRoutes({ secret, flatLinkVersion, reportRows, overview, presign }: ReportRouteDeps) {
  const routes = new Hono();

  routes.get(api.projectOverview(":id"), async (c) => {
    const found = await overview(c.req.param("id") ?? "");
    if (!found) return c.json({ error: "not_found" }, 404);
    private_(c);
    return c.json(found);
  });

  routes.get(api.flatReport(":id"), async (c) => {
    const rows = await reportRows(c.req.param("id") ?? "");
    if (!rows) return c.json({ error: "not_found" }, 404);
    private_(c);
    return c.json(assembleReport(rows, presign));
  });

  routes.get(api.reportByLink(), async (c) => {
    const token = bearerToken(c);
    const flatId = token ? await verifyLink("report", token, flatLinkVersion, secret()) : null;
    if (!flatId) {
      return c.json({ error: "unauthorized", message: "This report link isn't working. Ask the builder for the current one." }, 401);
    }
    const rows = await reportRows(flatId);
    if (!rows) return c.json({ error: "not_found" }, 404);
    private_(c);
    return c.json(assembleReport(rows, presign));
  });

  return routes;
}
