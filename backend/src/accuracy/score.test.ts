import { expect, test } from "bun:test";
import { score, type CountResult, type Label } from "./score";

const sweep = (file: string, counts: Label["counts"]): Label => ({ file, kind: "sweep", room: "Bedroom 2", counts });

test("a clip counted exactly is one exact row, and the summary says so", () => {
  const labels: Label[] = [sweep("c01.mp4", { window: 2 })];
  const results: CountResult[] = [{ file: "c01.mp4", item: "window", counted: 2 }];

  const scored = score(labels, results);

  expect(scored.rows).toEqual([{ file: "c01.mp4", kind: "sweep", item: "window", truth: 2, counted: 2, error: 0 }]);
  expect(scored.overall).toMatchObject({ clips: 1, counts: 1, exact: 1, over: 0, under: 0, meanAbsoluteError: 0 });
});

const pan = (file: string, counts: Label["counts"]): Label => ({ file, kind: "pan", counts });

test("over-counts and under-counts are reported apart, each with its average size", () => {
  const labels = [sweep("a.mp4", { window: 4 }), sweep("b.mp4", { window: 4 }), sweep("c.mp4", { window: 4 }), sweep("d.mp4", { window: 4 })];
  const results: CountResult[] = [
    { file: "a.mp4", item: "window", counted: 6 }, // over by 2
    { file: "b.mp4", item: "window", counted: 5 }, // over by 1
    { file: "c.mp4", item: "window", counted: 3 }, // under by 1
    { file: "d.mp4", item: "window", counted: 4 }, // exact
  ];

  const { overall } = score(labels, results);

  // Over by 2 and under by 1 must not cancel into something that looks better.
  expect(overall).toEqual({ clips: 4, counts: 4, exact: 1, over: 2, overBy: 1.5, under: 1, underBy: 1, meanAbsoluteError: 1 });
});

test("each clip kind gets its own summary: the table's point is that sweeps count well and pans do not", () => {
  const labels = [sweep("s1.mp4", { window: 3 }), sweep("s2.mp4", { window: 2 }), pan("p1.mp4", { window: 3 })];
  const results: CountResult[] = [
    { file: "s1.mp4", item: "window", counted: 3 },
    { file: "s2.mp4", item: "window", counted: 2 },
    { file: "p1.mp4", item: "window", counted: 5 },
  ];

  const { byKind } = score(labels, results);

  expect(byKind.sweep).toMatchObject({ clips: 2, exact: 2, over: 0 });
  expect(byKind.pan).toMatchObject({ clips: 1, exact: 0, over: 1, overBy: 2 });
  expect(byKind.messy).toMatchObject({ clips: 0, counts: 0 });
});

test("a labelled item with no result is listed as not run, never scored as zero or left out", () => {
  const labels = [sweep("a.mp4", { window: 2, door: 1 })];
  const results: CountResult[] = [{ file: "a.mp4", item: "window", counted: 2 }];

  const { overall, notRun } = score(labels, results);

  expect(notRun).toEqual([{ file: "a.mp4", kind: "sweep", item: "door", truth: 1 }]);
  expect(overall).toMatchObject({ counts: 1, exact: 1, under: 0 });
});

test("a result for something nobody labelled is left out: there is no truth to score it against", () => {
  const labels = [sweep("a.mp4", { window: 2 })];
  const results: CountResult[] = [
    { file: "a.mp4", item: "window", counted: 2 },
    { file: "a.mp4", item: "door", counted: 7 },
    { file: "stray.mp4", item: "window", counted: 9 },
  ];

  const { rows } = score(labels, results);

  expect(rows.map((r) => [r.file, r.item])).toEqual([["a.mp4", "window"]]);
});

import { renderTable } from "./score";

test("the README table states how much was measured first, then each kind, then every row", () => {
  const labels = [sweep("s1.mp4", { window: 3 }), pan("p1.mp4", { window: 3, door: 1 })];
  const results: CountResult[] = [
    { file: "s1.mp4", item: "window", counted: 3 },
    { file: "p1.mp4", item: "window", counted: 5 },
  ];

  const table = renderTable(score(labels, results)).split("\n");

  expect(table[0]).toBe("Measured on 2 clips: 2 counts, each against a hand count. 1 count not run yet.");
  expect(table).toContain("| One-way sweep | 1 | 1 | 0 | 0 | 0.0 |");
  expect(table).toContain("| Back-and-forth pan | 1 | 0 | 1 (by 2.0) | 0 | 2.0 |");
  expect(table).toContain("| All clips | 2 | 1 | 1 (by 2.0) | 0 | 1.0 |");
  expect(table).toContain("| p1.mp4 | Back-and-forth pan | window | 3 | 5 | +2 |");
  expect(table).toContain("Not run yet: p1.mp4 door.");
});
