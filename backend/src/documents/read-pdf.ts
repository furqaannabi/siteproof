import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Reads a PDF's text layer with `pdftotext -layout`.
 *
 * This text is the one copy of the document that no model produced, so it is what
 * every quote is verified against. `-layout` keeps each table row on one line, with
 * the unit and quantity beside the item they belong to; the one-line quote rule in
 * the extraction prompt depends on that.
 *
 * A scanned page has no text layer, so there is nothing to verify a quote against,
 * and the document is refused rather than read. See
 * docs/decisions/2026-10-27-unreadable-input-is-refused-with-a-next-step.md
 */

// The ADR's threshold: a real BOQ page clears it by an order of magnitude, a scan
// yields single digits. Applied to every page, not the average, because one scanned
// page among text pages would otherwise pass and its lines would silently be missing
// from the claims. The cost is that a page holding only "Page 2 of 2" is refused too;
// a refusal the builder can see beats claims nobody knows are absent.
const MIN_TEXT_PER_PAGE = 50;

/**
 * A document that cannot be read as text. `message` is plain language a builder can
 * act on; it never carries a path or pdftotext's own output.
 */
export class DocumentError extends Error {
  constructor(
    readonly code: "unreadable" | "scan",
    message: string,
  ) {
    super(message);
    this.name = "DocumentError";
  }
}

export interface DocumentText {
  /** The layout text. Pages are separated by a form feed, as pdftotext writes them. */
  text: string;
  pages: number;
}

export async function readDocumentText(pdfPath: string): Promise<DocumentText> {
  const proc = Bun.spawn(["pdftotext", "-layout", "-enc", "UTF-8", pdfPath, "-"], { stdout: "pipe", stderr: "pipe" });
  const [text, , code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new DocumentError("unreadable", "This file could not be read as a PDF.");

  // pdftotext ends every page with a form feed, so the piece after the last one is empty.
  const pageTexts = text.split("\f").slice(0, -1);
  if (pageTexts.length === 0) throw new DocumentError("unreadable", "This file could not be read as a PDF.");

  const isScan = (page: string) => page.replace(/\s/g, "").length < MIN_TEXT_PER_PAGE;
  const scanned = pageTexts.findIndex(isScan);
  if (scanned !== -1) {
    // Name the page only when some pages are fine: "Page 1 looks like a scan" of a
    // document scanned throughout points at the wrong thing.
    const which = pageTexts.every(isScan) ? "This" : `Page ${scanned + 1}`;
    throw new DocumentError("scan", `${which} looks like a scan. Send a PDF with selectable text.`);
  }

  return { text, pages: pageTexts.length };
}

// Enough for 9.5 pt table text to stay legible to the model; an A4 page comes out
// about 1240 x 1750 pixels.
const PAGE_DPI = 150;

/**
 * Renders every page of a PDF to a PNG, for Muse Spark to read the table layout
 * from. Returns the image paths in page order.
 *
 * @param outDir Must be empty or not exist yet. A page left over from another
 *   document must never be sent as this one's, so a folder with files in it is
 *   refused rather than cleared: deleting the caller's files is not ours to do.
 */
export async function renderPageImages(pdfPath: string, outDir: string): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  if ((await readdir(outDir)).length > 0) throw new Error("page folder is not empty");

  const proc = Bun.spawn(["pdftoppm", "-png", "-r", String(PAGE_DPI), pdfPath, join(outDir, "page")], {
    stdout: "ignore",
    stderr: "pipe",
  });
  const [, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new DocumentError("unreadable", "This file could not be read as a PDF.");

  // pdftoppm pads page numbers to the same width, so a plain sort is page order.
  return (await readdir(outDir))
    .filter((name) => name.endsWith(".png"))
    .sort()
    .map((name) => join(outDir, name));
}

/**
 * Throws a DocumentError unless every page of the PDF in `bytes` has a text layer.
 * pdftotext reads from disk, so the bytes go to a private temporary folder that is
 * removed whatever happens.
 */
export async function checkReadablePdf(bytes: Uint8Array): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "siteproof-upload-"));
  try {
    const path = join(dir, "upload.pdf");
    await Bun.write(path, bytes);
    await readDocumentText(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
