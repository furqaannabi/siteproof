/**
 * Turns Muse Spark's answer into claims.
 *
 * Nothing here trusts the model. The response is parsed against a strict schema and
 * every quote is checked against the document, so the two ways a model can be wrong
 * are handled separately and neither one disappears:
 *
 *   - **Unreadable.** An entry that does not fit the schema is not a claim at all.
 *     It is returned in `rejected` with its position, never dropped, because a
 *     report that says it read the whole BOQ must not have quietly binned a line.
 *   - **Readable but unfaithful.** An entry that fits the schema but whose quote is
 *     not in the document stays a claim, with `quote_verified: false`. The contract
 *     has a field for exactly that, and the report shows it as unverified.
 *
 * A response that cannot be read at all throws rather than returning nothing: a
 * document with no claims and a document the model could not read look identical
 * from the outside, and only one of them should let the pipeline carry on.
 *
 * Note for the caller: an empty `claims` list from a document with text in it is
 * suspicious, and whether that fails the document is the job handler's call, not
 * this function's.
 */
import { z } from "zod";
import type { Claim } from "@siteproof/contract";
import { COUNTABLE } from "./extraction";
import { verifyQuote } from "./quote-check";

/** The response was not usable as a whole. */
export class ExtractionError extends Error {
  constructor(
    readonly code: "not_json" | "wrong_shape",
    message: string,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

export type RejectReason = "unknown_item" | "no_quantity" | "no_unit" | "missing_quote" | "bad_shape";

/** Where and why one entry could not be read. Carries no document text: it gets logged. */
export interface RejectedLine {
  index: number;
  reason: RejectReason;
}

const lineSchema = z.object({
  // The closed vocabulary, or the model saying it cannot count this line. Never
  // anything else: a value outside this list is rejected, never mapped to a near match.
  item: z.enum([...COUNTABLE, "not_countable"] as const),
  // A real number, never a string. "8" is the model paraphrasing, and coercing it
  // would mean accepting "8 nos" and "about 8" next.
  qty: z.number().int().nonnegative(),
  unit: z.string().min(1),
  room: z.string().min(1).nullable(),
  source_quote: z.string().min(1),
});

/** Only the outer shape. Each entry is parsed on its own so one bad line keeps the rest. */
const envelopeSchema = z.object({ claims: z.array(z.unknown()) });

/**
 * A claim exactly as the contract defines it, before it is stored: the database
 * assigns `id` and the job that read the document supplies `doc_id`. `room_id` is
 * null where the line named no room we know, so the claim is unplaced rather than
 * wrong, and `quote_verified` is set here by checking the document, never by the model.
 */
export type ParsedClaim = Omit<Claim, "id" | "doc_id">;

export interface ParseContext {
  /** The document as `pdftotext -layout` rendered it. Never text a model produced. */
  documentText: string;
  rooms: readonly { id: string; name: string }[];
}

export interface ParsedExtraction {
  claims: ParsedClaim[];
  rejected: RejectedLine[];
}

/**
 * The room id for a name the model copied out of the document, or null.
 *
 * Matching ignores case and surrounding space, because the model recasing a name is
 * not the builder meaning a different room. Two rooms sharing a name resolve to
 * null: picking the first would attach a count, and later evidence frames, to the
 * wrong room, and nothing downstream could tell.
 */
function resolveRoom(name: string | null, rooms: readonly { id: string; name: string }[]): string | null {
  if (name === null) return null;
  const wanted = name.trim().toLowerCase();
  const matches = rooms.filter((r) => r.name.trim().toLowerCase() === wanted);
  return matches.length === 1 ? matches[0]!.id : null;
}

function reasonFor(issues: readonly z.core.$ZodIssue[]): RejectReason {
  switch (issues[0]?.path[0]) {
    case "item":
      return "unknown_item";
    case "qty":
      return "no_quantity";
    // Named on its own: lost in bad_shape, a missing unit looked like garbled output
    // and hid that "Windows complete: 12" was being thrown away.
    case "unit":
      return "no_unit";
    case "source_quote":
      return "missing_quote";
    default:
      return "bad_shape";
  }
}

export function parseExtraction(raw: string, { documentText, rooms }: ParseContext): ParsedExtraction {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new ExtractionError("not_json", "The model's answer was not JSON");
  }

  const envelope = envelopeSchema.safeParse(body);
  if (!envelope.success) {
    throw new ExtractionError("wrong_shape", "The model's answer had no list of claims");
  }

  const claims: ParsedClaim[] = [];
  const rejected: RejectedLine[] = [];

  envelope.data.claims.forEach((entry, index) => {
    const line = lineSchema.safeParse(entry);
    if (!line.success) {
      rejected.push({ index, reason: reasonFor(line.error.issues) });
      return;
    }

    claims.push({
      item: line.data.item,
      qty: line.data.qty,
      unit: line.data.unit,
      room_id: resolveRoom(line.data.room, rooms),
      source_quote: line.data.source_quote,
      quote_verified: verifyQuote(documentText, line.data.source_quote),
    });
  });

  return { claims, rejected };
}
