/** Server entry point. Bun serves the default export; the job worker runs alongside. */
import { app } from "./app";
import { startWorker } from "./jobs/worker";

const port = Number(process.env.PORT ?? 4000);

console.log(`siteproof backend on :${port}`);

// WORKER=off serves the API without running jobs, e.g. a second instance.
if (process.env.WORKER !== "off") {
  const worker = startWorker();
  console.log("job worker running");
  process.on("SIGTERM", async () => {
    await worker.stop();
    process.exit(0);
  });
}

export default { port, fetch: app.fetch };
