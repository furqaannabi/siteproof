import { expect, test } from "bun:test";
import { parseLabels } from "./labels";

test("a label file reads into labels", () => {
  const file = { clips: [{ file: "c01.mp4", kind: "sweep", room: "Bedroom 2", counts: { window: 2, door: 1 } }] };

  expect(parseLabels(file)).toEqual([{ file: "c01.mp4", kind: "sweep", room: "Bedroom 2", counts: { window: 2, door: 1 } }]);
});

test("a mistake in the label file is refused, naming the clip, rather than scoring against it", () => {
  const cases: [unknown, string][] = [
    [{ clips: [{ file: "c01.mp4", kind: "walkthrough", counts: { window: 2 } }] }, "c01.mp4"],
    [{ clips: [{ file: "c02.mp4", kind: "pan", counts: {} }] }, "c02.mp4"],
    [{ clips: [{ file: "c03.mp4", kind: "messy", counts: { window: -1 } }] }, "c03.mp4"],
    [{ clips: [{ file: "c04.mp4", kind: "messy", counts: { window: 1.5 } }] }, "c04.mp4"],
    [{ clips: [{ file: "c05.mp4", kind: "sweep", counts: { window: 1 } }, { file: "c05.mp4", kind: "pan", counts: { window: 1 } }] }, "c05.mp4 is labelled twice"],
  ];
  for (const [file, mentions] of cases) expect(() => parseLabels(file)).toThrow(mentions);
});
