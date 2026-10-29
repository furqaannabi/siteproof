import { expect, test } from "bun:test";
import { isOneWaySweep } from "./sweep";

// Shifts between consecutive sampled frames, in pixels of a 160-wide profile:
// positive when the camera turned right, negative when it turned left.

test("a steady pan in one direction is a one-way sweep", () => {
  expect(isOneWaySweep([12, 15, 9, 14, 11])).toBe(true);
  expect(isOneWaySweep([-10, -13, -8])).toBe(true);
});

test("panning back over what was already filmed is not a one-way sweep", () => {
  expect(isOneWaySweep([12, 15, 9, -14, -11])).toBe(false);
});

test("hand shake while panning one way is still a sweep: a jitter of a few pixels back is not a pan back", () => {
  expect(isOneWaySweep([12, -2, 15, 9, -3, 14])).toBe(true);
});

test("standing still is not a sweep: the room wasn't swept", () => {
  expect(isOneWaySweep([1, -1, 0, 2, -2, 0])).toBe(false);
});

test("too short to tell is not a sweep", () => {
  expect(isOneWaySweep([])).toBe(false);
  expect(isOneWaySweep([14, 12])).toBe(false);
});

/** Frames cropped from one wide picture at these left edges: a pan whose movement is known. */
async function panFrames(lefts: number[]) {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "siteproof-sweep-"));
  const wide = join(dir, "wide.png");
  const run = async (...args: string[]) => {
    const proc = Bun.spawn(["ffmpeg", "-v", "error", "-y", ...args], { stderr: "pipe" });
    if ((await proc.exited) !== 0) throw new Error(await new Response(proc.stderr).text());
  };
  // Blocky random texture, like a plastered wall: textured everywhere, so every step
  // has one true answer. (A Mandelbrot's flat black interior was ambiguous.)
  await run("-f", "lavfi", "-i", "nullsrc=s=90x30,format=gray,geq=lum='random(1)*255'", "-frames:v", "1", "-vf", "scale=900:300:flags=bicubic", wide);
  const paths: string[] = [];
  for (const [i, left] of lefts.entries()) {
    const path = join(dir, `${i}.jpg`);
    await run("-i", wide, "-vf", `crop=400:300:${left}:0`, path);
    paths.push(path);
  }
  return paths;
}

test("the camera's movement is measured from the frames, in the right direction", async () => {
  const { panShifts } = await import("./sweep");
  // Each step moves the view 40 px of a 400 px frame right: 16 px of a 160 px profile.
  const right = await panShifts(await panFrames([0, 40, 80, 120]));
  const back = await panShifts(await panFrames([0, 40, 80, 40, 0]));

  for (const s of right) expect(Math.abs(s - 16)).toBeLessThanOrEqual(2);
  expect(back.map(Math.sign)).toEqual([1, 1, -1, -1]);
  expect(isOneWaySweep(back)).toBe(false);
});
