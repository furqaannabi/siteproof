import { expect, test } from "bun:test";
import { readTicket, signTicket, type TicketBody } from "./upload-ticket";

const SECRET = "test-secret-not-a-real-one";
const NOW = Date.UTC(2026, 9, 27, 10, 0);
const BODY: TicketBody = {
  project_id: "prj_1",
  object_key: "siteproof/clips/0123456789abcdef0123456789abcdef.mp4",
  content_type: "video/mp4",
  expires_at: NOW + 60 * 60 * 1000,
};

test("a ticket reads back exactly as it was signed", () => {
  expect(readTicket(signTicket(BODY, SECRET), SECRET, NOW)).toEqual({ ok: true, body: BODY });
});

test("a ticket altered to name another project is refused", () => {
  const ticket = signTicket(BODY, SECRET);
  const [payload, signature] = ticket.split(".");
  const forged = Buffer.from(JSON.stringify({ ...BODY, project_id: "prj_someone_else" })).toString("base64url");
  expect(payload).not.toBe(forged);

  expect(readTicket(`${forged}.${signature}`, SECRET, NOW)).toEqual({ ok: false, reason: "invalid" });
});

test("a ticket signed with another secret is refused", () => {
  expect(readTicket(signTicket(BODY, "some-other-secret"), SECRET, NOW)).toEqual({ ok: false, reason: "invalid" });
});

test("a ticket past its time is refused as expired", () => {
  const ticket = signTicket(BODY, SECRET);

  expect(readTicket(ticket, SECRET, BODY.expires_at + 1)).toEqual({ ok: false, reason: "expired" });
});

test("anything that is not a ticket is refused, never a crash", () => {
  for (const junk of ["", "no-dot-at-all", "a.b.c", ".", "%%%.%%%", `${Buffer.from("not json").toString("base64url")}.abc`]) {
    expect([junk, readTicket(junk, SECRET, NOW)]).toEqual([junk, { ok: false, reason: "invalid" }]);
  }
});
