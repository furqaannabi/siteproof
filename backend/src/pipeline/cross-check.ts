/**
 * The Muse Spark cross-check: a second, independent count of an item in a clip's
 * footage of one room. It can only hold an outcome back, never produce one: the
 * comparison engine needs it to agree with SAM's count before Verified or Short.
 * See docs/decisions/2026-10-29-results-per-room-computed-on-read.md.
 */
import type { ItemKind } from "@siteproof/contract";
import { z } from "zod";
import type { ExtractionRequest } from "../documents/extraction";

/** Enough to see a room swept at 2 fps without paying for every frame. */
const MAX_FRAMES = 12;

/** The clip's sampled frames inside the room's stretches, at most twelve, spread evenly. */
export function framesOfRoom<F extends { t: number }>(
  frames: readonly F[],
  stretches: readonly { t_start: number; t_end: number }[],
): F[] {
  const inRoom = frames.filter((f) => stretches.some((s) => f.t >= s.t_start && f.t < s.t_end));
  if (inRoom.length <= MAX_FRAMES) return inRoom;
  return Array.from({ length: MAX_FRAMES }, (_, k) => inRoom[Math.round((k * (inRoom.length - 1)) / (MAX_FRAMES - 1))]!);
}

const Count = z.object({ count: z.number().int().nonnegative() }).strict();

/** The count, or null for anything but `{"count": n}` with n a whole number: never a guess, never zero. */
export function readCount(text: string): number | null {
  try {
    const parsed = Count.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.count : null;
  } catch {
    return null;
  }
}

const NAMES: Record<ItemKind, string> = { window: "window", door: "door" };

/** The request for one room's frames and one item, in Muse Spark's strict JSON mode. */
export function crossCheckRequest(item: ItemKind, framePaths: readonly string[]): ExtractionRequest {
  const name = NAMES[item];
  return {
    prompt: [
      `These images are frames, in order, from one phone video filmed inside one room of a building under construction.`,
      `Count how many distinct ${name}s are installed in this room.`,
      `The same ${name} often appears in several frames: count each physical ${name} once.`,
      `Count only ${name}s fitted in the walls, not frames leaning against a wall or stacked on the floor.`,
      `Answer with {"count": <whole number>} and nothing else.`,
    ].join(" "),
    pageImages: framePaths,
    responseSchema: {
      type: "object",
      properties: { count: { type: "integer", minimum: 0 } },
      required: ["count"],
      additionalProperties: false,
    },
  };
}
