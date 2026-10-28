/**
 * Checks that a claimed quote really appears in the document it was taken from.
 *
 * `Claim.quote_verified` is set by this and never by a model. It is the whole
 * difference between a claim SiteProof will show a buyer and an unverified one, so
 * this file leans towards refusing: a quote we cannot reconcile with the document
 * fails, and the claim goes to a person.
 *
 * Both sides are put through the same named list of normalisations before they are
 * compared, and then compared exactly. Each one is here because `pdftotext -layout`
 * or a model demonstrably produces it, and each is defensible out loud to a bank:
 *
 *   1. Unicode NFKC         `ﬁ` → `fi`, and a non-breaking space → an ordinary one.
 *                           A real BOQ holds both `verified` and `veriﬁed`.
 *   2. Soft hyphens removed Typesetting artefacts, never part of a word.
 *   3. Words rejoined       `win-` at a line end followed by `dow` is one word.
 *   4. Dashes unified       En-dash, em-dash and minus all become `-`.
 *   5. Quote marks unified  Curly quotes become straight ones.
 *   6. Whitespace collapsed `-layout` pads columns with runs of spaces; a model
 *                           writes one.
 *   7. Case folded          A BOQ shouting `WINDOWS, OPENABLE` is the same line as
 *                           the model's title case.
 *
 * No similarity threshold, deliberately. `windows: 12` and `windows: 72` are one
 * character apart, so any threshold loose enough to forgive a ligature would wave a
 * fabricated quantity through — invisibly, and on the side of releasing money.
 */

const SOFT_HYPHEN = /­/g;
/** A word broken across lines: the hyphen, the newline and the next line's indent. */
const BROKEN_WORD = /-[ \t]*\r?\n[ \t]*/g;
const DASHES = /[‐‑‒–—―−]/g;
const SINGLE_QUOTES = /[‘’‚‛′]/g;
const DOUBLE_QUOTES = /[“”„‟″]/g;

/** The list above, in order. Order matters: words are rejoined before whitespace collapses. */
function normalise(text: string): string {
  return text
    .normalize("NFKC")
    .replace(SOFT_HYPHEN, "")
    .replace(BROKEN_WORD, "")
    .replace(DASHES, "-")
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * True only when `quote` appears in `documentText` word for word, allowing the
 * normalisations listed above and nothing else.
 *
 * @param documentText The document as `pdftotext -layout` rendered it. Never text a
 *   model produced: that would make the check circular.
 * @param quote The `source_quote` a model returned with a claim.
 */
export function verifyQuote(documentText: string, quote: string): boolean {
  // An empty or blank quote is in every document, so it must never verify: a model
  // that returns nothing would otherwise get a verified claim for free.
  if (quote.trim() === "") return false;
  return normalise(documentText).includes(normalise(quote));
}

/**
 * True when `text` appears in `quote` as whole words, under the same normalisation
 * as `verifyQuote`. Whole words, so "Bedroom 1" is not found inside "Bedroom 12".
 */
export function lineMentions(quote: string, text: string): boolean {
  const needle = normalise(text);
  if (needle === "") return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(normalise(quote));
}
