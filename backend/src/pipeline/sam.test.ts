import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSegmentation, samSegmenter, segmentClip } from "./sam";

// SAM 3.1 output text exactly as the API emits it, from the @meta-sam/parser README:
// frame 0 of a 320×334 clip, two objects. One line per frame.
const TWO_OBJECTS =
  "<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|>" +
  "<|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>" +
  ",1<|box;x1=155;y1=228;x2=202;y2=254;w=320;h=334|>" +
  "<|mask;x=0;y=0;data=27,48,~!!!!J!0c[q=Pj_zs=*4C4(/./x#:/`S_GnD`=o3?X{emCgO$y@|>\n";

const lane = { item_id: "message-1", output_index: 0, content_index: 0 };

async function* events(text: string, end: { type: string } = { type: "response.completed" }) {
  yield { type: "response.output_text.delta", ...lane, delta: text };
  yield { type: "response.output_text.done", ...lane, text };
  yield end;
}

test("each SAM object becomes one tracked object, with its box and mask on every frame it was seen", async () => {
  const result = await readSegmentation(events(TWO_OBJECTS));

  expect(result.objects.map((o) => o.track_id)).toEqual(["0", "1"]);
  expect(result.objects[0]!.sightings).toEqual([
    expect.objectContaining({ frame: 0, box: { left: 211, top: 228, right: 271, bottom: 255 } }),
  ]);
});

test("a response that stops early is an error, never a smaller count", async () => {
  const cutOff = { type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" } } };

  const read = readSegmentation(events(TWO_OBJECTS, cutOff));

  await expect(read).rejects.toMatchObject({ code: "incomplete" });
});

test("a line the parser cannot read is an error: the objects on it would otherwise go uncounted", async () => {
  const read = readSegmentation(events(TWO_OBJECTS + "<1f>0<|box;x1=garbage|>\n"));

  await expect(read).rejects.toMatchObject({ code: "unreadable" });
});

test("a reply that goes quiet is an error after the idle limit, never a hang", async () => {
  // A stand-in for the Meta API: takes the upload, starts a reply, then never finishes it.
  const server = Bun.serve({
    port: 0,
    idleTimeout: 30,
    fetch(req) {
      if (new URL(req.url).pathname === "/files") return Response.json({ id: "file-1" });
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "response.created" })}\n\n`));
        },
      });
      return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
    },
  });
  const clip = join(tmpdir(), `sam-timeout-${process.pid}.bin`);
  await Bun.write(clip, "not a real clip: the fake server never reads it");
  try {
    const config = { apiKey: "test", baseUrl: `http://localhost:${server.port}`, idleTimeoutMs: 200 };

    await expect(segmentClip(clip, "door", config)).rejects.toMatchObject({ code: "timed_out" });
  } finally {
    server.stop(true);
    await Bun.file(clip).delete();
  }
});

test("asking for two items in one clip uploads the clip once", async () => {
  let uploads = 0;
  const done = (text: string) =>
    [
      { type: "response.output_text.delta", ...lane, delta: text },
      { type: "response.output_text.done", ...lane, text },
      { type: "response.completed" },
    ]
      .map((e) => `data: ${JSON.stringify(e)}\n\n`)
      .join("");
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      if (new URL(req.url).pathname === "/files") return Response.json({ id: `file-${++uploads}` });
      return new Response(done(TWO_OBJECTS), { headers: { "Content-Type": "text/event-stream" } });
    },
  });
  const clip = join(tmpdir(), `sam-once-${process.pid}.bin`);
  await Bun.write(clip, "not a real clip: the fake server never reads it");
  try {
    const segment = samSegmenter(() => ({ apiKey: "test", baseUrl: `http://localhost:${server.port}` }));

    const [windows, doors] = [await segment(clip, "window"), await segment(clip, "door")];

    expect(uploads).toBe(1);
    expect([windows.objects.length, doors.objects.length]).toEqual([2, 2]);
  } finally {
    server.stop(true);
    await Bun.file(clip).delete();
  }
});
