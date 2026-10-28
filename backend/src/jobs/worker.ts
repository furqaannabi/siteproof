/**
 * The worker loop, run by the backend service itself: one job at a time, and a short
 * sleep whenever the queue has nothing ready.
 */
import { extractDocument } from "../documents/extract-store";
import { postgresJobQueue } from "./queue-store";
import { runOnce, type JobHandler, type JobQueue } from "./runner";

/** Every job kind the worker runs. A kind not listed here waits in the queue. */
export const handlers: readonly JobHandler[] = [extractDocument];

const IDLE_MS = 2000;

export function startWorker(queue: JobQueue = postgresJobQueue, kinds: readonly JobHandler[] = handlers) {
  let stopped = false;

  const loop = async () => {
    while (!stopped) {
      let worked = false;
      try {
        worked = await runOnce(queue, kinds, new Date());
      } catch (e) {
        // The queue itself failed (the database is down, say). Never the message: it
        // could carry a connection string.
        console.error(`worker: ${(e as Error).name}`);
      }
      if (!worked) await Bun.sleep(IDLE_MS);
    }
  };
  const running = loop();

  return {
    /** Finishes the job in hand, then stops. */
    stop: async () => {
      stopped = true;
      await running;
    },
  };
}
