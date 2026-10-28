import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtractionRequest } from "./extraction";
import { askMuseSpark } from "./muse-spark";

let dir: string;
let page: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "siteproof-muse-"));
  page = join(dir, "page-1.png");
  await Bun.write(page, new Uint8Array([0x89, 0x50, 0x4e, 0x47])); // the PNG signature is enough here
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const KEY = "sk-test-0000-never-shown";

function request(): ExtractionRequest {
  return { prompt: "Rules: ...", pageImages: [page], responseSchema: { type: "object" } };
}

/** A fetch that records what was sent and answers with `body` and `status`. */
function fakeFetch(body: unknown, status = 200) {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, sent };
}

const ANSWER = '{"claims":[]}';

function completed(text = ANSWER) {
  return {
    status: "completed",
    output: [
      { type: "reasoning", summary: [] },
      { type: "message", role: "assistant", content: [{ type: "output_text", text }] },
    ],
    usage: { input_tokens: 3100, output_tokens: 820 },
  };
}

test("sends the prompt and every page to Muse Spark, held to the schema, and returns its answer", async () => {
  const { fetch, sent } = fakeFetch(completed());

  const { text, usage } = await askMuseSpark(request(), { apiKey: KEY, baseUrl: "https://api.test/v1", fetch });

  expect(text).toBe(ANSWER);
  expect(usage).toEqual({ input_tokens: 3100, output_tokens: 820 });
  expect(sent[0]!.url).toBe("https://api.test/v1/responses");
  expect((sent[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);

  const body = JSON.parse(sent[0]!.init.body as string);
  expect(body.model).toBe("muse-spark-1.3");
  expect(body.text.format).toEqual({ type: "json_schema", name: "siteproof_claims", schema: { type: "object" }, strict: true });
  const [prompt, image] = body.input[0].content;
  expect(prompt).toEqual({ type: "input_text", text: "Rules: ..." });
  expect(image.type).toBe("input_image");
  expect(image.image_url).toBe("data:image/png;base64,iVBORw==");
});

test("an HTTP failure says only the status: the body can echo the document back", async () => {
  const { fetch } = fakeFetch({ error: { message: "rate limited while reading: 3.1 UPVC window" } }, 429);

  const error = await askMuseSpark(request(), { apiKey: KEY, baseUrl: "https://api.test/v1", fetch }).catch((e) => e);

  expect(error).toMatchObject({ code: "request_failed", message: "Muse Spark request failed with HTTP 429" });
  expect(String(error.message)).not.toContain("UPVC");
  expect(String(error.message)).not.toContain(KEY);
});

test("an answer cut off before the end fails: a truncated list of claims silently drops lines", async () => {
  const { fetch } = fakeFetch({ ...completed(), status: "incomplete", incomplete_details: { reason: "max_output_tokens" } });

  const ask = askMuseSpark(request(), { apiKey: KEY, baseUrl: "https://api.test/v1", fetch });

  await expect(ask).rejects.toMatchObject({ code: "incomplete" });
});

test("a refusal fails rather than reading as a document with no claims", async () => {
  const refused = {
    status: "completed",
    output: [{ type: "message", role: "assistant", content: [{ type: "refusal", refusal: "I can't help with that." }] }],
  };
  const { fetch } = fakeFetch(refused);

  const ask = askMuseSpark(request(), { apiKey: KEY, baseUrl: "https://api.test/v1", fetch });

  await expect(ask).rejects.toMatchObject({ code: "refused" });
});

test("a completed answer with no text in it fails, never an empty string handed on", async () => {
  const { fetch } = fakeFetch({ status: "completed", output: [{ type: "reasoning", summary: [] }] });

  const ask = askMuseSpark(request(), { apiKey: KEY, baseUrl: "https://api.test/v1", fetch });

  await expect(ask).rejects.toMatchObject({ code: "empty" });
});

test("a page that is not a PNG or JPEG is refused before anything is sent", async () => {
  const { fetch, sent } = fakeFetch(completed());

  const ask = askMuseSpark({ ...request(), pageImages: [join(dir, "boq.pdf")] }, { apiKey: KEY, baseUrl: "https://api.test/v1", fetch });

  await expect(ask).rejects.toMatchObject({ code: "bad_image" });
  expect(sent).toHaveLength(0);
});

test("an HTTP failure keeps its status as a number, so a 400 can be told from a 503", async () => {
  const { fetch } = fakeFetch({}, 503);

  const error = await askMuseSpark(request(), { apiKey: KEY, baseUrl: "https://api.test/v1", fetch }).catch((e) => e);

  expect(error).toMatchObject({ code: "request_failed", status: 503 });
});
