/**
 * Shapes the UI needs that are NOT in `@siteproof/contract` yet.
 *
 * Every type here is a PROPOSAL for Furqaan, not a local addition to the contract.
 * When the contract settles one, it is deleted here and imported from the contract.
 * The report, gap request, query letter and project creation shapes were settled on
 * 28 October and now come from the contract.
 */
import type { DocumentKind } from "@siteproof/contract";

/** The form fields sent with a document to `POST /documents`, beside the file itself. */
export interface NewDocument {
  project_id: string;
  flat_id: string | null;
  kind: DocumentKind;
}
