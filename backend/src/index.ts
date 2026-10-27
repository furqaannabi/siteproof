/** Server entry point. Bun serves the default export. */
import { app } from "./app";

const port = Number(process.env.PORT ?? 4000);

console.log(`siteproof backend on :${port}`);

export default { port, fetch: app.fetch };
