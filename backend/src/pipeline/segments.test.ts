import { expect, test } from "bun:test";
import { segmentsFromTags } from "./segments";

test("a clip in which no room tag is seen is one unplaced segment", () => {
  expect(segmentsFromTags([], 30)).toEqual([{ qr_code: null, t_start: 0, t_end: 30 }]);
});

test("before the first tag is unplaced; from the tag on is that room, however often the tag is seen again", () => {
  const sightings = [
    { t: 4, qr_code: "SPKTCHN001" },
    { t: 4.5, qr_code: "SPKTCHN001" },
    { t: 9, qr_code: "SPKTCHN001" },
  ];

  expect(segmentsFromTags(sightings, 30)).toEqual([
    { qr_code: null, t_start: 0, t_end: 4 },
    { qr_code: "SPKTCHN001", t_start: 4, t_end: 30 },
  ]);
});

test("walking into the next room's tag starts that room; a window maker's QR sticker is ignored", () => {
  const sightings = [
    { t: 0, qr_code: "SPKTCHN001" },
    { t: 6, qr_code: "https://upvc-maker.example/warranty/4471" },
    { t: 12, qr_code: "SPBDRM0002" },
    { t: 14, qr_code: "SP12345" },
  ];

  expect(segmentsFromTags(sightings, 20)).toEqual([
    { qr_code: "SPKTCHN001", t_start: 0, t_end: 12 },
    { qr_code: "SPBDRM0002", t_start: 12, t_end: 20 },
  ]);
});
