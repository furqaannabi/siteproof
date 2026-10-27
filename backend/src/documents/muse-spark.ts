/**
 * Asks Muse Spark to read one document, through Meta's Responses API.
 *
 * It sends the prompt and every page image in one request, holds the answer to the
 * extraction schema in strict mode, and hands back the raw JSON text. It does not
 * trust that text: `parseExtraction` does the reading, and `verifyQuote` the checking.
 *
 * Every way the call can come back short is an error, never an empty answer. A
 * refusal, a truncated answer or a missing one would otherwise read downstream as a
 * document with no claims, which is the one outcome nobody would think to question.
 */
import { extname } from "node:path";
import { z } from "zod";
import type { ExtractionRequest } from "./extraction";

const MODEL = "muse-spark-1.3";

// Reading reasoning tokens counts against this as well as the answer. A BOQ's claims
// need a few thousand; the headroom is there so a long BOQ is never cut off.
const MAX_OUTPUT_TOKENS = 16_000;

export interface MuseSparkConfig {
  apiKey: string;
  baseUrl: string;
  /** Tests pass a fake. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

/** Read from backend/.env, the same Meta API settings SAM uses. Never logged. */
export function museSparkConfigFromEnv(): MuseSparkConfig {
  const apiKey = process.env.META_API_KEY;
  const baseUrl = process.env.META_API_BASE_URL;
  if (!apiKey || !baseUrl) throw new Error("META_API_KEY and META_API_BASE_URL must be set in backend/.env");
  return { apiKey, baseUrl };
}

/**
 * Muse Spark gave no whole answer. Messages carry a status code at most: a response
 * body can echo the document back, and documents are never logged.
 */
export class MuseSparkError extends Error {
  constructor(
    readonly code: "bad_image" | "request_failed" | "incomplete" | "refused" | "empty",
    message: string,
    /** The HTTP status, for a request_failed that got one: a 400 is not worth retrying, a 503 is. */
    readonly status?: number,
  ) {
    super(message);
    this.name = "MuseSparkError";
  }
}

export interface MuseSparkAnswer {
  /** The model's JSON, as text. Untrusted until parsed. */
  text: string;
  usage: { input_tokens: number; output_tokens: number } | null;
}

const IMAGE_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

async function asDataUrl(path: string): Promise<string> {
  const type = IMAGE_TYPES[extname(path).toLowerCase()];
  if (!type) throw new MuseSparkError("bad_image", "A page image must be a PNG or JPEG");
  const bytes = Buffer.from(await Bun.file(path).arrayBuffer());
  return `data:${type};base64,${bytes.toString("base64")}`;
}

const Answer = z.object({
  status: z.string().optional(),
  output: z.array(
    z.object({
      type: z.string(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
    }),
  ),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).optional(),
});

export async function askMuseSpark(request: ExtractionRequest, config: MuseSparkConfig): Promise<MuseSparkAnswer> {
  // Every image is checked before anything is sent, so a bad page costs nothing.
  const images = await Promise.all(request.pageImages.map(asDataUrl));

  const res = await (config.fetch ?? fetch)(`${config.baseUrl}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: request.prompt },
            // "high", because the quantities in a BOQ are small print in a table.
            ...images.map((image_url) => ({ type: "input_image", image_url, detail: "high" })),
          ],
        },
      ],
      text: { format: { type: "json_schema", name: "siteproof_claims", schema: request.responseSchema, strict: true } },
      max_output_tokens: MAX_OUTPUT_TOKENS,
    }),
  });
  if (!res.ok) throw new MuseSparkError("request_failed", `Muse Spark request failed with HTTP ${res.status}`, res.status);

  const answer = Answer.safeParse(await res.json().catch(() => null));
  if (!answer.success) throw new MuseSparkError("request_failed", "Muse Spark's answer was not a response object");

  const { status, output, usage } = answer.data;
  if (status === "incomplete") throw new MuseSparkError("incomplete", "Muse Spark's answer was cut off before the end");
  if (status !== undefined && status !== "completed") {
    throw new MuseSparkError("request_failed", `Muse Spark ended with status ${status}`);
  }

  const parts = output.filter((item) => item.type === "message").flatMap((item) => item.content ?? []);
  if (parts.some((part) => part.type === "refusal")) throw new MuseSparkError("refused", "Muse Spark declined to read this document");

  const text = parts
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("");
  if (text.trim() === "") throw new MuseSparkError("empty", "Muse Spark's answer had no text in it");

  return { text, usage: usage ?? null };
}
