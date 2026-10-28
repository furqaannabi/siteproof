/**
 * `GET /projects/:id/links`: a project's builder link and its flats' report links.
 * The team asks with the setup key, to hand a new project's builder their link; a
 * builder asks with their own builder link, to share report links with buyers.
 */
import { api, type ProjectLinks } from "@siteproof/contract";
import { Hono } from "hono";
import { linkFor, verifyLink } from "./links";
import { bearerToken, hasSetupKey } from "./setup";

export interface LinkRouteDeps {
  secret: () => string;
  setupKey: () => string | undefined;
  /** A project's link version and its flats' link versions, or null. */
  project: (id: string) => Promise<{ link_version: number; flats: { id: string; link_version: number }[] } | null>;
}

export function linkRoutes({ secret, setupKey, project }: LinkRouteDeps) {
  const routes = new Hono();

  routes.get(api.projectLinks(":id"), async (c) => {
    const id = c.req.param("id") ?? "";

    if (!hasSetupKey(c, setupKey())) {
      const token = bearerToken(c);
      const versionOf = async (pid: string) => (await project(pid))?.link_version ?? null;
      const linked = token ? await verifyLink("builder", token, versionOf, secret()) : null;
      if (!linked) return c.json({ error: "unauthorized", message: "This link isn't working. Ask for the project's current builder link." }, 401);
      if (linked !== id) return c.json({ error: "not_found" }, 404);
    }

    const found = await project(id);
    if (!found) return c.json({ error: "not_found" }, 404);

    const links: ProjectLinks = {
      builder_token: linkFor("builder", id, found.link_version, secret()),
      report_tokens: found.flats.map((f) => ({ flat_id: f.id, token: linkFor("report", f.id, f.link_version, secret()) })),
    };
    return c.json(links);
  });

  return routes;
}
