/**
 * Step 1 of the pipeline: ingest one clip.
 *
 * Reads the clip's capture time from its own metadata and samples frames at a fixed
 * rate into a local folder. Where the clip comes from and where the frames go next
 * (object storage) is the caller's business.
 */
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

// The team plan caps clips at 60 s to control model cost. Over the cap is rejected,
// never cut short: footage dropped without a word is footage the builder thinks was seen.
const CLIP_CAP_SECONDS = 60;

/**
 * A clip that cannot be ingested. `message` is plain language a builder can act on,
 * in the gap-request voice: what to send instead, never "invalid file". It never
 * carries a path, a URL or ffmpeg's own output.
 */
export class IngestError extends Error {
  constructor(
    readonly code: "unreadable" | "no_video" | "photo" | "too_long" | "incomplete",
    message: string,
  ) {
    super(message);
    this.name = "IngestError";
  }
}

export interface SampledFrame {
  path: string;
  /** Seconds from the start of the clip. */
  t: number;
}

export interface IngestedClip {
  /** null when the file carries no capture time. Never filled in with the upload time. */
  captured_at: string | null;
  duration_s: number;
  /** The video's own frame rate. SAM numbers frames at this rate, not the sampling rate. */
  source_fps: number;
  frames: SampledFrame[];
}

export interface IngestOptions {
  /** Frames per second to sample. The plan says 1–2. */
  fps: number;
  /** Local folder for the sampled frames. Must not be inside a committed path. */
  outDir: string;
}

async function run(cmd: string[]): Promise<string> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`${cmd[0]} exited ${code}: ${err.trim()}`);
  return out;
}

export async function ingestClip(clip: string, { fps, outDir }: IngestOptions): Promise<IngestedClip> {
  const raw = JSON.parse(
    await run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", clip]).catch(() => {
      throw new IngestError("unreadable", "This file won't play as a video — send the clip again from your phone's gallery.");
    }),
  );
  const video = raw.streams.find((s: { codec_type: string }) => s.codec_type === "video");
  if (!video) throw new IngestError("no_video", "This file has no picture in it — send the video clip itself.");

  // ffprobe reads a still image as a video of one frame. A photo has no sweep and no
  // trustworthy capture time, so it must never reach counting.
  const format = String(raw.format.format_name);
  if (format === "image2" || format.endsWith("_pipe")) {
    throw new IngestError("photo", "Photos can't be counted — 5 seconds of video from the room tag will clear this room.");
  }

  // The video track's own length: the file's length is its longest track, and on
  // phones the sound often runs a little past the picture.
  const duration_s = Number(video.duration ?? raw.format.duration);
  if (duration_s > CLIP_CAP_SECONDS) {
    throw new IngestError(
      "too_long",
      `This clip is ${Math.ceil(duration_s)} s — send it as clips of ${CLIP_CAP_SECONDS} s or less, each starting at a room tag.`,
    );
  }

  // Phones write the capture time in different places. Prefer Apple's own tag (local
  // time with offset) over the generic one.
  const tags = raw.format.tags ?? {};
  const captured_at: string | null =
    tags["com.apple.quicktime.creationdate"] ?? tags.creation_time ?? video.tags?.creation_time ?? null;

  await mkdir(outDir, { recursive: true });
  // A frame left over from another clip must never become this clip's evidence.
  // Refuse rather than clear: deleting the caller's files is not ours to do.
  if ((await readdir(outDir)).length > 0) throw new Error("frame folder is not empty");
  // ffmpeg applies the rotation tag itself, so frames come out the right way up.
  await run(["ffmpeg", "-v", "error", "-y", "-i", clip, "-vf", `fps=${fps}`, "-q:v", "2", join(outDir, "%05d.jpg")]);

  const names = (await readdir(outDir)).filter((f) => f.endsWith(".jpg")).sort();

  // A file cut off mid-upload keeps the header's full duration, and ffmpeg still exits
  // 0 with fewer frames. Fewer frames than the duration promises is never a shorter
  // clip: it is footage missing without a word, and it also catches a silent zero.
  if (names.length < Math.floor(duration_s * fps)) {
    throw new IngestError("incomplete", "This clip didn't finish uploading — send it again.");
  }

  const [num = 0, den = 1] = String(video.avg_frame_rate ?? "0/1").split("/").map(Number);

  return {
    captured_at,
    duration_s,
    source_fps: den ? num / den : 0,
    frames: names.map((name, i) => ({ path: join(outDir, name), t: i / fps })),
  };
}
