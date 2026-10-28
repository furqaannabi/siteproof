"use client";

import type { Clip, DocumentKind, ItemKind, Outcome, ProjectLinks, ProjectOverview, Report, Room, Segment } from "@siteproof/contract";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { EvidenceFrame } from "@/components/evidence-frame";
import { AppHeader, captureTime, CopyButton, ErrorPanel, Loading, ProjectNav, StaleNotice, StatusBadge, ui, useFlatReport, useOverview } from "@/components/ui";
import { builderLink, reportLink } from "@/lib/access";
import { data } from "@/lib/data";
import { autoLayout, type Rect } from "@/lib/room-layout";
import {
  allRows,
  coverage,
  ITEM_PLURAL,
  ITEMS,
  NextStep,
  nextSteps,
  type RoomRow,
  seconds,
  SendGapRequest,
  STAMP,
  type Step,
  WriteGapRequest,
} from "./report/report-view";
import reportStyles from "./report/report.module.css";
import styles from "./project.module.css";

export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  demand_letter: "Demand letter",
  invoice: "Invoice",
  boq: "Bill of quantities",
};

export function ProjectPage({ projectId }: { projectId: string }) {
  const { overview: report, error, stale, reload } = useOverview(projectId);
  const created = useSearchParams().get("created") === "1";

  if (error) {
    return (
      <>
        <AppHeader />
        <main className={ui.main}>
          <ErrorPanel error={error} retry={reload} />
        </main>
      </>
    );
  }
  if (!report) {
    return (
      <>
        <AppHeader />
        <Loading what="Loading the project" />
      </>
    );
  }
  return (
    <>
      <StaleNotice stale={stale} onRetry={reload} />
      <ProjectView overview={report} created={created} />
    </>
  );
}

/** A room's outcome across its items: one Not seen yet item leaves the room Not seen yet, then Short, then Verified. null when nothing billed for it was judged. */
function roomOutcome(rows: RoomRow[]): Outcome | null {
  if (rows.length === 0) return null;
  if (rows.some((r) => r.result.outcome === "not_seen")) return "not_seen";
  if (rows.some((r) => r.result.outcome === "short")) return "short";
  return "verified";
}

/** Prints the room tags, or one of them. The tag sheet reads `data-printing` from the body. */
function printTags(only: string | null, setOnly: (id: string | null) => void) {
  setOnly(only);
  // Let the sheet re-render with only that tag before the print dialog opens.
  requestAnimationFrame(() => {
    document.body.dataset.printing = "tags";
    window.print();
    delete document.body.dataset.printing;
    setOnly(null);
  });
}

