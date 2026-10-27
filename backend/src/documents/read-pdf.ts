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

  const scanned = pageTexts.findIndex((page) => page.replace(/\s/g, "").length < MIN_TEXT_PER_PAGE);
  if (scanned !== -1) {
    const which = pageTexts.length === 1 ? "This" : `Page ${scanned + 1}`;
    throw new DocumentError("scan", `${which} looks like a scan. Send a PDF with selectable text.`);
  }

  return { text, pages: pageTexts.length };
}
