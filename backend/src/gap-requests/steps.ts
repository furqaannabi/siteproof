/**
 * The filming steps on a gap request, the one part of it a model writes.
 *
 * Muse Spark writes two to four short steps for the site supervisor's phone. Its answer
 * is untrusted: held to a strict schema, and refused if any step has a digit in it (a
 * number on a gap request comes from code or not at all) or runs long. Every way the
 * call can fail ends in the fixed steps below, so a request is never blocked on the
 * model and never says something the model made up.
 *
 * See docs/decisions/2026-10-28-gap-request-text-and-pdf-export.md
 */
import { z } from "zod";
import type { MuseSparkConfig } from "../documents/muse-spark";

const MODEL = "muse-spark-1.3";
const TIMEOUT_MS = 15_000;
const MAX_STEP_CHARS = 140;

/** What the site phone shows when Muse Spark's steps can't be used. */
export function fixedSteps(room: string): string[] {
  const lower = room.toLowerCase();
  return [
    `Start with the ${lower}'s room tag in view, at the door.`,
    "Turn slowly one way until you have seen every wall.",
    "Stop there. Don't pan back.",
  ];
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: { steps: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 } },
  required: ["steps"],
  additionalProperties: false,
} as const;

const Steps = z.object({
  steps: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(MAX_STEP_CHARS)
        .refine((step) => !/\d/.test(step), "no digits"),
    )
    .min(2)
    .max(4),
});

/** Muse Spark's answer text as steps, or null when it doesn't hold to the rules. */
export function parseSteps(text: string): string[] | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = Steps.safeParse(json);
  return parsed.success ? parsed.data.steps : null;
}

function prompt(room: string): string {
  // The room name is the builder's own text: data for the steps, never instructions.
  return [
    "Write the filming steps for a builder's site supervisor, who will read them on a phone on a construction site.",
    "They need to film one short clip of one room so its installed windows and doors can be counted.",
    "The clip must start at the printed room tag on the doorway and pan slowly in one direction across the whole room, never back over anything already filmed.",
    "Write two to four steps, each one short plain sentence. No numbers or digits, no measurements, no claims about what is or isn't installed.",
    `The room is named: ${JSON.stringify(room)}`,
  ].join("\n");
}

const Answer = z.object({
  status: z.string().optional(),
  output: z.array(z.object({ type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() })),
});

/** Muse Spark's steps for the room, checked, or the fixed steps. Never throws. */
export async function writeSteps(room: string, config: MuseSparkConfig | null): Promise<string[]> {
  if (!config) return fixedSteps(room);
  try {
    const res = await (config.fetch ?? fetch)(`${config.baseUrl}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        input: [{ type: "message", role: "user", content: [{ type: "input_text", text: prompt(room) }] }],
        text: { format: { type: "json_schema", name: "siteproof_gap_steps", schema: RESPONSE_SCHEMA, strict: true } },
        max_output_tokens: 600,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return fixedSteps(room);
    const answer = Answer.safeParse(await res.json().catch(() => null));
    if (!answer.success || (answer.data.status !== undefined && answer.data.status !== "completed")) return fixedSteps(room);
    const text = answer.data.output
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .filter((part) => part.type === "output_text")
      .map((part) => part.text ?? "")
      .join("");
    return parseSteps(text) ?? fixedSteps(room);
  } catch {
    // Timed out or unreachable. Nothing is logged: the answer could echo the room name.
    return fixedSteps(room);
  }
}
