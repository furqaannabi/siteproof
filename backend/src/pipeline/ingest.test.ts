import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestClip } from "./ingest";

// Fixtures are generated, never real footage: the repo is public.
let dir: string;

async function ffmpeg(...args: string[]) {
  const proc = Bun.spawn(["ffmpeg", "-v", "error", "-y", ...args], { stderr: "pipe" });
  if ((await proc.exited) !== 0) throw new Error(await new Response(proc.stderr).text());
}

async function testClip(name: string, seconds: number, ...extra: string[]) {
  const path = join(dir, name);
  await ffmpeg("-f", "lavfi", "-i", `testsrc=duration=${seconds}:size=320x180:rate=30`, ...extra, path);
  return path;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "siteproof-ingest-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("samples a clip at the given rate and reads its capture time", async () => {
  const clip = await testClip("tagged.mp4", 5, "-metadata", "creation_time=2026-10-27T09:15:00Z");

  const result = await ingestClip(clip, { fps: 1, outDir: join(dir, "tagged") });

  expect(result.captured_at).toBe("2026-10-27T09:15:00.000000Z");
  expect(result.frames.map((f) => f.t)).toEqual([0, 1, 2, 3, 4]);
});

test("a clip with no capture time in its metadata has captured_at null, not the upload time", async () => {
  const clip = await testClip("stripped.mp4", 2, "-map_metadata", "-1", "-fflags", "+bitexact");

  const result = await ingestClip(clip, { fps: 1, outDir: join(dir, "stripped") });

  expect(result.captured_at).toBeNull();
});

test("a clip over the 60 s cap is rejected with a clear error, not cut short", async () => {
  const clip = await testClip("long.mp4", 61);

  const ingest = ingestClip(clip, { fps: 1, outDir: join(dir, "long") });

  await expect(ingest).rejects.toMatchObject({ code: "too_long", message: "This clip is 61 s — send it as clips of 60 s or less, each starting at a room tag." });
});

test("a file that is not a video is rejected with a clear error, not a crash", async () => {
  const clip = join(dir, "letter.mp4");
  await Bun.write(clip, "this is a demand letter, not a video");

  const ingest = ingestClip(clip, { fps: 1, outDir: join(dir, "letter") });

  await expect(ingest).rejects.toMatchObject({ code: "unreadable", message: "This file won't play as a video — send the clip again from your phone's gallery." });
});

test("an audio-only file is rejected with a clear error, not a silent zero", async () => {
  const clip = join(dir, "voice-note.m4a");
  await ffmpeg("-f", "lavfi", "-i", "sine=duration=2", clip);

  const ingest = ingestClip(clip, { fps: 1, outDir: join(dir, "voice-note") });

  await expect(ingest).rejects.toMatchObject({ code: "no_video", message: "This file has no picture in it — send the video clip itself." });
});

test("a photo is rejected: it is not a clip, and one frame of it must never become a count", async () => {
  const photo = join(dir, "window.jpg");
  await ffmpeg("-f", "lavfi", "-i", "testsrc=size=320x180", "-frames:v", "1", photo);

  const ingest = ingestClip(photo, { fps: 1, outDir: join(dir, "window") });

  await expect(ingest).rejects.toMatchObject({ code: "photo", message: "Photos can't be counted — 5 seconds of video from the room tag will clear this room." });
});

test("a clip whose sound runs past its video is sampled, not mistaken for a cut-off upload", async () => {
  const clip = join(dir, "long-audio.mp4");
  await ffmpeg(
    "-f", "lavfi", "-i", "testsrc=duration=4:size=320x180:rate=30",
    "-f", "lavfi", "-i", "sine=duration=5",
    clip,
  );

  const result = await ingestClip(clip, { fps: 2, outDir: join(dir, "long-audio") });

  expect(result.frames).toHaveLength(8);
});

test("frames left in the folder from another run never come back as this clip's frames", async () => {
  const outDir = join(dir, "reused");
  const longer = await testClip("longer.mp4", 6);
  await ingestClip(longer, { fps: 1, outDir });
  const shorter = await testClip("shorter.mp4", 2);

  const ingest = ingestClip(shorter, { fps: 1, outDir });

  await expect(ingest).rejects.toThrow("frame folder is not empty");
});

test("a clip cut off mid-upload is rejected, not sampled as a shorter clip", async () => {
  // faststart puts the header first, so the cut-off file still claims its full 10 s.
  const whole = await testClip("whole.mp4", 10, "-movflags", "+faststart");
  const bytes = await Bun.file(whole).arrayBuffer();
  const clip = join(dir, "cut-off.mp4");
  await Bun.write(clip, bytes.slice(0, Math.floor(bytes.byteLength * 0.4)));

  const ingest = ingestClip(clip, { fps: 1, outDir: join(dir, "cut-off") });

  await expect(ingest).rejects.toMatchObject({ code: "incomplete", message: "This clip didn't finish uploading — send it again." });
});
