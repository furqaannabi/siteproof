/**
 * Mock report for the demo story: Flat 302, the sample demand letter and BOQ in
 * `backend/fixtures/documents/`. The UI is built against this until
 * `GET /projects/:id/report` is real (29 October).
 *
 * Every shape from `@siteproof/contract` is used as is. The report envelope, gap
 * requests and query letters are proposals in `lib/types.ts`.
 *
 * Frames and masks are drawn placeholders in `public/mock/`, never site footage.
 */
import type { Claim, Clip, Detection, ItemKind, Result, Room, Segment } from "@siteproof/contract";
import type { Report } from "@/lib/types";

const PROJECT = "p-northfield";
const FLAT = "f-302";
const DL = "d-dl-06";
const BOQ = "d-boq";

const rooms: Room[] = [
  { id: "r-living", flat: FLAT, name: "Living Room", qr_code: "SP4Q7K2M9X" },
  { id: "r-kitchen", flat: FLAT, name: "Kitchen", qr_code: "SP8H3T6V1R" },
  { id: "r-bed1", flat: FLAT, name: "Bedroom 1", qr_code: "SP2N5W8C4J" },
  { id: "r-bed2", flat: FLAT, name: "Bedroom 2", qr_code: "SP9D1F7G3B" },
  { id: "r-bed3", flat: FLAT, name: "Bedroom 3", qr_code: "SP6M4Z2P8E" },
];

const clips: Clip[] = [
  { id: "c-0409", project_id: PROJECT, url: "", captured_at: "2026-10-26T10:12:00+05:30", status: "done" },
  { id: "c-0410", project_id: PROJECT, url: "", captured_at: "2026-10-26T10:14:00+05:30", status: "done" },
  { id: "c-0411", project_id: PROJECT, url: "", captured_at: null, status: "done" },
  { id: "c-0412", project_id: PROJECT, url: "", captured_at: "2026-10-26T10:19:00+05:30", status: "done" },
];

const segments: Segment[] = [
  { clip_id: "c-0409", room_id: "r-living", t_start: 6, t_end: 31, full_sweep: true },
  { clip_id: "c-0409", room_id: null, t_start: 31, t_end: 38, full_sweep: false },
  { clip_id: "c-0410", room_id: "r-bed1", t_start: 3, t_end: 19, full_sweep: true },
  { clip_id: "c-0411", room_id: "r-bed3", t_start: 2, t_end: 17, full_sweep: true },
  // The kitchen: a partial pan that never started at its tag.
  { clip_id: "c-0411", room_id: "r-kitchen", t_start: 18, t_end: 22, full_sweep: false },
  { clip_id: "c-0412", room_id: "r-bed2", t_start: 0, t_end: 27, full_sweep: true },
];

const roomKey: Record<string, string> = {
  "r-living": "living",
  "r-kitchen": "kitchen",
  "r-bed1": "bed1",
  "r-bed2": "bed2",
  "r-bed3": "bed3",
};

const clipOf: Record<string, string> = {
  "r-living": "c-0409",
  "r-bed1": "c-0410",
  "r-bed3": "c-0411",
  "r-bed2": "c-0412",
};

export function detections(roomId: string, item: ItemKind, n: number, clipId = clipOf[roomId]): Detection[] {
  const key = roomKey[roomId];
  return Array.from({ length: n }, (_, i) => ({
    clip_id: clipId,
    room_id: roomId,
    item,
    track_id: `${key}-${item}-t${i + 1}`,
    best_frame_url: `/mock/frame-${key}.svg`,
    mask_url: `/mock/mask-${key}-${item}-${i + 1}.svg`,
  }));
}

