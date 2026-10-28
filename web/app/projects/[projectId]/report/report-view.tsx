"use client";

import type { Claim, Detection, Flat, ItemKind, NotCheckedReason, Outcome, QueryLetter, Report, Result, Room, Segment } from "@siteproof/contract";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EvidenceFrame } from "@/components/evidence-frame";
import { AppHeader, CopyButton, ErrorPanel, Loading, ProjectNav, StaleNotice, ui, useFlatReport, useOverview, useReportByLink } from "@/components/ui";
import { builderToken, reportTokenFromHash } from "@/lib/access";
import { data, DataError } from "@/lib/data";
import type { Room3D } from "./plan-3d";
import styles from "./report.module.css";

// three.js is only downloaded when someone opens the 3D view.
const Plan3D = dynamic(() => import("./plan-3d"), {
  ssr: false,
  loading: () => <div className={styles.loading3d}>Loading the 3D view…</div>,
});

type View = "builder" | "bank";

const ITEM_PLURAL: Record<ItemKind, string> = { window: "windows", door: "doors" };
const ITEM_SINGULAR: Record<ItemKind, string> = { window: "window", door: "door" };

const TALLY_SEGMENT_LIMIT = 40;

/** "Tower B" never wraps as "Tower / B": a last word of three letters or fewer stays with the one before. */
function keepLastWord(name: string) {
  return name.replace(/ (\S{1,3})$/, "\u00a0$1");
}

function itemWord(item: ItemKind, n: number) {
  return n === 1 ? ITEM_SINGULAR[item] : ITEM_PLURAL[item];
}

interface RoomRow {
  room: Room;
  claim: Claim;
  result: Result;
  segments: Segment[];
}

/** The room's claims for one item, each with its result. A claim with no result is never shown as an outcome. */
function roomRows(report: Report, item: ItemKind): RoomRow[] {
  const rows: RoomRow[] = [];
  for (const room of report.rooms) {
    const claim = report.claims.find((c) => c.room_id === room.id && c.item === item && c.quote_verified);
    const result = claim && report.results.find((r) => r.claim_id === claim.id);
    if (!claim || !result) continue;
    rows.push({ room, claim, result, segments: report.segments.filter((s) => s.room_id === room.id) });
  }
  return rows;
}

function outcomeLabel(row: RoomRow) {
  if (row.result.outcome === "verified") return "Verified";
  if (row.result.outcome === "short") return `Short by ${row.claim.qty - row.result.counted}`;
  return "Not seen yet";
}

const STAMP: Record<Outcome, string> = { verified: "Verified", short: "Short", not_seen: "Not seen yet" };

/** Open rooms rank first in the schedule: Short, then Not seen yet, then Verified. */
const OPEN_RANK: Record<Outcome, number> = { short: 0, not_seen: 1, verified: 2 };

/** Not seen yet is never a number: the room wasn't judged, so a count would read as a zero. */
function countedText(row: RoomRow) {
  return row.result.outcome === "not_seen" ? "–" : String(row.result.counted);
}

function coverageText(segments: Segment[]) {
  if (segments.some((s) => s.full_sweep)) return "One-way sweep";
  if (segments.length > 0) return "Partial";
  return "Not filmed";
}