function ProjectView({ overview, created }: { overview: ProjectOverview; created: boolean }) {
  const { project } = overview;
  const [flatId, setFlatId] = useState(project.flats[0]?.id ?? null);
  const { report, error: reportError, reload: reloadReport } = useFlatReport(project.id, flatId);
  const [picked, setPicked] = useState<string | null>(null);
  const [item, setItem] = useState<ItemKind>("window");
  const [onlyTag, setOnlyTag] = useState<string | null>(null);

  const flat = project.flats.find((f) => f.id === flatId);
  const rooms = overview.rooms.filter((r) => r.flat === flatId);
  // The report is for the flat on screen; a stale one from the last flat is never mixed in.
  const current = report && report.flat.id === flatId ? report : null;
  const rows = current ? allRows(current) : [];
  const rowsOf = (id: string) => rows.filter((r) => r.room.id === id);
  const outcomeOf = (id: string) => roomOutcome(rowsOf(id));

  const unseenRooms = rooms.filter((r) => outcomeOf(r.id) === "not_seen");
  const shortRows = rows.filter((r) => r.result.outcome === "short");
  const fallback = unseenRooms[0]?.id ?? shortRows[0]?.room.id ?? rooms[0]?.id;
  const selectedId = picked && rooms.some((r) => r.id === picked) ? picked : fallback;
  const selected = rooms.find((r) => r.id === selectedId);

  const hasLetter = overview.documents.some((d) => d.kind === "demand_letter" && d.status !== "failed");
  const hasBoq = overview.documents.some((d) => d.kind === "boq" && d.status !== "failed");
  const hasClips = overview.clips.some((c) => c.status !== "failed");
  const upload = `/projects/${project.id}/upload`;

  const steps: Step[] = [];
  const bandLink = (href: string, text: string) => (
    <Link className={reportStyles.bandBtn} href={href}>
      {text}
    </Link>
  );
  if (!hasClips) steps.push({ key: "tags", label: "Before anyone films", text: "Print the room tags and stick one at each doorway", action: bandLink("#tags", "See the tags") });
  if (!hasLetter || !hasBoq)
    steps.push({ key: "docs", label: "Set up", text: "Upload the demand letter and the bill of quantities", action: bandLink(upload, "Upload") });
  if (!hasClips) steps.push({ key: "clips", label: "Set up", text: "Upload the progress clips you already have", action: bandLink(upload, "Upload") });
  if (steps.length === 0) {
    if (current && rows.length > 0) steps.push(...nextSteps(current, "builder", shortRows, unseenRooms, reloadReport));
    else
      steps.push({
        key: "wait",
        label: "Working",
        text: "Results appear once the demand letter is read and a clip has gone through",
        action: null,
      });
  }

  return (
    <>
      <AppHeader eyebrow={project.builder} title={project.name} band={<NextStep key={flatId ?? ""} steps={steps} />}>
        <ProjectNav projectId={project.id} current="project" />
      </AppHeader>
      <main className={styles.main}>
        {created && (
          <div className={styles.created} role="status">
            <strong>Project created.</strong> Print the room tags below before anyone films.
          </div>
        )}

        <section className={styles.top} aria-labelledby="flat-title">
          <div className={styles.planCol}>
            {project.flats.length > 1 && (
              <div className={styles.flatTabs} role="group" aria-label="Flat">
                {project.flats.map((f) => (
                  <button key={f.id} type="button" aria-pressed={f.id === flatId} onClick={() => (setFlatId(f.id), setPicked(null))}>
                    Flat {f.name}
                  </button>
                ))}
              </div>
            )}
            <h1 id="flat-title" className={styles.flatTitle}>
              Flat {flat?.name}
            </h1>
            <p className={styles.lede}>
              <Summary rooms={rooms} rows={rows} outcomeOf={outcomeOf} loading={!current && !reportError} />
            </p>
            {reportError ? <p className={ui.muted}>The results couldn&apos;t be loaded. The rooms are shown without them.</p> : null}

            <div className={styles.itemSwitch} role="group" aria-label="Show on the plan">
              {ITEMS.map((i) => (
                <button key={i} type="button" aria-pressed={i === item} onClick={() => setItem(i)}>
                  {ITEM_PLURAL[i].charAt(0).toUpperCase() + ITEM_PLURAL[i].slice(1)}
                </button>
              ))}
            </div>
            <FlatPlan rooms={rooms} rows={rows} item={item} outcomeOf={outcomeOf} selectedId={selectedId} onSelect={setPicked} />
            <div className={styles.roomChips} role="group" aria-label="Rooms">
              {rooms.map((r) => {
                const o = outcomeOf(r.id);
                return (
                  <button key={r.id} type="button" aria-pressed={r.id === selectedId} onClick={() => setPicked(r.id)}>
                    <i className={styles.dot} data-outcome={o ?? "none"} aria-hidden="true" />
                    {r.name}
                    <span className={styles.srOnly}>: {o ? STAMP[o] : "nothing judged yet"}</span>
                  </button>
                );
              })}
            </div>
            <p className={styles.planNote}>
              Not to scale. SiteProof knows what&apos;s in each room, not its size or which wall each item is on, so rooms are placed automatically. Outlined
              markers were counted; the frames are the evidence.
            </p>
          </div>

          {selected && (
            <RoomPanel
              key={selected.id}
              projectId={project.id}
              report={current}
              room={selected}
              rows={rowsOf(selected.id)}
              segments={overview.segments.filter((s) => s.room_id === selected.id)}
              flatId={flatId}
              onChange={reloadReport}
              onPrint={() => printTags(selected.id, setOnlyTag)}
            />
          )}
        </section>

        <div className={styles.lower}>
          <Diary
            overview={overview}
            flatId={flatId}
            report={current}
            rooms={rooms}
            outcomeOf={outcomeOf}
            onPick={(id) => {
              setPicked(id);
              const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              document.getElementById("flat-title")?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
            }}
            tagsFirst={!hasClips || created}
            tags={<TagSheet project={project} rooms={overview.rooms} only={onlyTag} onPrint={() => printTags(null, setOnlyTag)} />}
          />
          <aside className={styles.side}>
            <section className={styles.card} aria-labelledby="add-title">
              <h2 id="add-title" className={styles.cardTitle}>
                Add footage or a document
              </h2>
              <Link href={upload} className={styles.drop}>
                <b>Upload clips or documents</b>
                <span>Forward the progress videos you already share, or a new demand letter</span>
              </Link>
            </section>
            <ShareLinks project={project} />
          </aside>
        </div>
      </main>
    </>
  );
}

