/**
 * The coverage rule's camera half: whether a stretch of a clip is a one-way sweep,
 * panning steadily in one direction and never back over what was already filmed.
 *
 * The camera's sideways movement between consecutive sampled frames is measured by
 * lining up each frame's column brightness profile with the next one's. Only a
 * one-way sweep from a room's tag can make the room fully covered, and only a fully
 * covered room can be Short, so this errs towards "not a sweep".
 */

/** Fewer measured steps than this (1.5 s at 2 fps) is too short to call a sweep. */
const MIN_STEPS = 3;
/** A step back this small (of a 160-wide profile) is hand shake, not a pan back. */
const JITTER_PX = 4;
/** Less travel than this in total is standing still, not sweeping a room. */
const MIN_TRAVEL_PX = 20;

export function isOneWaySweep(shifts: readonly number[]): boolean {
  if (shifts.length < MIN_STEPS) return false;
  const travel = shifts.reduce((a, b) => a + b, 0);
  if (Math.abs(travel) < MIN_TRAVEL_PX) return false;
  const direction = Math.sign(travel);
  // Any step back larger than a jitter is panning back over what was already filmed.
  return shifts.every((s) => s * direction >= -JITTER_PX);
}

const PROFILE_W = 160;
const PROFILE_H = 90;
/** The largest step looked for between two frames: a quarter of the frame. */
const MAX_SHIFT = PROFILE_W / 4;

/** A frame shrunk to 160×90 grey, with its overall mean removed. */
async function smallFrame(path: string): Promise<Float64Array> {
  const proc = Bun.spawn(
    ["ffmpeg", "-v", "error", "-i", path, "-vf", `scale=${PROFILE_W}:${PROFILE_H},format=gray`, "-f", "rawvideo", "-"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [bytes, code] = await Promise.all([new Response(proc.stdout).arrayBuffer(), proc.exited]);
  if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
  const pixels = Float64Array.from(new Uint8Array(bytes));
  // Removing the mean keeps a change of exposure from reading as movement.
  const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;
  return pixels.map((v) => v - mean);
}

/**
 * How far the view moved from `a` to `b`, in columns of the 160-wide frame: positive
 * when the camera turned right (what was at column x + s in `a` is at column x in `b`).
 * Every row is compared, not a column average, so flat stretches can't fool it.
 */
function shiftBetween(a: Float64Array, b: Float64Array): number {
  let best = 0;
  let bestError = Infinity;
  for (let s = -MAX_SHIFT; s <= MAX_SHIFT; s++) {
    let error = 0;
    let n = 0;
    for (let y = 0; y < PROFILE_H; y++) {
      const row = y * PROFILE_W;
      for (let x = Math.max(0, -s); x < Math.min(PROFILE_W, PROFILE_W - s); x++) {
        error += Math.abs(a[row + x + s]! - b[row + x]!);
        n++;
      }
    }
    if (error / n < bestError) {
      bestError = error / n;
      best = s;
    }
  }
  return best;
}

/** The camera's sideways movement between each pair of consecutive frames. */
export async function panShifts(framePaths: readonly string[]): Promise<number[]> {
  const profiles = await Promise.all(framePaths.map(smallFrame));
  return profiles.slice(1).map((b, i) => shiftBetween(profiles[i]!, b));
}
