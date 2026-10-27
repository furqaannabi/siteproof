import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readDocumentText } from "./read-pdf";

// Fixtures are written by hand, never real documents: the repo is public.
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "siteproof-pdf-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/**
 * The smallest PDF poppler will read: one Courier text line per entry, one page per
 * array. A page with no lines has no text layer at all, which is what a scan looks
 * like to pdftotext. ASCII only, so string length is byte length for the xref.
 */
function pdfBytes(pages: string[][]): string {
  const bodies = new Map<number, string>();
  bodies.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");
  const pageIds: number[] = [];
  let next = 4;
  for (const lines of pages) {
    const pageId = next++;
    const contentId = next++;
    pageIds.push(pageId);
    const escaped = lines.map((l) => `(${l.replace(/[\\()]/g, "\\$&")}) Tj T*`).join(" ");
    const stream = lines.length > 0 ? `BT /F1 10 Tf 12 TL 40 800 Td ${escaped} ET` : "";
    bodies.set(contentId, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    bodies.set(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
  }
  bodies.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  bodies.set(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < next; id++) {
    offsets.push(out.length);
    out += `${id} 0 obj\n${bodies.get(id)}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${next}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${next} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

async function writePdf(name: string, pages: string[][]) {
  const path = join(dir, name);
  await Bun.write(path, pdfBytes(pages));
  return path;
}

const BOQ_PAGE = [
  "Item   Description                                      Unit   Qty",
  "3.1    Providing and fixing UPVC openable window          nos    12",
  "3.2    Providing and fixing flush door, 900 x 2100 mm     nos     8",
];

test("a PDF with a text layer comes back as text, one physical line per line", async () => {
  const pdf = await writePdf("boq.pdf", [BOQ_PAGE]);

  const { text, pages } = await readDocumentText(pdf);

  expect(pages).toBe(1);
  // The quantity stays on the same line as its item: the one-line quote rule depends on it.
  const doorLine = text.split("\n").find((l) => l.includes("flush door"));
  expect(doorLine).toMatch(/flush door, 900 x 2100 mm\s+nos\s+8/);
});

test("every page's text comes back, in order", async () => {
  const finishes = [
    "4.1    Internal plaster, 12 mm thick, two coats           sqm   240",
    "4.2    Vitrified floor tiles, 600 x 600 mm                sqm    96",
  ];
  const pdf = await writePdf("two-pages.pdf", [BOQ_PAGE, finishes]);

  const { text, pages } = await readDocumentText(pdf);

  expect(pages).toBe(2);
  expect(text.indexOf("flush door")).toBeLessThan(text.indexOf("Internal plaster"));
});

test("a page with no text layer is refused as a scan", async () => {
  const pdf = await writePdf("scan.pdf", [[]]);

  const read = readDocumentText(pdf);

  await expect(read).rejects.toMatchObject({
    code: "scan",
    message: "This looks like a scan. Send a PDF with selectable text.",
  });
});

test("one scanned page among text pages is refused, naming the page: its lines would otherwise vanish", async () => {
  const pdf = await writePdf("mixed.pdf", [BOQ_PAGE, []]);

  const read = readDocumentText(pdf);

  await expect(read).rejects.toMatchObject({
    code: "scan",
    message: "Page 2 looks like a scan. Send a PDF with selectable text.",
  });
});

test("a page with only a few characters counts as a scan, not as a page with nothing on it", async () => {
  const pdf = await writePdf("stamp.pdf", [BOQ_PAGE, ["Page 2 of 2"]]);

  const read = readDocumentText(pdf);

  await expect(read).rejects.toMatchObject({ code: "scan" });
});

test("a file that is not a PDF is refused with a clear error, not a crash", async () => {
  const path = join(dir, "clip.pdf");
  await Bun.write(path, "this is a video, not a demand letter");

  const read = readDocumentText(path);

  await expect(read).rejects.toMatchObject({ code: "unreadable", message: "This file could not be read as a PDF." });
});

test("an error never carries the file's path", async () => {
  const path = join(dir, "flat-302-demand-letter.pdf");
  await Bun.write(path, "not a pdf");

  const error = await readDocumentText(path).catch((e: Error) => e);

  expect(String((error as Error).message)).not.toContain("flat-302");
});
