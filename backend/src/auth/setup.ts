/**
 * Creating a project needs the team's setup key, so nobody else can mint projects,
 * and with them builder links and upload allowances. See
 * docs/decisions/2026-10-28-builder-access-by-secret-links-accepted.md.
 */
import { timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";

/** The token in an `Authorization: Bearer` header, or "". */
export const bearerToken = (c: Context) => {
  const header = c.req.header("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
};

/** Whether the request carries the team's setup key. No key on the server: never. */
export function hasSetupKey(c: Context, key: string | undefined): boolean {
  const given = Buffer.from(bearerToken(c));
  const expected = Buffer.from(key ?? "");
  return expected.length > 0 && given.length === expected.length && timingSafeEqual(given, expected);
}

export function requireSetupKey(setupKey: () => string | undefined): MiddlewareHandler {
  return async (c, next) => {
    if (!hasSetupKey(c, setupKey())) {
      return c.json({ error: "unauthorized", message: "Only the SiteProof team can set up a project." }, 401);
    }
    await next();
  };
}
