import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeTags } from "./tags";

// Printed QR codes made with qrencode, committed as fixtures: never site footage.
const TAG = join(import.meta.dir, "../../fixtures/tags/SPKTCHN001.png");
const STICKER = join(import.meta.dir, "../../fixtures/tags/maker-sticker.png");

let dir: string;
let blank: string;
let both: string;

async function ffmpeg(...args: string[]) {
  const proc = Bun.spawn(["ffmpeg", "-v", "error", "-y", ...args], { stderr: "pipe" });
  if ((await proc.exited) !== 0) throw new Error(await new Response(proc.stderr).text());
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "siteproof-tags-"));
  blank = join(dir, "blank.png");
  both = join(dir, "both.png");
  await ffmpeg("-f", "lavfi", "-i", "color=c=gray:s=320x240", "-frames:v", "1", blank);
  await ffmpeg("-i", TAG, "-i", STICKER, "-filter_complex", "[0][1]scale2ref[a][b];[a][b]hstack", both);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("every QR code in every frame comes back with its time; a frame with none is not an error", async () => {
  const sightings = await decodeTags([
    { path: blank, t: 0 },
    { path: TAG, t: 0.5 },
    { path: both, t: 1 },
  ]);

  expect(sightings).toEqual([
    { t: 0.5, qr_code: "SPKTCHN001" },
    { t: 1, qr_code: "SPKTCHN001" },
    { t: 1, qr_code: "https://upvc-maker.example/warranty/4471" },
  ]);
});