/** "4 of 5 rooms judged · 9 of 12 windows and 4 of 5 doors counted with frames." Only judged rooms add to the counts. */
function Summary({ rooms, rows, outcomeOf, loading }: { rooms: Room[]; rows: RoomRow[]; outcomeOf: (id: string) => Outcome | null; loading: boolean }) {
  if (loading) return <>Loading the results…</>;
  if (rows.length === 0) return <>{rooms.length} rooms · nothing judged yet</>;
  const judged = rooms.filter((r) => {
    const o = outcomeOf(r.id);
    return o === "verified" || o === "short";
  }).length;
  const counts = ITEMS.flatMap((item) => {
    const mine = rows.filter((r) => r.claim.item === item);
    if (mine.length === 0) return [];
    const seen = mine.filter((r) => r.result.outcome !== "not_seen").reduce((n, r) => n + Math.min(r.result.counted, r.claim.qty), 0);
    const planned = mine.reduce((n, r) => n + r.claim.qty, 0);
    return [`${seen} of ${planned} ${ITEM_PLURAL[item]}`];
  });
  return (
    <>
      {judged} of {rooms.length} rooms judged · {counts.join(" and ")} counted with frames
    </>
  );
}

/* ---------- The plan ---------- */

const CELL_W = 4;
const CELL_D = 3.4;
const WALL_H = 0.85;
const SCALE = 40;
const COS30 = Math.cos(Math.PI / 6);

/** Isometric: x runs down-right, z runs down-left, h is up. */
function iso(x: number, z: number, h = 0): [number, number] {
  return [(x - z) * COS30 * SCALE, (x + z) * 0.5 * SCALE - h * SCALE];
}
const pts = (p: [number, number][]) => p.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");

/**
 * The flat as an angled plan, each room's floor coloured by its outcome. Markers along
 * each room's back wall stand for what the plan holds for the item on show; counted ones
 * are outlined. No marker ever says "missing here": SiteProof doesn't know where in the
 * room an item is, only how many were counted.
 */
