/**
 * The ticket a phone carries between asking for an upload link and completing it:
 * "project X may register the file at this key until this time", signed by the
 * server so it cannot be forged or altered, and so no table has to remember it.
 *
 * See docs/decisions/2026-10-27-clips-upload-in-two-steps-with-a-signed-ticket.md
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export interface TicketBody {
  project_id: string;
  object_key: string;
  content_type: string;
  /** Milliseconds since the epoch. */
  expires_at: number;
}

const Body = z.object({
  project_id: z.string().min(1),
  object_key: z.string().min(1),
  content_type: z.string().min(1),
  expires_at: z.number().int(),
});

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest();

/** `<payload>.<signature>`, both base64url: safe in JSON and in a URL. */
export function signTicket(body: TicketBody, secret: string): string {
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${payload}.${sign(payload, secret).toString("base64url")}`;
}

/**
 * The ticket's body if the server signed it and its time has not passed. The
 * signature is checked before anything in the payload is trusted, and compared in
 * constant time so its bytes cannot be guessed one by one.
 */
export function readTicket(
  ticket: string,
  secret: string,
  now: number,
): { ok: true; body: TicketBody } | { ok: false; reason: "invalid" | "expired" } {
  const parts = ticket.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "invalid" };
  const [payload, signature] = parts as [string, string];

  const expected = sign(payload, secret);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "invalid" };

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  const body = Body.safeParse(decoded);
  if (!body.success) return { ok: false, reason: "invalid" };
  if (now > body.data.expires_at) return { ok: false, reason: "expired" };
  return { ok: true, body: body.data };
}
