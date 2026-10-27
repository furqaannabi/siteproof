/**
 * Render the sample documents in fixtures/documents/ from HTML to PDF with headless
 * Chrome, so they read like real ones: a table in a proportional font, not a
 * monospaced mock.
 *
 *   bun scripts/render-documents.ts
 *
 * Chrome's own header and footer are turned off: they would print the file path and
 * the date into the PDF, and from there into the text quotes are checked against.
 * Set CHROME_PATH if Chrome is not in the default macOS location.
 */
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const dir = resolve(import.meta.dir, "../fixtures/documents");

for (const name of (await readdir(dir)).filter((f) => f.endsWith(".html")).sort()) {
  const html = join(dir, name);
  const pdf = html.replace(/\.html$/, ".pdf");
  const proc = Bun.spawn(
    [chrome, "--headless", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdf}`, `file://${html}`],
    { stdout: "ignore", stderr: "pipe" },
  );
  if ((await proc.exited) !== 0) throw new Error(`Chrome could not render ${name}`);
  console.log(`rendered ${name.replace(/\.html$/, ".pdf")}`);
}
