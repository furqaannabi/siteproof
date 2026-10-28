/**
 * The guard on builder routes: a request passes only with the builder link of the
 * project it is about. Which project that is differs by route (a body field, an
 * upload ticket, the clip or document asked for), so each route says how to find it.
 */
import type { Context, MiddlewareHandler } from "hono";
import { verifyLink } from "./links";

export interface BuilderAuthDeps {
  secret: () => string;
  /** A project's current link version, or null if there is no such project. */
  versionOf: (projectId: string) => Promise<number | null>;
}

/** Which project a request is about, or null if it names none we can find. */
export type ProjectOfRequest = (c: Context) => Promise<string | null>;

const UNAUTHORIZED = {
  error: "unauthorized",
  message: "This link isn't working. Ask for the project's current builder link.",
};

export function requireBuilder({ secret, versionOf }: BuilderAuthDeps) {
  return (projectOf: ProjectOfRequest): MiddlewareHandler =>
    async (c, next) => {
      const header = c.req.header("Authorization") ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      const linked = token ? await verifyLink("builder", token, versionOf, secret()) : null;
      if (!linked) return c.json(UNAUTHORIZED, 401);

      // A valid link for another project learns nothing: the same answer as a project
      // that does not exist.
      const target = await projectOf(c).catch(() => null);
      if (target !== linked) return c.json({ error: "not_found" }, 404);

      await next();
    };
}
