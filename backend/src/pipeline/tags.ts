/**
 * Reading QR codes out of sampled frames, with zbar's `zbarimg` (a system binary,
 * like ffmpeg and pdftotext: `brew install zbar`, `apt install zbar-tools`).
 *
 * Every code is returned, room tag or not; `segmentsFromTags` keeps only room tags,
 * so a window maker's warranty sticker in frame is ignored there.
 */
import type { TagSighting } from "./segments";

// zbarimg exits 4 when it read the image but found no code: that is a frame with no
// tag in it, not an error.
const NO_CODE_FOUND = 4;

async function codesIn(path: string): Promise<string[]> {
  const proc = Bun.spawn(["zbarimg", "-q", "--raw", "-Sdisable", "-Sqrcode.enable", path], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (code === NO_CODE_FOUND) return [];
  if (code !== 0) throw new Error(`zbarimg exited ${code}`);
  return out.split("\n").filter(Boolean).sort();
}

export async function decodeTags(frames: readonly { path: string; t: number }[]): Promise<TagSighting[]> {
  const sightings: TagSighting[] = [];
  for (const frame of frames) {
    for (const qr_code of await codesIn(frame.path)) sightings.push({ t: frame.t, qr_code });
  }
  return sightings;
}
