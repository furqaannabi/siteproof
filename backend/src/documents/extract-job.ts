/**
 * The `extract_document` job: read an uploaded PDF and save its claims.
 *
 * Everything built for the document side runs here in order: pdftotext and page
 * images, the prompt, Muse Spark, the parser and the quote check.
 *
 * See docs/decisions/2026-10-27-how-the-extract-document-job-fails-retries-and-saves.md
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { ClipStatus } from "@siteproof/contract";
import { buildExtractionRequest, type ExtractionRequest } from "./extraction";
import { MuseSparkError, type MuseSparkAnswer } from "./muse-spark";
import { ExtractionError, parseExtraction, type ParsedClaim } from "./parse-extraction";
import { DocumentError, readDocumentText, renderPageImages } from "./read-pdf";

export interface ExtractDocumentRecord {
  id: string;
  project_id: string;
  flat_id: string | null;
  status: ClipStatus;
  object_key: string;
}

/** A room of the project, with its flat, for choosing what the model is offered. */
export interface RoomRow {
  id: string;
  name: string;
  flat_id: string;
  flat_name: string;
}

export interface ExtractStore {
  load(documentId: string): Promise<ExtractDocumentRecord | null>;
  projectRooms(projectId: string): Promise<RoomRow[]>;
  markProcessing(documentId: string): Promise<void>;
  /** In one transaction: delete the document's claims, insert these, mark it done. */
  saveClaims(documentId: string, claims: ParsedClaim[]): Promise<void>;
  markFailed(documentId: string, reason: string): Promise<void>;
}

export interface ExtractDeps {
  store: ExtractStore;
  files: { get(key: string): Promise<Uint8Array> };
  ask(request: ExtractionRequest): Promise<MuseSparkAnswer>;
}

const Payload = z.object({ document_id: z.string().min(1) });

export type JobErrorCode =
  | "storage_unavailable"
  | "reader_unavailable"
  | "unusable_answer"
  | "no_claims"
  | "reader_rejected"
  | "unreadable_pdf"
  | "bad_payload";

/**
 * A job could not finish. `retry` says whether another attempt could come out
 * differently; the runner retries only then, and while attempts remain. The code
 * is all that is kept: never a message that could carry a URL or document text.
 */
export class JobError extends Error {
  constructor(
    readonly code: JobErrorCode,
    readonly retry: boolean,
  ) {
    super(code);
    this.name = "JobError";
  }
}

/** What the builder reads when the runner gives up, by the code it gave up on. */
const UNAVAILABLE = "We couldn't reach the document reader. Upload it again in a few minutes.";
const REASONS: Partial<Record<string, string>> = {
  storage_unavailable: UNAVAILABLE,
  reader_unavailable: UNAVAILABLE,
  unusable_answer: "We couldn't read this document's lines reliably. Upload it again, or send a clearer PDF.",
  no_claims: "We read this document but found no quantities in it. Check it's the right file.",
  reader_rejected: "This PDF could not be read. Upload it again.",
  unreadable_pdf: "This PDF could not be read. Upload it again.",
};

/** Muse Spark's failures, by whether another attempt could come out differently. */
function fromMuseSpark(e: unknown): JobError {
  if (e instanceof MuseSparkError) {
    if (e.code === "request_failed") {
      // A 4xx other than a rate limit is our request being refused, which a resend
      // will not change. Everything else here is the service, which may recover.
      const refused = e.status !== undefined && e.status >= 400 && e.status < 500 && e.status !== 429;
      return refused ? new JobError("reader_rejected", false) : new JobError("reader_unavailable", true);
    }
    if (e.code === "bad_image") return new JobError("reader_rejected", false);
    // Cut off, refused or empty: the model answers differently each time.
    return new JobError("unusable_answer", true);
  }
  // A network failure before any answer.
  return new JobError("reader_unavailable", true);
}

/**
 * The rooms the model may name: names it can copy, and the ids they stand for.
 *
 * A document for one flat is offered that flat's rooms. A whole-project document
 * across several flats is offered names qualified by flat ("302 / Bedroom 2"),
 * because every flat has a Bedroom 2 and the parser leaves an ambiguous name
 * unplaced. Qualified names are unique, so the parser needs no change; a line that
 * names no flat simply stays unplaced.
 */
export function roomChoices(document: ExtractDocumentRecord, rooms: RoomRow[]): { id: string; name: string }[] {
  if (document.flat_id !== null) {
    return rooms.filter((r) => r.flat_id === document.flat_id).map((r) => ({ id: r.id, name: r.name }));
  }
  const severalFlats = new Set(rooms.map((r) => r.flat_id)).size > 1;
  return rooms.map((r) => ({ id: r.id, name: severalFlats ? `${r.flat_name} / ${r.name}` : r.name }));
}

export function extractDocumentJob({ store, files, ask }: ExtractDeps) {
  return {
    kind: "extract_document" as const,

    /**
     * Throws a JobError naming what failed and whether to retry. Anything else it
     * throws (the database, say) the runner treats as retryable.
     */
    async run(payload: unknown): Promise<void> {
      const parsed = Payload.safeParse(payload);
      if (!parsed.success) throw new JobError("bad_payload", false);
      const document = await store.load(parsed.data.document_id);
      // Already finished, or gone: a job delivered twice does nothing and costs nothing.
      if (!document || document.status === "done" || document.status === "failed") return;

      await store.markProcessing(document.id);
      const bytes = await files.get(document.object_key).catch(() => {
        throw new JobError("storage_unavailable", true);
      });

      const dir = await mkdtemp(join(tmpdir(), "siteproof-extract-"));
      try {
        const pdf = join(dir, "document.pdf");
        await Bun.write(pdf, bytes);
        // It passed this check at upload, so failing it now is ours to fix, not a retry's.
        const { text } = await readDocumentText(pdf).catch((e) => {
          throw e instanceof DocumentError ? new JobError("unreadable_pdf", false) : e;
        });
        const pageImages = await renderPageImages(pdf, join(dir, "pages"));

        const rooms = roomChoices(document, await store.projectRooms(document.project_id));
        const request = buildExtractionRequest({ documentText: text, pageImages, roomNames: rooms.map((r) => r.name) });
        const answer = await ask(request).catch((e) => {
          throw fromMuseSpark(e);
        });

        let parsedAnswer;
        try {
          parsedAnswer = parseExtraction(answer.text, { documentText: text, rooms });
        } catch (e) {
          throw e instanceof ExtractionError ? new JobError("unusable_answer", true) : e;
        }
        const { claims, rejected } = parsedAnswer;
        // Ids, counts and reasons only: never a quote, which is document text.
        console.log(`extract_document ${document.id}: ${claims.length} claim(s), ${rejected.length} rejected [${rejected.map((r) => `${r.index}:${r.reason}`).join(" ")}]`);

        // "Done, with nothing in it" would vanish from the report unquestioned.
        if (claims.length === 0) throw new JobError("no_claims", true);

        await store.saveClaims(document.id, claims);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },

    /** Called by the runner when it will try no more: the document fails, with a reason. */
    async giveUp(payload: unknown, code: string): Promise<void> {
      const parsed = Payload.safeParse(payload);
      if (!parsed.success) return;
      const document = await store.load(parsed.data.document_id);
      // Never overturn a document that finished.
      if (!document || document.status === "done" || document.status === "failed") return;
      await store.markFailed(document.id, REASONS[code] ?? UNAVAILABLE);
    },
  };
}
