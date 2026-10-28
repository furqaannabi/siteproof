/**
 * The job runner: takes the next ready job from the jobs table, runs it with the
 * handler for its kind, and records how it went.
 *
 * See docs/decisions/2026-10-27-jobs-table.md. The queue is a port so the rules here
 * are tested without a database; the Postgres queue lives in `queue-store.ts`.
 */

/** A job a worker has taken. `attempts` already counts this attempt. */
export interface ClaimedJob {
  id: string;
  kind: string;
  /** Ids only. */
  payload: unknown;
  attempts: number;
  max_attempts: number;
}

export interface JobQueue {
  /**
   * Takes the oldest ready job of one of `kinds`, so no other worker can, and counts
   * the attempt. A kind no handler knows is never taken: it waits for its handler.
   */
  claim(now: Date, kinds: readonly string[]): Promise<ClaimedJob | null>;
  complete(id: string): Promise<void>;
  /** Back to the queue, not before `run_after`. */
  retryLater(id: string, run_after: Date, code: string): Promise<void>;
  fail(id: string, code: string): Promise<void>;
}

/**
 * What a job kind provides. `run` throws a JobError-shaped error ({ code, retry }) to
 * say what failed and whether another attempt could go differently. `giveUp` is
 * called once, when the runner stops trying, with the code it stopped on.
 */
export interface JobHandler {
  kind: string;
  run(payload: unknown): Promise<void>;
  giveUp(payload: unknown, code: string): Promise<void>;
}

// 30 s after the first attempt, then a minute, then two: long enough for a rate limit
// or a dropped connection to clear, short enough that a builder isn't left waiting.
const FIRST_BACKOFF_MS = 30_000;

const isJobError = (e: unknown): e is { code: string; retry: boolean } =>
  typeof e === "object" && e !== null && typeof (e as { code?: unknown }).code === "string" &&
  typeof (e as { retry?: unknown }).retry === "boolean";

/**
 * Stops trying a job. The job is marked failed even if giving up fails, so it can
 * never be left "running" to be taken again forever.
 */
async function stop(queue: JobQueue, handler: JobHandler, job: ClaimedJob, code: string) {
  try {
    await handler.giveUp(job.payload, code);
  } catch (e) {
    console.error(`job ${job.id} (${job.kind}): giving up failed: ${(e as Error).name}`);
  }
  await queue.fail(job.id, code);
}

/** Runs at most one job. Returns false when there was nothing to run. */
export async function runOnce(queue: JobQueue, handlers: readonly JobHandler[], now: Date): Promise<boolean> {
  const job = await queue.claim(now, handlers.map((h) => h.kind));
  if (!job) return false;

  const handler = handlers.find((h) => h.kind === job.kind);
  if (!handler) throw new Error(`claimed a job of kind ${job.kind} with no handler`);

  // Only a job taken back from a worker that died mid-run can arrive past its last
  // attempt. Running it again could kill the next worker the same way.
  if (job.attempts > job.max_attempts) {
    await stop(queue, handler, job, "timed_out");
    return true;
  }

  try {
    await handler.run(job.payload);
  } catch (e) {
    // Anything that isn't a JobError (the database, a bug) may well go differently
    // next time, so it is retried; its message is never stored, it could carry a URL.
    const { code, retry } = isJobError(e) ? e : { code: "unexpected", retry: true };
    if (!retry || job.attempts >= job.max_attempts) {
      await stop(queue, handler, job, code);
      return true;
    }
    const backoff = FIRST_BACKOFF_MS * 2 ** (job.attempts - 1);
    await queue.retryLater(job.id, new Date(now.getTime() + backoff), code);
    return true;
  }
  await queue.complete(job.id);
  return true;
}
