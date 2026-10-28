/**
 * The hand-label file, `backend/accuracy/labels.json`:
 *
 *   { "clips": [
 *     { "file": "c01.mp4", "kind": "sweep", "room": "Bedroom 2", "counts": { "window": 2, "door": 1 } }
 *   ] }
 *
 * `file` names a clip in `backend/accuracy/footage/` (gitignored: clips never go in
 * the repo). `kind` is `sweep`, `messy` or `pan`. `room` only when the clip covers
 * one room. `counts` is how many distinct objects truly appear in the whole clip.
 */
import { z } from "zod";
import type { Label } from "./score";

const count = z.number().int().nonnegative();

const LabelSchema = z.object({
  file: z.string().min(1),
  kind: z.enum(["sweep", "messy", "pan"]),
  room: z.string().min(1).optional(),
  counts: z
    .object({ window: count.optional(), door: count.optional() })
    .refine((c) => c.window !== undefined || c.door !== undefined, "needs at least one count"),
});

const FileSchema = z.object({ clips: z.array(z.unknown()) });

/** Throws, naming the clip, on the first label that is wrong: never scores against a bad truth. */
export function parseLabels(json: unknown): Label[] {
  const { clips } = FileSchema.parse(json);
  const labels: Label[] = [];
  const seen = new Set<string>();
  clips.forEach((raw, i) => {
    const parsed = LabelSchema.safeParse(raw);
    const name = typeof (raw as { file?: unknown })?.file === "string" ? (raw as { file: string }).file : `clip ${i + 1}`;
    if (!parsed.success) throw new Error(`${name}: ${parsed.error.issues.map((e) => `${e.path.join(".")} ${e.message}`).join("; ")}`);
    if (seen.has(parsed.data.file)) throw new Error(`${parsed.data.file} is labelled twice`);
    seen.add(parsed.data.file);
    labels.push(parsed.data);
  });
  return labels;
}
