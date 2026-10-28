/**
 * The job queue in Postgres. Taking a job is one raw statement, because Prisma has no
 * `FOR UPDATE SKIP LOCKED`; everything else goes through the Prisma client.
 *
 * The Prisma client is imported on first use, as in the route stores, so loading
 * this never needs a database.
 */
import type { ClaimedJob, JobQueue } from "./runner";

/**
 * A job still "running" after this long was left behind by a worker that died, and is
 * taken again. Longer than any one job should run: a SAM 3.1 call on a full clip and
 * a Muse Spark read of a whole BOQ each take a minute or two.
 */
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

export const postgresJobQueue: JobQueue = {
  async claim(now, kinds) {
    if (kinds.length === 0) return null;
    const { db } = await import("../db");
    const stale = new Date(now.getTime() - LOCK_TIMEOUT_MS);
    const [job] = await db.$queryRaw<ClaimedJob[]>`
      UPDATE "Job" SET status = 'running', locked_at = ${now}, attempts = attempts + 1
      WHERE id = (
        SELECT id FROM "Job"
        WHERE kind = ANY(${kinds}::text[])
          AND ((status = 'queued' AND run_after <= ${now})
            OR (status = 'running' AND locked_at < ${stale}))
        ORDER BY run_after, created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, kind, payload, attempts, max_attempts`;
    return job ?? null;
  },

  async complete(id) {
    const { db } = await import("../db");
    await db.job.update({ where: { id }, data: { status: "done", locked_at: null } });
  },

  async retryLater(id, run_after, code) {
    const { db } = await import("../db");
    await db.job.update({ where: { id }, data: { status: "queued", run_after, locked_at: null, last_error_code: code } });
  },

  async fail(id, code) {
    const { db } = await import("../db");
    await db.job.update({ where: { id }, data: { status: "failed", locked_at: null, last_error_code: code } });
  },
};
