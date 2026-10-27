/**
 * Run one PDF through the whole document side and print the claims: text, page
 * images, Muse Spark, the parser, the quote check. Not part of the pipeline; for
 * trying a document by hand.
 *
 *   bun --env-file=.env scripts/extract-document.ts <pdf> --rooms "Living Room,Kitchen"
 *
 * Prints each claim's quote, so it shows document text: run it on the sample
 * documents, never on a real builder's. Never prints the key.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildExtractionRequest } from "../src/documents/extraction";
import { askMuseSpark, museSparkConfigFromEnv } from "../src/documents/muse-spark";
import { parseExtraction } from "../src/documents/parse-extraction";
import { readDocumentText, renderPageImages } from "../src/documents/read-pdf";

// From the Meta Model API pricing checked on 27 October 2026 (CLAUDE.md).
const USD_PER_INPUT_TOKEN = 1.25 / 1e6;
const USD_PER_OUTPUT_TOKEN = 4.25 / 1e6;

const args = Bun.argv.slice(2);
const roomsAt = args.indexOf("--rooms");
const roomNames = roomsAt === -1 ? [] : (args[roomsAt + 1] ?? "").split(",").map((r) => r.trim()).filter(Boolean);
const pdf = args.find((a, i) => !a.startsWith("--") && i !== roomsAt + 1);
if (!pdf) throw new Error('usage: scripts/extract-document.ts <pdf> --rooms "Living Room,Kitchen"');

const { text, pages } = await readDocumentText(pdf);
const pageDir = await mkdtemp(join(tmpdir(), "siteproof-pages-"));
try {
  const pageImages = await renderPageImages(pdf, pageDir);
  const request = buildExtractionRequest({ documentText: text, pageImages, roomNames });

  const started = performance.now();
  const answer = await askMuseSpark(request, museSparkConfigFromEnv());
  const seconds = ((performance.now() - started) / 1000).toFixed(1);

  const rooms = roomNames.map((name, i) => ({ id: `room_${i + 1}`, name }));
  const { claims, rejected } = parseExtraction(answer.text, { documentText: text, rooms });
  const roomName = (id: string | null) => rooms.find((r) => r.id === id)?.name ?? "(unplaced)";

  console.log(`${pdf}: ${pages} page(s), ${claims.length} claim(s), ${rejected.length} rejected, in ${seconds} s\n`);
  for (const c of claims) {
    const verified = c.quote_verified ? "verified  " : "UNVERIFIED";
    console.log(`${verified} ${c.item.padEnd(13)} ${String(c.qty).padStart(4)} ${(c.unit ?? "").padEnd(4)} ${roomName(c.room_id).padEnd(12)} "${c.source_quote}"`);
  }
  for (const r of rejected) console.log(`REJECTED   entry ${r.index}: ${r.reason}`);

  if (answer.usage) {
    const { input_tokens, output_tokens } = answer.usage;
    const usd = input_tokens * USD_PER_INPUT_TOKEN + output_tokens * USD_PER_OUTPUT_TOKEN;
    console.log(`\n${input_tokens} input + ${output_tokens} output tokens, about $${usd.toFixed(4)}`);
  }
} finally {
  await rm(pageDir, { recursive: true, force: true });
}
