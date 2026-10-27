/**
 * Run one clip through SAM 3.1 and print every object it tracked. For the SAM
 * go/no-go and for checking a count by hand; not part of the pipeline.
 *
 *   bun --env-file=.env scripts/sam-count.ts <clip> "<noun phrase>" [--hand N]
 *
 * Prints track ids only, never the key or the clip's contents.
 */
import { samConfigFromEnv, segmentClip } from "../src/pipeline/sam";

const args = Bun.argv.slice(2);
const handAt = args.indexOf("--hand");
const hand = handAt === -1 ? undefined : Number(args[handAt + 1]);
const [clip, prompt] = args.filter((_, i) => handAt === -1 || (i !== handAt && i !== handAt + 1));
if (!clip || !prompt) throw new Error('usage: scripts/sam-count.ts <clip> "<noun phrase>" [--hand N]');

const started = performance.now();
const { objects } = await segmentClip(clip, prompt, samConfigFromEnv());
const seconds = ((performance.now() - started) / 1000).toFixed(1);

for (const { track_id, sightings } of objects) {
  const first = sightings[0]!.frame;
  const last = sightings.at(-1)!.frame;
  const best = Math.max(...sightings.map((s) => s.confidence ?? 0));
  console.log(`track ${track_id}: frames ${first}–${last} (${sightings.length} seen), best confidence ${best.toFixed(2)}`);
}
console.log(`\n"${prompt}": ${objects.length} distinct track id(s) in ${seconds} s`);
if (hand !== undefined) {
  console.log(`hand count: ${hand} → ${objects.length === hand ? "match" : `off by ${objects.length - hand}`}`);
}
