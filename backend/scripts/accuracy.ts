/**
 * Count every labelled clip with SAM 3.1 and print the accuracy table for the
 * README. See docs/decisions/2026-10-28-how-counting-accuracy-is-measured.md
 *
 *   bun --env-file=.env scripts/accuracy.ts --dry-run   frames and cost, nothing spent
 *   bun --env-file=.env scripts/accuracy.ts             count what is not cached, then score
 *
 * Labels are read from accuracy/labels.json (format in src/accuracy/labels.ts) and
 * clips from accuracy/footage/, which is gitignored: clips never go in the repo.
 * Every SAM answer is cached in accuracy/.cache/ by the clip's hash, the prompt and
 * the model, so a rerun pays only for what it has not seen. Prints file names and
 * counts only, never the key.
 */
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ItemKind } from "@siteproof/contract";
import { parseLabels } from "../src/accuracy/labels";
import { renderTable, score, type CountResult } from "../src/accuracy/score";
import { samConfigFromEnv, segmentClip } from "../src/pipeline/sam";

const ROOT = resolve(import.meta.dir, "../accuracy");
const FOOTAGE = join(ROOT, "footage");
const CACHE = join(ROOT, ".cache");

// What SAM is asked for each item. Until Furqaan's item-to-prompt table exists in the
// pipeline, the item names themselves; recorded in every cached answer.
const PROMPTS: Record<ItemKind, string> = { window: "window", door: "door" };
const MODEL = "sam-3.1";
// CLAUDE.md, checked 27 October 2026: every frame of the clip, at least 50 a request.
const USD_PER_FRAME = 0.2 / 1000;
const MIN_FRAMES = 50;

interface Cached {
  counted: number;
  prompt: string;
  model: string;
  frames: number;
}

async function frameCount(path: string): Promise<number> {
  const proc = Bun.spawn(
    ["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", path],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (code !== 0) throw new Error(`${path.split("/").pop()}: could not be read as a video`);
  return Number(out.trim());
}

async function cachePath(clip: string, prompt: string): Promise<string> {
  const hash = createHash("sha256").update(new Uint8Array(await Bun.file(clip).arrayBuffer())).digest("hex").slice(0, 16);
  return join(CACHE, `${hash}-${prompt.replaceAll(/[^a-z0-9]+/gi, "_")}-${MODEL}.json`);
}

const dryRun = Bun.argv.includes("--dry-run");
const labels = parseLabels(await Bun.file(join(ROOT, "labels.json")).json());
await mkdir(CACHE, { recursive: true });

const results: CountResult[] = [];
const failed: string[] = [];
let toPay = 0;
let framesToPay = 0;
for (const label of labels) {
  const clip = join(FOOTAGE, label.file);
  if (!(await Bun.file(clip).exists())) {
    console.log(`missing     ${label.file}: not in accuracy/footage/, so it is listed as not run`);
    continue;
  }
  const frames = await frameCount(clip);
  for (const item of Object.keys(label.counts) as ItemKind[]) {
    const cached = Bun.file(await cachePath(clip, PROMPTS[item]));
    if (await cached.exists()) {
      const answer = (await cached.json()) as Cached;
      results.push({ file: label.file, item, counted: answer.counted });
      console.log(`cached      ${label.file} ${item}: ${answer.counted}`);
      continue;
    }
    const billed = Math.max(frames, MIN_FRAMES);
    if (dryRun) {
      toPay++;
      framesToPay += billed;
      console.log(`would count ${label.file} ${item}: ${billed} frames, $${(billed * USD_PER_FRAME).toFixed(3)}`);
      continue;
    }
    // One failed count must not lose the rest of the run. It is reported and listed
    // as not run; running again retries only the failures, since finished counts are
    // cached. No automatic retry: every attempt is a fresh SAM charge.
    let objects;
    try {
      ({ objects } = await segmentClip(clip, PROMPTS[item], samConfigFromEnv()));
    } catch (e) {
      const cause = (e as { cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code ?? "";
      failed.push(`${label.file} ${item}`);
      console.log(`FAILED      ${label.file} ${item}: ${(e as Error).name}${cause ? ` (${cause})` : ""}`);
      continue;
    }
    const answer: Cached = { counted: objects.length, prompt: PROMPTS[item], model: MODEL, frames };
    await Bun.write(cached, JSON.stringify(answer, null, 2));
    results.push({ file: label.file, item, counted: answer.counted });
    console.log(`counted     ${label.file} ${item}: ${answer.counted} (${billed} frames, $${(billed * USD_PER_FRAME).toFixed(3)})`);
  }
}

if (dryRun) {
  console.log(`\n${toPay} count(s) to run: ${framesToPay} frames, about $${(framesToPay * USD_PER_FRAME).toFixed(2)}. Nothing was spent.`);
} else {
  console.log(`\n${renderTable(score(labels, results))}`);
  if (failed.length > 0) {
    console.log(`\n${failed.length} count(s) failed and are listed as not run: ${failed.join(", ")}.`);
    console.log("Run again to retry them; finished counts are cached and not paid for twice.");
    process.exitCode = 1;
  }
}
