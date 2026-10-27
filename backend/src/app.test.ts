import { beforeEach, expect, test } from "bun:test";
import { app } from "./app";

beforeEach(() => {
  process.env.WEB_ORIGINS = "http://localhost:3000,https://siteproof-alpha.vercel.app";
});

function fromOrigin(origin: string) {
  return app.request("/health", { headers: { Origin: origin } });
}

test("the deployed frontend may call the API from the browser", async () => {
  const res = await fromOrigin("https://siteproof-alpha.vercel.app");

  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://siteproof-alpha.vercel.app");
});

test("any other site is refused by default", async () => {
  const res = await fromOrigin("https://example.com");

  expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
});

test("with no origins configured, every site is refused", async () => {
  delete process.env.WEB_ORIGINS;

  const res = await fromOrigin("http://localhost:3000");

  expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
});
