/**
 * The per-object check: Muse Spark is shown one object's best frame with SAM's box
 * drawn on it, and asked one fixed yes-or-no question. Only a clear yes confirms. It
 * can hold a Verified back, never make a room Short: the comparison engine counts
 * confirmed objects for Verified and SAM's objects for Short.
 * See docs/decisions/2026-11-02-a-full-sweep-returns-to-its-tag-and-each-object-is-confirmed.md.
 */
import type { ItemKind } from "@siteproof/contract";
import { z } from "zod";
import type { ExtractionRequest } from "../documents/extraction";

/** Fixed in code, never taken from a document. */
const QUESTIONS: Record<ItemKind, string> = {
  window: "Is the outlined object a fitted window, a frame with glass installed in the wall? Answer yes or no.",
  door: "Is the outlined object a door leaf hung in its frame? Answer yes or no.",
};

const Answer = z.object({ answer: z.literal("yes") }).strict();

/** True only for `{"answer": "yes"}`: a no, anything unclear or anything malformed is false. */
export function readConfirmed(text: string): boolean {
  try {
    return Answer.safeParse(JSON.parse(text)).success;
  } catch {
    return false;
  }
}

/** The request for one object's outlined frame, in Muse Spark's strict JSON mode. */
export function confirmRequest(item: ItemKind, outlinedFrame: string): ExtractionRequest {
  return {
    prompt: [
      `This image is one frame from a phone video filmed inside a building under construction.`,
      `One object is outlined with a bright magenta box.`,
      QUESTIONS[item],
      `Answer {"answer": "yes"} or {"answer": "no"} and nothing else.`,
    ].join(" "),
    pageImages: [outlinedFrame],
    responseSchema: {
      type: "object",
      properties: { answer: { type: "string", enum: ["yes", "no"] } },
      required: ["answer"],
      additionalProperties: false,
    },
  };
}
