import { expect, test } from "bun:test";
import { linkFor, verifyLink } from "./links";

const SECRET = "a".repeat(64);

test("a builder link names its project, and verifies at the version it was made for", async () => {
  const token = linkFor("builder", "prj_1", 1, SECRET);

  expect(await verifyLink("builder", token, async () => 1, SECRET)).toBe("prj_1");
});

test("a replaced link stops working: its version has moved on", async () => {
  const old = linkFor("builder", "prj_1", 1, SECRET);

  expect(await verifyLink("builder", old, async () => 2, SECRET)).toBeNull();
});

test("a report link is never accepted as a builder link, for the same id", async () => {
  const report = linkFor("report", "flat_1", 1, SECRET);

  expect(await verifyLink("builder", report, async () => 1, SECRET)).toBeNull();
});

test("a link with its signature changed is refused", async () => {
  const token = linkFor("builder", "prj_1", 1, SECRET);
  const forged = token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA");

  expect(await verifyLink("builder", forged, async () => 1, SECRET)).toBeNull();
});

test("a link signed for one project does not open another", async () => {
  const [, sig] = linkFor("builder", "prj_1", 1, SECRET).split(".");

  expect(await verifyLink("builder", `prj_2.${sig}`, async () => 1, SECRET)).toBeNull();
});

test("something that isn't a link is refused without looking anything up", async () => {
  let lookups = 0;
  const versionOf = async () => {
    lookups++;
    return 1;
  };

  for (const junk of ["", "no-dot-here", ".sig", "prj_1.", "a.b.c", "x".repeat(5000)]) {
    expect(await verifyLink("builder", junk, versionOf, SECRET)).toBeNull();
  }
  expect(lookups).toBe(0);
});

test("a link to an id that doesn't exist is refused", async () => {
  const token = linkFor("builder", "prj_gone", 1, SECRET);

  expect(await verifyLink("builder", token, async () => null, SECRET)).toBeNull();
});
