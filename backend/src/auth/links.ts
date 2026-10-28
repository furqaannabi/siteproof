/**
 * Secret links: a builder link per project, a report link per flat.
 *
 * A link is `<id>.<signature>`, the signature an HMAC of the kind, the id and a
 * version under LINK_SECRET. Nothing secret is stored: the database keeps only the
 * version, so a builder's page can show a link again at any time, and replacing a
 * link is bumping its version. See docs/decisions/2026-10-28-builder-access-by-secret-links-accepted.md.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type LinkKind = "builder" | "report";

const signature = (kind: LinkKind, id: string, version: number, secret: string) =>
  createHmac("sha256", secret).update(`${kind}:${id}:${version}`).digest("base64url");

export function linkFor(kind: LinkKind, id: string, version: number, secret: string): string {
  return `${id}.${signature(kind, id, version, secret)}`;
}

// An id is a UUID and a signature is 43 base64url characters: anything far longer
// is not a link, and is refused before it costs a lookup.
const MAX_LENGTH = 200;

/**
 * The id a link names, or null if it is not a valid link of this kind at the id's
 * current version. `versionOf` returns null for an id that does not exist.
 */
export async function verifyLink(
  kind: LinkKind,
  token: string,
  versionOf: (id: string) => Promise<number | null>,
  secret: string,
): Promise<string | null> {
  if (token.length > MAX_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [id, given] = parts as [string, string];

  const version = await versionOf(id);
  if (version === null) return null;

  // Compared in constant time, so a guesser learns nothing from how long a refusal takes.
  const expected = Buffer.from(signature(kind, id, version, secret));
  const actual = Buffer.from(given);
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? id : null;
}
