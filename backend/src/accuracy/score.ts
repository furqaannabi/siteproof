/**
 * Scores counts against hand counts, for the accuracy table in the README.
 *
 * See docs/decisions/2026-10-28-how-counting-accuracy-is-measured.md
 */
import type { ItemKind } from "@siteproof/contract";

export type ClipKind = "sweep" | "messy" | "pan";

/** The truth for one clip: how many distinct objects of each item appear in it. */
export interface Label {
  file: string;
  kind: ClipKind;
  /** Only for a clip that covers one room. */
  room?: string;
  counts: Partial<Record<ItemKind, number>>;
}

/** What a counter reported for one clip and item. */
export interface CountResult {
  file: string;
  item: ItemKind;
  counted: number;
}

export interface Row {
  file: string;
  kind: ClipKind;
  item: ItemKind;
  truth: number;
  counted: number;
  /** counted − truth: positive is an over-count, negative an under-count. */
  error: number;
}

export interface Summary {
  clips: number;
  counts: number;
  exact: number;
  /** Counts above the truth: the direction that can make a claim Verified for nothing. */
  over: number;
  /** How far over, on average, among the over-counts. 0 when there are none. */
  overBy: number;
  /** Counts below the truth: the direction that can make a false Short. */
  under: number;
  underBy: number;
  meanAbsoluteError: number;
}

const average = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/**
 * Over- and under-counts are kept apart on purpose: summed together, an over-count
 * in one clip and an under-count in another cancel into a number that looks right.
 */
function summarise(rows: Row[]): Summary {
  const over = rows.filter((r) => r.error > 0).map((r) => r.error);
  const under = rows.filter((r) => r.error < 0).map((r) => -r.error);
  return {
    clips: new Set(rows.map((r) => r.file)).size,
    counts: rows.length,
    exact: rows.filter((r) => r.error === 0).length,
    over: over.length,
    overBy: average(over),
    under: under.length,
    underBy: average(under),
    meanAbsoluteError: average(rows.map((r) => Math.abs(r.error))),
  };
}

const KINDS: ClipKind[] = ["sweep", "messy", "pan"];

/** A labelled item that has no result yet. */
export type NotRun = Omit<Row, "counted" | "error">;

/**
 * One row per labelled clip and item that has a result. A labelled item without one
 * goes in `notRun`, out of the summary: scoring it as zero would invent an
 * under-count, and dropping it would hide that the table is incomplete. A result
 * nobody labelled is ignored, since there is no truth to score it against.
 */
export function score(labels: Label[], results: CountResult[]) {
  const rows: Row[] = [];
  const notRun: NotRun[] = [];
  for (const label of labels) {
    for (const [item, truth] of Object.entries(label.counts) as [ItemKind, number][]) {
      const result = results.find((r) => r.file === label.file && r.item === item);
      if (result) rows.push({ file: label.file, kind: label.kind, item, truth, counted: result.counted, error: result.counted - truth });
      else notRun.push({ file: label.file, kind: label.kind, item, truth });
    }
  }
  const byKind = Object.fromEntries(KINDS.map((k) => [k, summarise(rows.filter((r) => r.kind === k))])) as Record<ClipKind, Summary>;
  return { rows, notRun, overall: summarise(rows), byKind };
}

const KIND_NAMES: Record<ClipKind, string> = {
  sweep: "One-way sweep",
  messy: "Messy clip",
  pan: "Back-and-forth pan",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const oneDecimal = (x: number) => x.toFixed(1);
const withSize = (n: number, by: number) => (n === 0 ? "0" : `${n} (by ${oneDecimal(by)})`);
const signed = (e: number) => (e > 0 ? `+${e}` : `${e}`);

/**
 * The accuracy table for the README, in Markdown. It opens with how much was
 * measured, because with 15–20 clips the honest claim is "this is what we
 * measured", never "SAM is N% accurate".
 */
export function renderTable(scored: ReturnType<typeof score>): string {
  const { rows, notRun, overall, byKind } = scored;
  const summaryRow = (name: string, s: Summary) =>
    `| ${name} | ${s.counts} | ${s.exact} | ${withSize(s.over, s.overBy)} | ${withSize(s.under, s.underBy)} | ${oneDecimal(s.meanAbsoluteError)} |`;

  const lines = [
    `Measured on ${plural(overall.clips, "clip")}: ${plural(overall.counts, "count")}, each against a hand count.` +
      (notRun.length > 0 ? ` ${plural(notRun.length, "count")} not run yet.` : ""),
    "",
    "| Kind of clip | Counts | Exact | Over | Under | Mean error |",
    "| --- | --- | --- | --- | --- | --- |",
    ...KINDS.filter((k) => byKind[k].counts > 0).map((k) => summaryRow(KIND_NAMES[k], byKind[k])),
    summaryRow("All clips", overall),
    "",
    "| Clip | Kind | Item | Hand count | Counted | Error |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map((r) => `| ${r.file} | ${KIND_NAMES[r.kind]} | ${r.item} | ${r.truth} | ${r.counted} | ${signed(r.error)} |`),
  ];
  if (notRun.length > 0) lines.push("", `Not run yet: ${notRun.map((n) => `${n.file} ${n.item}`).join(", ")}.`);
  return lines.join("\n");
}
