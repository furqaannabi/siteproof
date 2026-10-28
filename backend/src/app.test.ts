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

test("creating a project without the team's setup key is refused", async () => {
  const res = await app.request("/projects", { method: "POST", body: "{}" });

  expect(res.status).toBe(401);
});

test("every builder route refuses a request with no builder link", async () => {
  const json = { "Content-Type": "application/json" };
  const calls = [
    app.request("/clips", { method: "POST", headers: json, body: JSON.stringify({ project_id: "p" }) }),
    app.request("/clips/complete", { method: "POST", headers: json, body: JSON.stringify({ ticket: "t" }) }),
    app.request("/clips/c1/status"),
    app.request("/documents", { method: "POST", body: new FormData() }),
    app.request("/documents/d1/status"),
  ];

  expect((await Promise.all(calls)).map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);
});

test("the overview and a flat's report need a builder link, and a buyer's report a report link", async () => {
  const calls = [app.request("/projects/p1"), app.request("/flats/f1/report"), app.request("/report")];

  expect((await Promise.all(calls)).map((r) => r.status)).toEqual([401, 401, 401]);
});
