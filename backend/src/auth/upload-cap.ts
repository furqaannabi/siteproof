/**
 * The cap on clips per project, so a leaked builder link cannot run up the SAM 3.1
 * bill: at about $0.36 a 60-second clip, 30 a day is at most about $11. See
 * docs/decisions/2026-10-28-builder-access-by-secret-links-accepted.md.
 */
import type { Context, MiddlewareHandler } from "hono";

export const DAILY_CLIP_CAP = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface UploadCapDeps {
  /** Clips registered for a project since a moment. */
  clipsSince: (projectId: string, since: Date) => Promise<number>;
  now: () => Date;
}

export interface UploadCapRoute {
  projectOf: (c: Context) => Promise<string | null>;
  /** True when the request is for a clip already registered, which costs nothing new. */
  alreadyRegistered?: (c: Context) => Promise<boolean>;
}

export function requireUploadAllowance({ clipsSince, now }: UploadCapDeps) {
  return ({ projectOf, alreadyRegistered }: UploadCapRoute): MiddlewareHandler =>
    async (c, next) => {
      const projectId = await projectOf(c);
      if (projectId && !(await alreadyRegistered?.(c))) {
        const since = new Date(now().getTime() - DAY_MS);
        if ((await clipsSince(projectId, since)) >= DAILY_CLIP_CAP) {
          return c.json(
            {
              error: "daily_limit",
              message: `This project has had ${DAILY_CLIP_CAP} clips in the last 24 hours, the most allowed. Send the next one tomorrow.`,
            },
            429,
          );
        }
      }
      await next();
    };
}
