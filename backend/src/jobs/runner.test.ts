import { expect, test } from "bun:test";
import { runOnce, type ClaimedJob, type JobHandler, type JobQueue } from "./runner";

const NOW = new Date("2026-10-28T10:00:00Z");

/** A queue holding one job, recording what the runner did with it. */
function queueWith(job: Partial<ClaimedJob> | null) {
  const done: string[] = [];
  const retried: { id: string; run_after: Date; code: string }[] = [];
  const failed: { id: string; code: string }[] = [];
  let claimed = false;
  const queue: JobQueue = {
    claim: async () => {
      if (!job || claimed) return null;
      claimed = true;
      return { id: "job_1", kind: "extract_document", payload: { document_id: "doc_1" }, attempts: 1, max_attempts: 3, ...job };
    },
    complete: async (id) => void done.push(id),
    retryLater: async (id, run_after, code) => void retried.push({ id, run_after, code }),
    fail: async (id, code) => void failed.push({ id, code }),
  };
  return { queue, done, retried, failed };
}

/** A handler that does what `run` says, recording every call. */
function handler(run: (payload: unknown) => Promise<void> = async () => {}) {
  const ran: unknown[] = [];
  const gaveUp: { payload: unknown; code: string }[] = [];
  const h: JobHandler = {
    kind: "extract_document",
    run: async (payload) => {
      ran.push(payload);
      await run(payload);
    },
    giveUp: async (payload, code) => void gaveUp.push({ payload, code }),
  };
  return { h, ran, gaveUp };
}

test("a queued job runs its handler with its payload, and is marked done", async () => {
  const { queue, done } = queueWith({});
  const { h, ran } = handler();

  const worked = await runOnce(queue, [h], NOW);

  expect(worked).toBe(true);
  expect(ran).toEqual([{ document_id: "doc_1" }]);
  expect(done).toEqual(["job_1"]);
});

/** The shape the job modules throw: a code, and whether another attempt could help. */
const jobError = (code: string, retry: boolean) => Object.assign(new Error(code), { code, retry });

test("a retryable failure with attempts left goes back on the queue, later each time", async () => {
  const { queue, retried, done } = queueWith({ attempts: 2 });
  const { h, gaveUp } = handler(async () => {
    throw jobError("request_failed", true);
  });

  await runOnce(queue, [h], NOW);

  expect(retried).toEqual([{ id: "job_1", run_after: new Date("2026-10-28T10:01:00Z"), code: "request_failed" }]);
  expect(gaveUp).toEqual([]);
  expect(done).toEqual([]);
});

test("a failure that says not to retry gives up at once, even with attempts left", async () => {
  const { queue, retried, failed } = queueWith({ attempts: 1 });
  const { h, gaveUp } = handler(async () => {
    throw jobError("unreadable", false);
  });

  await runOnce(queue, [h], NOW);

  expect(gaveUp).toEqual([{ payload: { document_id: "doc_1" }, code: "unreadable" }]);
  expect(failed).toEqual([{ id: "job_1", code: "unreadable" }]);
  expect(retried).toEqual([]);
});

test("a retryable failure on the last attempt gives up with that code", async () => {
  const { queue, retried, failed } = queueWith({ attempts: 3, max_attempts: 3 });
  const { h, gaveUp } = handler(async () => {
    throw jobError("request_failed", true);
  });

  await runOnce(queue, [h], NOW);

  expect(gaveUp).toEqual([{ payload: { document_id: "doc_1" }, code: "request_failed" }]);
  expect(failed).toEqual([{ id: "job_1", code: "request_failed" }]);
  expect(retried).toEqual([]);
});

test("any other error is retried as \"unexpected\", and given up on as that", async () => {
  const first = queueWith({ attempts: 1 });
  const crash = handler(async () => {
    throw new Error("connection reset");
  });
  await runOnce(first.queue, [crash.h], NOW);
  expect(first.retried.map((r) => r.code)).toEqual(["unexpected"]);

  const last = queueWith({ attempts: 3, max_attempts: 3 });
  const crashAgain = handler(async () => {
    throw new Error("connection reset");
  });
  await runOnce(last.queue, [crashAgain.h], NOW);
  expect(crashAgain.gaveUp.map((g) => g.code)).toEqual(["unexpected"]);
  expect(last.failed).toEqual([{ id: "job_1", code: "unexpected" }]);
});

test("only kinds with a handler are claimed: the rest wait in the queue until one exists", async () => {
  let askedFor: readonly string[] = [];
  const queue: JobQueue = {
    claim: async (_now, kinds) => {
      askedFor = kinds;
      return null;
    },
    complete: async () => {},
    retryLater: async () => {},
    fail: async () => {},
  };
  const { h } = handler();

  const worked = await runOnce(queue, [h], NOW);

  expect(worked).toBe(false);
  expect(askedFor).toEqual(["extract_document"]);
});

test("a job is still marked failed when giving up on it fails too", async () => {
  const { queue, failed } = queueWith({ attempts: 1 });
  const h: JobHandler = {
    kind: "extract_document",
    run: async () => {
      throw jobError("unreadable", false);
    },
    giveUp: async () => {
      throw new Error("database down");
    },
  };

  await runOnce(queue, [h], NOW);

  expect(failed).toEqual([{ id: "job_1", code: "unreadable" }]);
});

test("a job taken back from a dead worker after its last attempt is given up on, not run again", async () => {
  const { queue, failed } = queueWith({ attempts: 4, max_attempts: 3 });
  const { h, ran, gaveUp } = handler();

  await runOnce(queue, [h], NOW);

  expect(ran).toEqual([]);
  expect(gaveUp.map((g) => g.code)).toEqual(["timed_out"]);
  expect(failed).toEqual([{ id: "job_1", code: "timed_out" }]);
});
