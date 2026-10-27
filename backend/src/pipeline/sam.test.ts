import { expect, test } from "bun:test";
import { readSegmentation } from "./sam";

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