function FlatPlan({
  rooms,
  rows,
  item,
  outcomeOf,
  selectedId,
  onSelect,
}: {
  rooms: Room[];
  rows: RoomRow[];
  item: ItemKind;
  outcomeOf: (id: string) => Outcome | null;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const layout = autoLayout(rooms.length, CELL_W, CELL_D);
  if (layout.length === 0) return null;
  const corners = layout.flatMap((q) => [iso(q.x, q.z, WALL_H), iso(q.x + q.w, q.z), iso(q.x, q.z + q.d), iso(q.x + q.w, q.z + q.d, -0.4)]);
  const pad = 24;
  const minX = Math.min(...corners.map((c) => c[0])) - pad;
  const minY = Math.min(...corners.map((c) => c[1])) - pad;
  const w = Math.max(...corners.map((c) => c[0])) - minX + pad;
  const h = Math.max(...corners.map((c) => c[1])) - minY + pad;
  const all = { x: Math.min(...layout.map((q) => q.x)), z: Math.min(...layout.map((q) => q.z)) };
  const end = { x: Math.max(...layout.map((q) => q.x + q.w)), z: Math.max(...layout.map((q) => q.z + q.d)) };
  const bounds = { x: all.x, z: all.z, w: end.x - all.x, d: end.z - all.z };
  const slab = 0.35;
  const order = layout.map((q, i) => ({ q, room: rooms[i] })).sort((a, b) => a.q.x + a.q.z - (b.q.x + b.q.z));

  return (
    <svg className={styles.plan} viewBox={`${minX} ${minY} ${w} ${h}`} role="group" aria-label="The flat's rooms, coloured by outcome. Not to scale.">
      <defs>
        <pattern id="plan-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" className={styles.hatchBase} />
          <rect width="4" height="10" className={styles.hatchLine} />
        </pattern>
      </defs>
      <polygon className={styles.slabTop} points={pts([iso(all.x - slab, all.z - slab), iso(end.x + slab, all.z - slab), iso(end.x + slab, end.z + slab), iso(all.x - slab, end.z + slab)])} />
      <polygon
        className={styles.slabFront}
        points={pts([iso(all.x - slab, end.z + slab), iso(end.x + slab, end.z + slab), iso(end.x + slab, end.z + slab, -0.4), iso(all.x - slab, end.z + slab, -0.4)])}
      />
      <polygon
        className={styles.slabSide}
        points={pts([iso(end.x + slab, all.z - slab), iso(end.x + slab, end.z + slab), iso(end.x + slab, end.z + slab, -0.4), iso(end.x + slab, all.z - slab, -0.4)])}
      />
      {order.map(({ q, room }, i) => {
        const outcome = outcomeOf(room.id);
        const row = rows.find((r) => r.room.id === room.id && r.claim.item === item);
        const planned = row?.claim.qty ?? 0;
        const counted = row && row.result.outcome !== "not_seen" ? Math.min(row.result.counted, planned) : 0;
        const [tx, ty] = iso(q.x, q.z + q.d / 2, WALL_H * 0.6);
        const name = `${room.name}: ${outcome ? STAMP[outcome] : "nothing judged yet"}${row ? `, ${row.result.outcome === "not_seen" ? "not counted" : counted} of ${planned} ${ITEM_PLURAL[item]}` : ""}`;
        return (
          <g
            key={room.id}
            className={styles.room}
            data-outcome={outcome ?? "none"}
            data-selected={room.id === selectedId}
            style={{ animationDelay: `${i * 70}ms` }}
            role="button"
            tabIndex={0}
            aria-label={name}
            aria-pressed={room.id === selectedId}
            onClick={() => onSelect(room.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(room.id);
              }
            }}
          >
            <polygon className={styles.floor} points={pts([iso(q.x, q.z), iso(q.x + q.w, q.z), iso(q.x + q.w, q.z + q.d), iso(q.x, q.z + q.d)])} />
            <polygon className={styles.wallBack} points={pts([iso(q.x, q.z), iso(q.x + q.w, q.z), iso(q.x + q.w, q.z, WALL_H), iso(q.x, q.z, WALL_H)])} />
            <polygon className={styles.wallLeft} points={pts([iso(q.x, q.z), iso(q.x, q.z + q.d), iso(q.x, q.z + q.d, WALL_H), iso(q.x, q.z, WALL_H)])} />
            {markerSpots(q, planned, bounds).map((m, k) => (
              <polygon key={k} className={styles.marker} data-counted={k < counted} points={pts(m)} />
            ))}
            <rect className={styles.tagMark} x={tx - 6} y={ty - 6} width={12} height={12} rx={1.5} />
          </g>
        );
      })}
      {/* Labels last, so no room drawn in front covers another's name. */}
      {order.map(({ q, room }) => {
        const outcome = outcomeOf(room.id);
        const [cx, cy] = iso(q.x + q.w / 2, q.z + q.d / 2);
        return (
          <g key={room.id} aria-hidden="true">
            {outcome === "not_seen" && <circle className={styles.ping} cx={cx} cy={cy - 30} r={7} />}
            <text className={styles.roomName} x={cx} y={cy}>
              {room.name}
              <tspan className={styles.roomState} data-outcome={outcome ?? "none"} x={cx} dy="1.4em">
                {outcome ? STAMP[outcome] : "Nothing judged yet"}
              </tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * One upright marker per planned item, spaced evenly along the room's outside walls. A
 * marker on a shared wall would look as if it belonged to the room next door; a room with
 * no outside wall uses all four.
 */
function markerSpots(q: Rect, n: number, bounds: Rect): [number, number][][] {
  if (n === 0) return [];
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const inset = 0.3;
  // Each side as a start point and a direction, walked clockwise from the back-left corner.
  const all = [
    { outside: near(q.z, bounds.z), from: [q.x + inset, q.z], dir: [1, 0], len: q.w - 2 * inset },
    { outside: near(q.x + q.w, bounds.x + bounds.w), from: [q.x + q.w, q.z + inset], dir: [0, 1], len: q.d - 2 * inset },
    { outside: near(q.z + q.d, bounds.z + bounds.d), from: [q.x + q.w - inset, q.z + q.d], dir: [-1, 0], len: q.w - 2 * inset },
    { outside: near(q.x, bounds.x), from: [q.x, q.z + q.d - inset], dir: [0, -1], len: q.d - 2 * inset },
  ];
  const sides = all.some((x) => x.outside) ? all.filter((x) => x.outside) : all;
  const total = sides.reduce((t, x) => t + x.len, 0);
  const span = Math.min(0.9, (total / n) * 0.6);
  return Array.from({ length: n }, (_, i) => {
    let t = ((i + 0.5) / n) * total;
    let side = sides[0];
    for (const x of sides) {
      side = x;
      if (t <= x.len) break;
      t -= x.len;
    }
    t = Math.min(Math.max(t, span / 2), side.len - span / 2);
    const at = (d: number): [number, number] => [side.from[0] + side.dir[0] * d, side.from[1] + side.dir[1] * d];
    const [ax, az] = at(t - span / 2);
    const [bx, bz] = at(t + span / 2);
    return [iso(ax, az, 0.22), iso(bx, bz, 0.22), iso(bx, bz, 0.68), iso(ax, az, 0.68)];
  });
}

/* ---------- The room on show ---------- */

function RoomPanel({
  projectId,
  report,
  room,
  rows,
  segments,
  flatId,
  onChange,
  onPrint,
}: {
  projectId: string;
  report: Report | null;
  room: Room;
  rows: RoomRow[];
  segments: Segment[];
  flatId: string | null;
  onChange: () => void;
  onPrint: () => void;
}) {
  const outcome = roomOutcome(rows);
  const cover = coverage(segments);
  const found = report?.detections.filter((d) => d.room_id === room.id) ?? [];
  const frame = found[0]?.best_frame_url;
  const masks = found.filter((d) => d.best_frame_url === frame);
  const gap = report?.gap_requests.find((g) => g.room_id === room.id && g.status !== "cleared");

  return (
    <section className={styles.panel} aria-labelledby="room-title">
      <span className={styles.stamp} data-outcome={outcome ?? "none"}>
        {outcome ? STAMP[outcome] : "Nothing judged yet"}
      </span>
      <h2 id="room-title" className={styles.roomTitle}>
        {room.name}
      </h2>
      {rows.length > 0 && (
        <dl className={styles.counts}>
          {rows.map((r) => (
            <div key={r.claim.id}>
              <dt>{ITEM_PLURAL[r.claim.item as ItemKind].charAt(0).toUpperCase() + ITEM_PLURAL[r.claim.item as ItemKind].slice(1)}</dt>
              <dd>
                {r.result.outcome === "not_seen" ? "–" : r.result.counted} <span>of {r.claim.qty}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className={styles.cover}>{cover.text}</p>

      {outcome === "not_seen" && report && (
        <div className={styles.ask}>
          {gap ? (
            <>
              <b>{gap.text}</b>
              <ol>
                {gap.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <SendGapRequest projectId={report.project.id} roomId={room.id} text={gap.text} onSent={onChange} />
            </>
          ) : (
            <>
              <b>5 s of the {room.name.toLowerCase()} clears it</b>
              <p>Nothing here is judged without footage. Write the request and send it to the site.</p>
              <WriteGapRequest projectId={report.project.id} roomId={room.id} onWritten={onChange} />
            </>
          )}
        </div>
      )}
      {outcome !== "not_seen" && frame && (
        <div className={styles.evidence}>
          <EvidenceFrame frameUrl={frame} masks={masks} label={`Best frame, ${room.name}, ${masks.length} outlined`} />
        </div>
      )}
      {outcome === "short" && <p className={styles.cover}>Short in a fully covered room. The report holds the query letter, with its frames.</p>}
      {outcome && (
        <Link className={styles.toReport} href={`/projects/${projectId}/report?flat=${flatId}#room-${room.id}`}>
          Open {room.name} in the report
        </Link>
      )}

      <div className={styles.tagRow}>
        <TagCode code={room.qr_code} />
        <div>
          <b>Room tag</b>
          <span className={ui.muted}>
            {room.name} · <span className={styles.code}>{room.qr_code}</span>
          </span>
          <button type="button" className={ui.secondaryButton} onClick={onPrint}>
            Print this tag
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---------- The site diary ---------- */

interface Entry {
  key: string;
  when: string;
  title: string;
  hot?: boolean;
  body: React.ReactNode;
}

function clipTime(c: Clip) {
  return c.captured_at ? Date.parse(c.captured_at) : -Infinity;
}

/**
 * What happened on this flat, newest first: what's waiting on the builder, then each
 * clip and the rooms it placed, then the documents and the room tags. Only judged results
 * carry an outcome; a clip's segment with no room tag is listed as never used for a claim.
 */
function Diary({
  overview,
  flatId,
  report,
  rooms,
  outcomeOf,
  onPick,
  tagsFirst,
  tags,
}: {
  overview: ProjectOverview;
  flatId: string | null;
  report: Report | null;
  rooms: Room[];
  outcomeOf: (id: string) => Outcome | null;
  onPick: (id: string) => void;
  tagsFirst: boolean;
  tags: React.ReactNode;
}) {
  const roomIds = new Set(rooms.map((r) => r.id));
  const nameOf = new Map(overview.rooms.map((r) => [r.id, r.name]));
  const several = overview.project.flats.length > 1;
  const entries: Entry[] = [];
  const tagEntry: Entry = { key: "tags", when: "Setup", title: `${overview.rooms.length} room tags to print`, body: tags };

  if (tagsFirst) entries.push({ ...tagEntry, when: "Now · before anyone films", hot: true });

  for (const room of rooms.filter((r) => outcomeOf(r.id) === "not_seen")) {
    const gap = report?.gap_requests.find((g) => g.room_id === room.id && g.status !== "cleared");
    entries.push({
      key: `unseen-${room.id}`,
      when: "Now · waiting on you",
      hot: true,
      title: `${room.name} isn't seen yet`,
      body: (
        <>
          <p className={styles.note}>No clip has swept it from its room tag, so nothing in it is judged. {gap ? `Asked for: ${gap.text}.` : ""}</p>
          <button type="button" className={ui.secondaryButton} onClick={() => onPick(room.id)}>
            {gap ? "See the request" : "Write the request"}
          </button>
        </>
      ),
    });
  }

  const clips = overview.clips.map((c, i) => ({ c, n: i + 1 })).sort((a, b) => clipTime(b.c) - clipTime(a.c));
  for (const { c, n } of clips) {
    const segs = overview.segments.filter((s) => s.clip_id === c.id);
    const placed = segs.filter((s) => s.room_id && roomIds.has(s.room_id));
    const unplaced = segs.filter((s) => !s.room_id);
    // With several flats, a clip placed only in another flat belongs to that flat's diary.
    if (several && placed.length === 0 && segs.some((s) => s.room_id)) continue;
    const when = `${captureTime(c.captured_at)} · Clip ${n}`;
    if (c.status !== "done") {
      entries.push({
        key: c.id,
        when,
        title: c.status === "failed" ? `Clip ${n} couldn't be processed` : `Clip ${n} is being processed`,
        body: <StatusBadge status={c.status} />,
      });
      continue;
    }
    const names = [...new Set(placed.map((s) => nameOf.get(s.room_id!) ?? ""))];
    const found = report?.detections.filter((d) => d.clip_id === c.id) ?? [];
    const frame = found[0]?.best_frame_url;
    entries.push({
      key: c.id,
      when,
      title: names.length ? `${names.join(" and ")} filmed` : "No room tag found",
      body: (
        <div className={frame ? styles.split : undefined}>
          {frame && (
            <div className={styles.thumb}>
              <EvidenceFrame frameUrl={frame} masks={found.filter((d) => d.best_frame_url === frame)} label={`Frame from clip ${n}`} />
            </div>
          )}
          <div className={styles.clipRooms}>
            {placed.map((s) => {
              const o = outcomeOf(s.room_id!);
              return (
                <div key={`${s.room_id}-${s.t_start}`} className={styles.clipRoom}>
                  <button type="button" className={styles.roomLink} onClick={() => onPick(s.room_id!)}>
                    {nameOf.get(s.room_id!)}
                  </button>
                  {o && (
                    <span className={styles.stamp} data-outcome={o}>
                      {STAMP[o]}
                    </span>
                  )}
                  <span className={styles.note}>
                    {s.full_sweep ? `One complete sweep from the room tag, ${seconds(s.t_start)}–${seconds(s.t_end)}` : "Partly filmed: it didn't start at the room tag"}
                  </span>
                </div>
              );
            })}
            {unplaced.length > 0 && (
              <p className={styles.note}>
                {placed.length ? "Part of this clip passed no room tag. " : "This clip passed no room tag. "}
                It&apos;s kept, but never used for a claim.
              </p>
            )}
          </div>
        </div>
      ),
    });
  }

  const docs = overview.documents.filter((d) => d.flat_id === null || d.flat_id === flatId);
  entries.push({
    key: "docs",
    when: "Documents",
    title: docs.length ? "What was billed" : "No documents yet",
    body:
      docs.length === 0 ? (
        <p className={styles.note}>Upload the demand letter and the bill of quantities.</p>
      ) : (
        <ul className={styles.docs}>
          {docs.map((d) => {
            const quotes = report?.claims.filter((c) => c.doc_id === d.id && c.quote_verified).map((c) => c.source_quote) ?? [];
            return (
              <li key={d.id}>
                <div className={styles.docHead}>
                  <b>{DOCUMENT_LABEL[d.kind]}</b>
                  <span className={ui.muted}>{d.flat_id ? "this flat" : "whole project"}</span>
                  <StatusBadge status={d.status} />
                </div>
                {d.status === "failed" && d.reason && <p className={styles.note}>{d.reason}</p>}
                {quotes.length > 0 && (
                  <div className={styles.quotes}>
                    {quotes.slice(0, 3).map((q) => (
                      <q key={q} className={styles.quote}>
                        {q}
                      </q>
                    ))}
                    {quotes.length > 3 && <span className={styles.note}>and {quotes.length - 3} more lines, each checked word for word</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ),
  });

  if (!tagsFirst) entries.push(tagEntry);

  return (
    <section className={styles.diary} aria-label="Site diary">
      <h2 className={styles.diaryTitle}>Site diary</h2>
      <ol className={styles.entries}>
        {entries.map((e, i) => (
          <li key={e.key} id={e.key === "tags" ? "tags" : undefined} className={styles.entry} data-hot={e.hot ?? false} style={{ animationDelay: `${i * 60}ms` }}>
            <span className={styles.when}>{e.when}</span>
            <h3 className={styles.entryTitle}>{e.title}</h3>
            {e.body}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Every room tag in the project, ready to print; when one is picked, only that one prints. */
function TagSheet({ project, rooms, only, onPrint }: { project: ProjectOverview["project"]; rooms: Room[]; only: string | null; onPrint: () => void }) {
  return (
    <div className={styles.tagSheet}>
      <p className={styles.note}>Stick each tag at its room&apos;s doorway, at chest height, where a clip starting in the doorway will see it.</p>
      {project.flats.map((f) => (
        <div key={f.id}>
          {project.flats.length > 1 && <h4 className={styles.flatHeading}>Flat {f.name}</h4>}
          <ul className={styles.tags}>
            {rooms
              .filter((r) => r.flat === f.id)
              .map((r) => (
                <li key={r.id} className={styles.tag} data-skip={only !== null && only !== r.id}>
                  <TagCode code={r.qr_code} />
                  <span className={styles.tagLabel}>
                    Flat {f.name} · {r.name}
                  </span>
                  <span className={styles.code}>{r.qr_code}</span>
                </li>
              ))}
          </ul>
        </div>
      ))}
      <button type="button" className={ui.secondaryButton} onClick={onPrint}>
        Print tags
      </button>
    </div>
  );
}

/**
 * Where the QR code for a room tag is drawn. Drawing a real QR needs a small
 * encoder library; until one is agreed, this shows the code as text in a tag-sized
 * box so the layout and printing are right. The decoder only reads `SP`-prefixed codes.
 */
function TagCode({ code }: { code: string }) {
  return (
    <span className={styles.qr} role="img" aria-label={`QR code ${code}`}>
      <span>QR</span>
    </span>
  );
}

/**
 * The links to send: one report link per flat for its buyer and bank, and the builder
 * link for the builder's own team. Fetched when the page opens, never stored here.
 */
function ShareLinks({ project }: { project: ProjectOverview["project"] }) {
  const [links, setLinks] = useState<ProjectLinks | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    data.getLinks(project.id).then(setLinks, () => setFailed(true));
  }, [project.id]);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <section className={styles.card} aria-labelledby="share-title">
      <h2 id="share-title" className={styles.cardTitle}>
        Send the report
      </h2>
      {failed ? (
        <p className={ui.muted}>The links couldn&apos;t be loaded. Reload the page to try again.</p>
      ) : !links ? (
        <p className={ui.muted}>Loading the links…</p>
      ) : (
        <ul className={styles.links}>
          {project.flats.map((f) => {
            const token = links.report_tokens.find((t) => t.flat_id === f.id)?.token;
            if (!token) return null;
            return (
              <li key={f.id}>
                <span>
                  <strong>Flat {f.name} report</strong>
                  <span className={ui.muted}>For its buyer and bank. Opens this flat&apos;s report only, with no login.</span>
                </span>
                <CopyButton text={reportLink(origin, token)} label="Copy link" className={ui.primaryButton} />
              </li>
            );
          })}
          <li>
            <span>
              <strong>Builder link</strong>
              <span className={ui.muted}>For your own team only. Anyone with it can upload and change this project.</span>
            </span>
            <CopyButton text={builderLink(origin, project.id, links.builder_token)} label="Copy link" className={ui.secondaryButton} />
          </li>
        </ul>
      )}
    </section>
  );
}
