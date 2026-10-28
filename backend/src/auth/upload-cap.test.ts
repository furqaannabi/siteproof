import { expect, test } from "bun:test";
import { Hono } from "hono";
import { DAILY_CLIP_CAP, requireUploadAllowance } from "./upload-cap";

const NOW = new Date("2026-10-28T10:00:00Z");

function app(clipsToday: number, alreadyRegistered = false) {
  const asked: { projectId: string; since: Date }[] = [];
  const a = new Hono();
  const allowance = requireUploadAllowance({
    clipsSince: async (projectId, since) => {
      asked.push({ projectId, since });
      return clipsToday;
    },
    now: () => NOW,
  });
  a.post(
    "/clips",
    allowance({ projectOf: async () => "prj_1", alreadyRegistered: async () => alreadyRegistered }),
    (c) => c.json({ ok: true }),
  );
  return { a, asked };
}

const post = (a: Hono) => a.request("/clips", { method: "POST" });

test("under the cap, a clip goes through; the count is of the last 24 hours", async () => {
  const { a, asked } = app(DAILY_CLIP_CAP - 1);

  expect((await post(a)).status).toBe(200);
  expect(asked).toEqual([{ projectId: "prj_1", since: new Date("2026-10-27T10:00:00Z") }]);
});

test("at the cap, the next clip is refused, saying when to try again", async () => {
  const { a } = app(DAILY_CLIP_CAP);

  const res = await post(a);

  expect(res.status).toBe(429);
  expect(await res.json()).toEqual({
    error: "daily_limit",
    message: `This project has had ${DAILY_CLIP_CAP} clips in the last 24 hours, the most allowed. Send the next one tomorrow.`,
  });
});

test("at the cap, completing a clip that is already registered still answers: it costs nothing new", async () => {
  const { a } = app(DAILY_CLIP_CAP, true);

  expect((await post(a)).status).toBe(200);
});