/** Per room: windows planned and counted, doors planned and counted. null counted = no covered clip. */
const plan: { room: string; boqWindow: string; boqDoor: string; windows: [number, number | null]; doors: [number, number | null] }[] = [
  {
    room: "r-living",
    boqWindow: "W-1 UPVC openable window, 1200 x 1500 mm Living Room nos 3",
    boqDoor: "D-1 Main entrance door, teak veneer flush shutter, 1000 x 2100 mm, with frame, hinges and mortise lock Living Room nos 1",
    windows: [3, 3],
    doors: [1, 1],
  },
  {
    room: "r-kitchen",
    boqWindow: "W-2 UPVC openable window, 900 x 1200 mm Kitchen nos 1",
    boqDoor: "D-5 Flush door, 800 x 2100 mm, with frame and hardware Kitchen nos 1",
    windows: [1, null],
    doors: [1, null],
  },
  {
    room: "r-bed1",
    boqWindow: "W-3 UPVC openable window, 1200 x 1500 mm Bedroom 1 nos 2",
    boqDoor: "D-2 Flush door, 900 x 2100 mm, with frame and hardware Bedroom 1 nos 1",
    windows: [2, 2],
    doors: [1, 1],
  },
  {
    room: "r-bed2",
    boqWindow: "W-4 UPVC openable window, 1200 x 1500 mm Bedroom 2 nos 4",
    boqDoor: "D-3 Flush door, 900 x 2100 mm, with frame and hardware Bedroom 2 nos 1",
    windows: [4, 2],
    doors: [1, 1],
  },
  {
    room: "r-bed3",
    boqWindow: "W-5 UPVC openable window, 1200 x 1500 mm Bedroom 3 nos 2",
    boqDoor: "D-4 Flush door, 900 x 2100 mm, with frame and hardware Bedroom 3 nos 1",
    windows: [2, 2],
    doors: [1, 1],
  },
];

const claims: Claim[] = [
  // The demand letter states flat-level totals, with no unit.
  { id: "cl-dl-windows", doc_id: DL, item: "window", qty: 12, unit: null, room_id: null, source_quote: "Windows complete: 12", quote_verified: true },
  { id: "cl-dl-doors", doc_id: DL, item: "door", qty: 5, unit: null, room_id: null, source_quote: "Doors complete: 5", quote_verified: true },
  // Not countable in v1. The letter gives no quantity, and the UI never shows one for
  // this kind of claim. Open with William: how extraction treats a line with no number.
  { id: "cl-dl-plaster", doc_id: DL, item: "not_countable", qty: 0, unit: null, room_id: null, source_quote: "Internal plaster complete in all rooms", quote_verified: true },
];

const results: Result[] = [];
const allDetections: Detection[] = [];

for (const p of plan) {
  for (const item of ["window", "door"] as const) {
    const [planned, counted] = item === "window" ? p.windows : p.doors;
    const claimId = `cl-boq-${roomKey[p.room]}-${item}`;
    claims.push({
      id: claimId,
      doc_id: BOQ,
      item,
      qty: planned,
      unit: "nos",
      room_id: p.room,
      source_quote: item === "window" ? p.boqWindow : p.boqDoor,
      quote_verified: true,
    });
    if (counted === null) {
      results.push({ claim_id: claimId, counted: 0, outcome: "not_seen", room_covered: false, evidence: [] });
      continue;
    }
    const found = detections(p.room, item, counted);
    allDetections.push(...found);
    results.push({
      claim_id: claimId,
      counted,
      outcome: counted >= planned ? "verified" : "short",
      room_covered: true,
      evidence: [...new Set(found.map((d) => d.best_frame_url))],
    });
  }
}

export const flat302: Report = {
  project: {
    id: PROJECT,
    name: "Northfield Residency, Tower B",
    builder: "Northfield Constructions Pvt. Ltd.",
    flats: [{ id: FLAT, name: "302" }],
  },
  flat: { id: FLAT, name: "302" },
  stage: "Stage 6",
  rooms,
  documents: [
    { id: DL, project_id: PROJECT, flat_id: FLAT, kind: "demand_letter", status: "done", reason: null },
    { id: BOQ, project_id: PROJECT, flat_id: null, kind: "boq", status: "done", reason: null },
  ],
  clips,
  segments,
  claims,
  results,
  detections: allDetections,
  gap_requests: [
    {
      room_id: "r-kitchen",
      text: "Need 5 s of Flat 302 kitchen, east wall",
      steps: [
        "Start with the kitchen's room tag in view, at the door.",
        "Turn slowly toward the east wall window.",
        "Stop there. Don't pan back.",
      ],
      status: "open",
    },
  ],
  query_letters: [
    {
      claim_id: "cl-boq-bed2-window",
      body:
        "Re: your demand letter for Stage 6, \"Windows complete: 12\". The bill of quantities lists 4 windows in Bedroom 2 (item W-4). " +
        "A one-way sweep from the Bedroom 2 room tag, filmed on 26 October, shows 2 installed. " +
        "Could you confirm the status of the remaining 2, or share footage of them? We'll update the report as soon as they're visible.",
      citations_rechecked: true,
      citation_count: 3,
    },
  ],
};
