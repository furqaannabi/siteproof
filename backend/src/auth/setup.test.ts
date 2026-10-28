import { expect, test } from "bun:test";
import { Hono } from "hono";
import { requireSetupKey } from "./setup";

function app(key: string | undefined) {
  const a = new Hono();
  a.post("/projects", requireSetupKey(() => key), (c) => c.json({ created: true }, 201));
  return a;
}

const post = (key: string | undefined, sent?: string) =>
  app(key).request("/projects", { method: "POST", headers: sent ? { Authorization: `Bearer ${sent}` } : {} });

test("the team's setup key may create a project", async () => {
  expect((await post("k".repeat(64), "k".repeat(64))).status).toBe(201);
});

test("any other key, or none, may not", async () => {
  expect((await post("k".repeat(64), "x".repeat(64))).status).toBe(401);
  expect((await post("k".repeat(64))).status).toBe(401);
});

test("with no setup key on the server, nobody may: deny by default", async () => {
  expect((await post(undefined, "")).status).toBe(401);
  expect((await post("", "")).status).toBe(401);
});