function seconds(t: number) {
  const s = Math.round(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// The report carries evidence frames, not clips, so a clip's capture time isn't in it.
function clipCaption(row: RoomRow) {
  const sweep = row.segments.find((s) => s.full_sweep);
  if (sweep) return `One-way sweep ${seconds(sweep.t_start)}–${seconds(sweep.t_end)} of its clip · best frame per object`;
  if (row.segments.length > 0) return "A clip reached this room, but not as one sweep starting at its room tag.";
  return "No clip has passed this room's tag yet.";
}

function summary(row: RoomRow, item: ItemKind) {
  const { claim, result, room } = row;
  if (result.outcome === "verified") {
    return claim.qty === 1
      ? `The 1 ${ITEM_SINGULAR[item]} in the plan was found in a one-way sweep from the room tag. It's outlined in its best frame.`
      : `All ${claim.qty} ${ITEM_PLURAL[item]} in the plan were found in a one-way sweep from the room tag. Each is outlined in its best frame.`;
  }
  if (result.outcome === "short") {
    return `A one-way sweep from the ${room.name} room tag covered the whole room and found ${result.counted} of the ${claim.qty} ${ITEM_PLURAL[item]} in the plan. Because the room is fully covered, the gap counts as Short.`;
  }
  return `${room.name} hasn't been covered well enough to judge, so it stays Not seen yet. Nothing is wrong. We just need 5 seconds of footage.`;
}

/** What the builder can do about a Short room, with the count's grammar right for one. */
function shortNote(row: RoomRow, item: ItemKind) {
  const missing = row.claim.qty - row.result.counted;
  const one = missing === 1;
  return `${missing} ${itemWord(item, missing)} ${one ? "wasn't" : "weren't"} found in a one-way sweep. If ${one ? "it's" : "they're"} installed somewhere the sweep missed, film one slow sweep from the ${row.room.name} room tag. If ${one ? "it's" : "they're"} still to come, correct the demand letter before buyers pay.`;
}

/**
 * A query letter, only if every citation in it resolves in this report: the billed line
 * and the plan line are claims here, and each frame is the best frame of a detection.
 * The server sends only letters that passed its re-check; this is the same check again,
 * because a citation that fails it is never shown.
 */
function checkedLetter(report: Report, claimId: string): QueryLetter | null {
  const letter = report.query_letters.find((q) => q.claim_id === claimId);
  if (!letter) return null;
  const { invoice_claim_id, plan_claim_id, evidence } = letter.citations;
  const claim = (id: string) => report.claims.some((c) => c.id === id && c.quote_verified);
  const frames = new Set(report.detections.map((d) => d.best_frame_url));
  const resolves = claim(invoice_claim_id) && (plan_claim_id === null || claim(plan_claim_id)) && evidence.length > 0 && evidence.every((f) => frames.has(f));
  return resolves ? letter : null;
}

function citationCount(letter: QueryLetter) {
  return 1 + (letter.citations.plan_claim_id ? 1 : 0) + letter.citations.evidence.length;
}

const NOT_CHECKED: Record<NotCheckedReason, string> = {
  not_countable: "Not checked from footage in this version",
  exceeds_plan: "More than the bill of quantities holds. A person compares the two lines",
};

/** Detections grouped by the frame they're best seen in, so each frame shows every outline it holds. */
function framesFor(report: Report, row: RoomRow): { frame: string; masks: Detection[] }[] {
  const found = report.detections.filter((d) => d.room_id === row.room.id && d.item === row.claim.item);
  const frames = new Map<string, Detection[]>();
  for (const d of found) frames.set(d.best_frame_url, [...(frames.get(d.best_frame_url) ?? []), d]);
  return [...frames].map(([frame, masks]) => ({ frame, masks }));
}

function Tick() {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}

function Camera({ size = 26 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h3l2-3h8l2 3h3v11H3z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export function ReportPage({ projectId }: { projectId: string }) {
  const project = useOverview(projectId);
  const flats = project.overview?.project.flats ?? [];
  const asked = useSearchParams().get("flat");
  const flatId = (flats.find((f) => f.id === asked) ?? flats[0])?.id ?? null;
  const flatReport = useFlatReport(projectId, flatId);
  // The report is read first by a buyer or bank deciding to pay; the builder's view is one
  // tap away, and stays chosen when the builder switches flats.
  const [view, setView] = useState<View>("bank");
  const report = flatReport.report?.flat.id === flatId ? flatReport.report : null;
  const error = project.error ?? flatReport.error;
  const stale = project.stale || flatReport.stale;
  const reload = useCallback(() => {
    void project.reload();
    void flatReport.reload();
  }, [project.reload, flatReport.reload]);
  if (project.overview && flats.length === 0) {
    return (
      <>
        <AppHeader />
        <main className={ui.main}>
          <section className={ui.empty}>
            <h1 className={ui.h2}>This project has no flats</h1>
          </section>
        </main>
      </>
    );
  }
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
        <Loading what="Loading the report" />
      </>
    );
  }
  return (
    <>
      <StaleNotice stale={stale} onRetry={reload} />
      <ReportView key={report.flat.id} report={report} flats={flats} view={view} setView={setView} onChange={reload} />
    </>
  );
}

/**
 * A flat's report opened from its report link (`/report#<token>`): the buyer's and bank's
 * view, with no login and nothing of the builder's. The token is read after the page
 * loads, from the part of the address a browser never sends to a server.
 */
export function LinkedReportPage() {
  // undefined until the address has been read; null when it holds no report link.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    // A second link pasted into the same tab changes only the part after "#".
    const read = () => setToken(reportTokenFromHash());
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const { report, error, stale, reload } = useReportByLink(token ?? null);
  // A link that opens nothing: mistyped, or replaced by the builder. Never "project".
  const refused = error instanceof DataError && [401, 403, 404].includes(error.status);
  if (token === null || refused) {
    return (
      <>
        <AppHeader brandHref="/" />
        <main className={ui.main}>
          <section className={ui.empty}>
            <h1 className={ui.h2}>{refused ? "This report link doesn't open anything" : "This link is missing its report"}</h1>
            <p className={ui.lede}>
              {refused
                ? "It may be mistyped, or the builder may have replaced it with a new one. Ask whoever sent it for the current link."
                : "Open the whole link you were sent. If it still doesn't work, ask whoever sent it for the current one."}
            </p>
          </section>
        </main>
      </>
    );
  }
  if (error) {
    return (
      <>
        <AppHeader brandHref="/" />
        <main className={ui.main}>
          <ErrorPanel error={error} retry={reload} home={false} />
        </main>
      </>
    );
  }
  if (!report) {
    return (
      <>
        <AppHeader brandHref="/" />
        <Loading what="Loading the report" />
      </>
    );
  }
  return (
    <>
      <StaleNotice stale={stale} onRetry={reload} />
      <ReportView report={report} flats={[]} view="bank" setView={() => {}} onChange={reload} buyer />
    </>
  );
}

function ReportView({
  report,
  flats,
  view,
  setView,
  onChange,
  buyer = false,
}: {
  report: Report;
  flats: Flat[];
  view: View;
  setView: (view: View) => void;
  onChange: () => void;
  /** Opened from a report link: no builder view, no way into the project. */
  buyer?: boolean;
}) {
  const [item, setItem] = useState<ItemKind>("window");
  const [planMode, setPlanMode] = useState<"plan" | "3d">("plan");
  const evidenceRef = useRef<HTMLElement>(null);
  const rows = roomRows(report, item);
  const rooms3d: Room3D[] = useMemo(
    () => rows.map((r) => ({ id: r.room.id, name: r.room.name, qty: r.claim.qty, counted: r.result.counted, outcome: r.result.outcome })),
    // rows is rebuilt every render; these are the values it is made from.
    [report, item],
  );
  // Open rooms first, then the verified ones, each group in the plan's order.
  const ranked = [...rows].sort((x, y) => OPEN_RANK[x.result.outcome] - OPEN_RANK[y.result.outcome]);
  const [selectedId, setSelectedId] = useState<string>(() => {
    const first = [...roomRows(report, "window")].sort((x, y) => OPEN_RANK[x.result.outcome] - OPEN_RANK[y.result.outcome])[0];
    return first?.room.id ?? report.rooms[0]?.id ?? "";
  });
  const selected = rows.find((r) => r.room.id === selectedId) ?? ranked[0];
  const index = (roomId: string) => `R${report.rooms.findIndex((r) => r.id === roomId) + 1}`;

  // On a phone the evidence sits below the schedule; choosing a room brings it into view.
  const choose = (roomId: string) => {
    setSelectedId(roomId);
    if (!window.matchMedia("(max-width: 899px)").matches) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => evidenceRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" }));
  };

  const letter = report.documents.find((d) => d.kind === "demand_letter");
  const letterClaim = report.claims.find((c) => c.doc_id === letter?.id && c.item === item && c.room_id === null);
  // Claims in this report that weren't judged, each with why; never shown as Not seen yet.
  const notChecked = report.not_checked.flatMap((n) => {
    const claim = report.claims.find((c) => c.id === n.claim_id && c.quote_verified);
    if (!claim) return [];
    // For a claim over the plan, the plan line goes beside it.
    const plan =
      n.reason === "exceeds_plan"
        ? report.claims.find((c) => c.doc_id !== claim.doc_id && c.item === claim.item && c.room_id === claim.room_id && c.quote_verified)
        : undefined;
    return [{ claim, reason: n.reason, plan }];
  });

  // Objects counted with frames, in rooms that were judged; the gap in covered rooms; everything in rooms not seen yet.
  const seen = rows.filter((r) => r.result.outcome !== "not_seen").reduce((n, r) => n + Math.min(r.result.counted, r.claim.qty), 0);
  const short = rows.filter((r) => r.result.outcome === "short").reduce((n, r) => n + (r.claim.qty - r.result.counted), 0);
  const notSeen = rows.filter((r) => r.result.outcome === "not_seen").reduce((n, r) => n + r.claim.qty, 0);
  const claimed = letterClaim?.quote_verified ? letterClaim.qty : null;

  const gapRooms = rows.filter((r) => r.result.outcome === "not_seen");
  const shortRooms = rows.filter((r) => r.result.outcome === "short");
  const gap = selected && report.gap_requests.find((g) => g.room_id === selected.room.id && g.status !== "cleared");
  const letterForSelected = selected && checkedLetter(report, selected.claim.id);
  const flat = `Flat ${report.flat.name}`;

  const clearDetail = [
    gapRooms.length > 0 && `Film 5 s of ${gapRooms.map((r) => `the ${r.room.name.toLowerCase()}`).join(", ")}.`,
    ...shortRooms.map((r) => {
      const missing = r.claim.qty - r.result.counted;
      return `${r.room.name}: ${missing} ${itemWord(item, missing)} ${missing === 1 ? "wasn't" : "weren't"} found. Film ${missing === 1 ? "it" : "them"}, or correct the demand letter.`;
    }),
  ].filter(Boolean);
  const breakdownParts = [short > 0 && `${short} Short`, notSeen > 0 && `${notSeen} Not seen yet`].filter((p): p is string => Boolean(p));

  return (
    <div className={styles.page}>
      <AppHeader title={`${flat} · ${keepLastWord(report.project.name)}`} brandHref={buyer ? "/" : undefined}>
        {!buyer && (
          <div role="group" aria-label="Report view" className={ui.toggle}>
            <button type="button" aria-pressed={view === "bank"} onClick={() => setView("bank")}>
              Buyer / bank
            </button>
            <button type="button" aria-pressed={view === "builder"} onClick={() => setView("builder")}>
              Builder
            </button>
          </div>
        )}
        {view === "builder" && <ProjectNav projectId={report.project.id} current="report" />}
        <button type="button" className={`${ui.primaryButton} ${styles.exportButton}`} onClick={() => window.print()}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
          </svg>
          <span className={ui.phoneHidden}>Print or save PDF</span>
        </button>
      </AppHeader>

      <main className={styles.main}>
        {view === "builder" && flats.length > 1 && (
          <nav aria-label="Flat" className={styles.itemTabs}>
            {flats.map((f) => (
              <Link key={f.id} href={`/projects/${report.project.id}/report?flat=${f.id}`} aria-current={f.id === report.flat.id ? "page" : undefined}>
                Flat {f.name}
              </Link>
            ))}
          </nav>
        )}
        {!letter || rows.length === 0 ? (
          <>
            {letter && <ItemSwitch item={item} onChange={setItem} />}
            <NothingToJudge report={report} hasLetter={Boolean(letter)} item={item} letterClaimsItem={Boolean(letterClaim)} buyer={buyer} />
          </>
        ) : (
          <>
            {/* The answer: one number at monumental scale, what it leaves open, and the item it is about. */}
            <section className={styles.answer} aria-labelledby="answer-title">
              <div className={styles.answerMain}>
                {claimed === null ? (
                  <h1 id="answer-title" className={styles.answerFallback}>
                    The letter&apos;s {ITEM_PLURAL[item]} line couldn&apos;t be checked word for word
                  </h1>
                ) : (
                  <>
                    <h1 id="answer-title" className={styles.answerNumber}>
                      {seen} <span className={styles.answerOf}>of</span> {claimed}
                    </h1>
                    <div className={styles.answerText}>
                      <p className={styles.answerLine}>
                        {ITEM_PLURAL[item]} verified with their frames
                        {breakdownParts.map((part) => (
                          <span key={part} className={styles.keep}>
                            {" · "}
                            {part}
                          </span>
                        ))}
                      </p>
                      {seen + short + notSeen <= TALLY_SEGMENT_LIMIT ? (
                        <div className={styles.tally} aria-hidden="true">
                          {Array.from({ length: seen }, (_, i) => <span key={`v${i}`} className={styles.tallyVerified} />)}
                          {Array.from({ length: short }, (_, i) => <span key={`s${i}`} className={styles.tallyShort} />)}
                          {Array.from({ length: notSeen }, (_, i) => <span key={`n${i}`} className={styles.tallyNotSeen} />)}
                        </div>
                      ) : (
                        <div className={styles.tally} aria-hidden="true">
                          {seen > 0 && <span className={styles.tallyVerified} style={{ flexGrow: seen }} />}
                          {short > 0 && <span className={styles.tallyShort} style={{ flexGrow: short }} />}
                          {notSeen > 0 && <span className={styles.tallyNotSeen} style={{ flexGrow: notSeen }} />}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
              <ItemSwitch item={item} onChange={setItem} />
            </section>

            {view === "builder" && (
              <p className={styles.clear}>
                <b>To clear the rest:</b> {clearDetail.length > 0 ? clearDetail.join(" ") : "nothing left to clear."} Buyers see this report before they pay.
              </p>
            )}

            <div className={styles.sheet}>
              {/* Left: the map and the schedule of rooms. */}
              <section className={styles.roomsColumn} aria-labelledby="rooms-title">
                <div className={styles.roomsHead}>
                  <h2 id="rooms-title" className={styles.h2}>
                    Rooms
                  </h2>
                  <div role="group" aria-label="Room view" className={styles.modeToggle}>
                    <button type="button" aria-pressed={planMode === "plan"} onClick={() => setPlanMode("plan")}>
                      Plan
                    </button>
                    <button type="button" aria-pressed={planMode === "3d"} onClick={() => setPlanMode("3d")}>
                      3D
                    </button>
                  </div>
                </div>

                {planMode === "3d" ? (
                  <>
                    <Plan3D rooms={rooms3d} selectedId={selected?.room.id} onSelect={choose} />
                    <span className={styles.note}>
                      Not to scale. SiteProof counts the {ITEM_PLURAL[item]} in each room; it doesn&apos;t know the room&apos;s size or which wall each one is on,
                      so the layout and markers are illustrative. The frames are the evidence.
                    </span>
                  </>
                ) : (
                  <div className={styles.plan}>
                    <div className={styles.planGrid}>
                      {rows.map((r) => (
                        <button
                          key={r.room.id}
                          type="button"
                          aria-pressed={r.room.id === selected?.room.id}
                          aria-label={`${index(r.room.id)} ${r.room.name}, ${countedText(r)} of ${r.claim.qty}, ${outcomeLabel(r)}`}
                          onClick={() => choose(r.room.id)}
                          className={`${styles.planRoom} ${styles[`plan_${r.result.outcome}`]}`}
                        >
                          <span className={styles.planRoomName}>
                            <code>{index(r.room.id)}</code> {r.room.name}
                          </span>
                          <span className={styles.planFoot}>
                            <span className={styles.planCount}>
                              {countedText(r)} / {r.claim.qty}
                            </span>
                            <span className={`${styles.planLabel} ${styles[`label_${r.result.outcome}`]}`}>{outcomeLabel(r)}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className={styles.titleBlock}>
                      <span>{flat}</span>
                      <span>{ITEM_PLURAL[item]}</span>
                      <span>
                        R1–R{report.rooms.length}
                      </span>
                    </div>
                  </div>
                )}

                {/* The schedule: ranked by weight and rules, open rooms first, never by size. */}
                <ol className={styles.schedule} aria-label="Rooms, open ones first">
                  {ranked.map((r) => (
                    <li key={r.room.id}>
                      <button
                        type="button"
                        aria-pressed={r.room.id === selected?.room.id}
                        onClick={() => choose(r.room.id)}
                        className={`${styles.scheduleRow} ${r.result.outcome === "verified" ? "" : styles.scheduleOpen}`}
                      >
                        <code>{index(r.room.id)}</code>
                        <span className={styles.scheduleName}>{r.room.name}</span>
                        <span className={styles.scheduleCount}>
                          {countedText(r)} / {r.claim.qty}
                        </span>
                        <span className={`${styles.scheduleOutcome} ${styles[`out_${r.result.outcome}`]}`}>{outcomeLabel(r)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
                <span className={styles.note}>
                  Hatched rooms haven&apos;t had a one-way sweep from their room tag yet, so SiteProof doesn&apos;t judge them.
                </span>
              </section>

              {/* Right: the selected room's evidence, its sources in the margin. */}
              {selected && (
                <article ref={evidenceRef} className={styles.evidence} aria-labelledby="evidence-title">
                  <div className={styles.evidenceMain}>
                    <h2 id="evidence-title" className={styles.evidenceTitle}>
                      <code>{index(selected.room.id)}</code> {selected.room.name}
                    </h2>
                    <dl className={styles.stats}>
                      <div>
                        <dt>In the plan</dt>
                        <dd className={styles.statNumber}>{selected.claim.qty}</dd>
                      </div>
                      <div>
                        <dt>Counted</dt>
                        <dd className={styles.statNumber}>{countedText(selected)}</dd>
                      </div>
                      <div>
                        <dt>Coverage</dt>
                        <dd className={styles.statText}>{coverageText(selected.segments)}</dd>
                      </div>
                    </dl>

                    <div className={styles.plate}>
                      <span className={`${styles.tick} ${styles.tickTL}`} aria-hidden="true" />
                      <span className={`${styles.tick} ${styles.tickBR}`} aria-hidden="true" />
                      {selected.result.outcome === "not_seen" ? (
                        <div className={styles.noFrame}>
                          <span className={styles.noFrameTitle}>No one-way sweep yet</span>
                          <span>{clipCaption(selected)}</span>
                        </div>
                      ) : (
                        framesFor(report, selected).map(({ frame, masks }) => (
                          <EvidenceFrame
                            key={frame}
                            frameUrl={frame}
                            masks={masks}
                            label={`Best frame, ${selected.room.name}, ${masks.length} ${itemWord(item, masks.length)} outlined`}
                            badge={`Tracked · ${masks.length} outlined`}
                          />
                        ))
                      )}
                      {/* Pressed half off the plate; re-pressed whenever the room or item changes. */}
                      <span key={`${selected.room.id}-${item}`} className={`${styles.stamp} ${styles[`stamp_${selected.result.outcome}`]}`}>
                        {STAMP[selected.result.outcome]}
                        {selected.result.outcome === "short" ? ` ${selected.claim.qty - selected.result.counted}` : ""}
                      </span>
                    </div>
                    {selected.result.outcome !== "not_seen" && <p className={styles.monoNote}>{clipCaption(selected)}</p>}

                    <p className={styles.summary}>{summary(selected, item)}</p>
                  </div>

                  <aside className={styles.margin} aria-label="Where the claim comes from, and what clears it">
                    {letterClaim && <Source title="Demand letter" claim={letterClaim} />}
                    <Source title="Bill of quantities" claim={selected.claim} />

                    {selected.result.outcome === "not_seen" && gap && (
                      <div className={styles.shot}>
                        <span className={styles.shotIcon}>
                          <Camera />
                        </span>
                        <div className={styles.shotText}>
                          <span className={styles.shotTitle}>{gap.text}</span>
                          <span className={styles.shotHint}>Start at the {selected.room.name.toLowerCase()} room tag and pan slowly one way. Don&apos;t pan back.</span>
                        </div>
                        {view === "builder" ? (
                          <SendGapRequest projectId={report.project.id} roomId={selected.room.id} text={gap.text} sent={gap.status === "sent"} onSent={onChange} />
                        ) : (
                          <span className={styles.shotStatus}>Requested · awaiting footage</span>
                        )}
                      </div>
                    )}

                    {selected.result.outcome === "short" && view === "bank" && letterForSelected && (
                      <div className={styles.query}>
                        <h3 className={styles.queryTitle}>Draft query letter</h3>
                        <span className={styles.queryChecked}>{citationCount(letterForSelected)} citations re-checked</span>
                        <p>{letterForSelected.body}</p>
                        <div className={styles.queryActions}>
                          <CopyButton text={letterForSelected.body} label="Copy letter" />
                        </div>
                      </div>
                    )}

                    {selected.result.outcome === "short" && view === "builder" && (
                      <div className={styles.query}>
                        <h3 className={styles.queryTitle}>Buyers will see this as Short</h3>
                        <p>{shortNote(selected, item)}</p>
                      </div>
                    )}
                  </aside>
                </article>
              )}
            </div>
          </>
        )}

        {notChecked.length > 0 && (
          <section className={styles.notCountable} aria-labelledby="also-title">
            <h2 id="also-title" className={styles.h2}>
              Also in this demand letter
            </h2>
            <ul>
              {notChecked.map(({ claim, reason, plan }) => (
                <li key={claim.id}>
                  <span className={styles.quote}>&ldquo;{claim.source_quote}&rdquo;</span>
                  {plan && <span className={styles.quote}>Bill of quantities: &ldquo;{plan.source_quote}&rdquo;</span>}
                  <span className={styles.notCountableTag}>{NOT_CHECKED[reason]}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className={styles.footer}>
          SiteProof supports payment decisions with evidence. It doesn&apos;t replace an engineer&apos;s inspection of hidden or structural work.
        </footer>
      </main>
    </div>
  );
}

/** Windows / Doors: switching re-renders the whole sheet, list and evidence together. */
function ItemSwitch({ item, onChange }: { item: ItemKind; onChange: (item: ItemKind) => void }) {
  return (
    <div role="group" aria-label="Item" className={styles.itemTabs}>
      {(["window", "door"] as const).map((k) => (
        <button key={k} type="button" aria-pressed={item === k} onClick={() => onChange(k)}>
          {ITEM_PLURAL[k][0].toUpperCase() + ITEM_PLURAL[k].slice(1)}
        </button>
      ))}
    </div>
  );
}

function Source({ title, claim }: { title: string; claim: Claim }) {
  return (
    <div className={styles.source}>
      <span className={styles.sourceTitle}>{title}</span>
      <span className={styles.quote}>&ldquo;{claim.source_quote}&rdquo;</span>
      {claim.quote_verified && (
        <span className={styles.matched}>
          <Tick />
          Quote matched word for word
        </span>
      )}
    </div>
  );
}

function NothingToJudge({
  report,
  hasLetter,
  item,
  letterClaimsItem,
  buyer,
}: {
  report: Report;
  hasLetter: boolean;
  item: ItemKind;
  letterClaimsItem: boolean;
  buyer: boolean;
}) {
  const boq = report.documents.find((d) => d.kind === "boq");
  const otherItems = (["window", "door"] as const).filter(
    (k) => k !== item && report.claims.some((c) => c.item === k && c.room_id === null && c.quote_verified),
  );
  const reading = report.documents.some((d) => d.kind === "demand_letter" && (d.status === "uploaded" || d.status === "processing"));
  const failed = report.documents.some((d) => d.kind === "demand_letter" && d.status === "failed");
  let title = "No demand letter yet";
  let body = buyer
    ? "The builder hasn't sent the demand letter for this flat yet. This report fills in once they do."
    : "Upload the demand letter and the bill of quantities, then the clips. The report fills in as each one is read.";
  if (reading) {
    title = "Reading the demand letter";
    body = "This usually takes a minute. The page updates by itself.";
  } else if (failed) {
    title = "The demand letter couldn't be read";
    body = "Upload a clearer copy, ideally the PDF the letter was made from rather than a photo or scan.";
  } else if (hasLetter && letterClaimsItem && (!boq || boq.status !== "done")) {
    // The letter's claim is for the whole flat; the bill of quantities splits it by room.
    title = boq && boq.status !== "failed" ? "Reading the bill of quantities" : `The ${ITEM_PLURAL[item]} can't be split by room yet`;
    body = boq && boq.status !== "failed"
      ? "Once it's read, each room's share of the claim appears here."
      : `The demand letter claims ${ITEM_PLURAL[item]} for the whole flat. Upload the bill of quantities so each room's share can be checked.`;
  } else if (hasLetter && otherItems.length > 0) {
    title = `This letter makes no claim about ${ITEM_PLURAL[item]}`;
    body = `It claims ${otherItems.map((k) => ITEM_PLURAL[k]).join(" and ")}. Switch above to see them.`;
  } else if (hasLetter && report.claims.some((c) => c.item === "not_countable")) {
    title = "Nothing in this letter can be checked from footage yet";
    body = "This version counts windows and doors. Claims for other work are listed below and not judged.";
  } else if (hasLetter) {
    title = "No claims came out of this letter";
    body = "Check it's the right document, or upload a clearer copy: the PDF it was made from reads best.";
  }
  return (
    <section className={ui.empty}>
      <h1 className={ui.h2}>{title}</h1>
      <p className={ui.lede}>{body}</p>
      {!reading && !buyer && (
        <Link href={`/projects/${report.project.id}/upload`} className={ui.primaryButton}>
          Upload documents and clips
        </Link>
      )}
    </section>
  );
}

/** Shares the phone page for this gap request (WhatsApp, on a phone), or copies its link. */
function SendGapRequest({ projectId, roomId, text, sent, onSent }: { projectId: string; roomId: string; text: string; sent: boolean; onSent: () => void }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const [busy, setBusy] = useState(false);
  return (
    <div className={styles.sendWrap}>
      <button
        type="button"
        className={ui.markButton}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          // The site phone uploads into the project, so the link carries the builder link.
          const token = builderToken(projectId);
          const url = `${window.location.origin}/projects/${projectId}/rooms/${roomId}/request${token ? `#key=${encodeURIComponent(token)}` : ""}`;
          try {
            if (navigator.share) {
              await navigator.share({ title: "SiteProof footage request", text, url });
            } else {
              await navigator.clipboard.writeText(`${text}: ${url}`);
              setState("copied");
            }
            await data.requestFootage(projectId, roomId).catch(() => undefined);
            onSent();
          } catch (e) {
            // Closing the share sheet is not an error.
            if (!(e instanceof DOMException && e.name === "AbortError")) setState("error");
          } finally {
            setBusy(false);
          }
        }}
      >
        {sent ? "Send again" : "Send to site supervisor"}
      </button>
      <span className={styles.sendNote} role="status">
        {state === "copied" ? "Link copied. Paste it in WhatsApp." : state === "error" ? "Couldn't share. Try again." : sent ? "Sent" : ""}
      </span>
      <Link href={`/projects/${projectId}/rooms/${roomId}/request`} className={styles.sendPreview}>
        Open the request
      </Link>
    </div>
  );
}

