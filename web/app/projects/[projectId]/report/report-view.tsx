"use client";

import type { Claim, Detection, Flat, ItemKind, NotCheckedReason, Outcome, QueryLetter, Report, Result, Room, Segment } from "@siteproof/contract";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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

const ITEM_PLURAL: Record<ItemKind, string> = {
  window: "windows",
  door: "doors",
};
const ITEM_SINGULAR: Record<ItemKind, string> = {
  window: "window",
  door: "door",
};
const ITEMS: ItemKind[] = ["window", "door"];

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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
    rows.push({
      room,
      claim,
      result,
      segments: report.segments.filter((s) => s.room_id === room.id),
    });
  }
  return rows;
}

const STAMP: Record<Outcome, string> = {
  verified: "Verified",
  short: "Short",
  not_seen: "Not seen yet",
};

function seconds(t: number) {
  const s = Math.round(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
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

/** Every room's row for every item, in the plan's order. */
function allRows(report: Report): RoomRow[] {
  const byRoom = new Map(report.rooms.map((r) => [r.id, [] as RoomRow[]]));
  for (const item of ITEMS) for (const row of roomRows(report, item)) byRoom.get(row.room.id)?.push(row);
  return [...byRoom.values()].flat();
}

const missingOf = (r: RoomRow) => r.claim.qty - r.result.counted;

interface Bill {
  item: ItemKind;
  claim: Claim | undefined;
  seen: number;
  short: RoomRow[];
  notSeen: RoomRow[];
}

/** What the demand letter billed for one item, against what was counted in the rooms that were judged. */
function billFor(report: Report, rows: RoomRow[], item: ItemKind, letterId: string | undefined): Bill {
  const mine = rows.filter((r) => r.claim.item === item);
  return {
    item,
    claim: report.claims.find((c) => c.doc_id === letterId && c.item === item && c.room_id === null),
    // Objects counted with frames, in rooms that were judged, never more than the plan holds.
    seen: mine.filter((r) => r.result.outcome !== "not_seen").reduce((n, r) => n + Math.min(r.result.counted, r.claim.qty), 0),
    short: mine.filter((r) => r.result.outcome === "short"),
    notSeen: mine.filter((r) => r.result.outcome === "not_seen"),
  };
}

function coverage(segments: Segment[]) {
  const sweep = segments.find((s) => s.full_sweep);
  if (sweep)
    return {
      covered: true,
      text: "Covered · one complete sweep from the room tag",
      when: `Sweep ${seconds(sweep.t_start)}–${seconds(sweep.t_end)} of its clip`,
    };
  if (segments.length > 0)
    return {
      covered: false,
      text: "Partly filmed · the clip didn't start at the room tag",
      when: "Needs one sweep from the tag",
    };
  return {
    covered: false,
    text: "Not covered yet · no clip has passed this room's tag",
    when: "Waiting for 5 s of footage",
  };
}

const ICON = {
  tick: "M5 12.5l4.5 4.5L19 7.5",
  gap: "M5 12h14",
  unseen: "M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6zM4 4l16 16",
  sweep: "M4 18a10 10 0 0 1 16 0M17 14l3 4-4 1",
  seal: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM8.5 12.2l2.4 2.3 4.6-4.8",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
};

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
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
  // Only the empty state switches item: the sheet shows windows and doors together.
  const [item, setItem] = useState<ItemKind>("window");
  const flat = `Flat ${report.flat.name}`;
  const rows = useMemo(() => allRows(report), [report]);
  const letter = report.documents.find((d) => d.kind === "demand_letter");
  const bills = ITEMS.map((k) => billFor(report, rows, k, letter?.id)).filter((b) => b.claim || rows.some((r) => r.claim.item === b.item));
  const shortRows = rows.filter((r) => r.result.outcome === "short");
  const unseenRooms = report.rooms.filter((room) => rows.some((r) => r.room.id === room.id && r.result.outcome === "not_seen"));

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

  const empty = !letter || rows.length === 0;
  const steps = empty ? [] : nextSteps(report, view, shortRows, unseenRooms, onChange);

  return (
    <div className={styles.page}>
      <AppHeader
        eyebrow={`${report.project.builder} · ${keepLastWord(report.project.name)}`}
        title={flat}
        brandHref={buyer ? "/" : undefined}
        band={steps.length > 0 ? <NextStep steps={steps} /> : undefined}
      >
        {!buyer && (
          <div role="group" aria-label="Report view" className={ui.toggle}>
            <button type="button" aria-pressed={view === "bank"} onClick={() => setView("bank")}>
              Buyer &amp; bank
            </button>
            <button type="button" aria-pressed={view === "builder"} onClick={() => setView("builder")}>
              Builder
            </button>
          </div>
        )}
        {view === "builder" && <ProjectNav projectId={report.project.id} current="report" />}
        <button type="button" className={`${ui.primaryButton} ${styles.exportButton}`} onClick={() => window.print()}>
          <Icon d={ICON.download} />
          <span className={ui.phoneHidden}>Print or save PDF</span>
        </button>
      </AppHeader>

      <main className={styles.main}>
        {view === "builder" && flats.length > 1 && (
          <nav aria-label="Flat" className={styles.flatTabs}>
            {flats.map((f) => (
              <Link key={f.id} href={`/projects/${report.project.id}/report?flat=${f.id}`} aria-current={f.id === report.flat.id ? "page" : undefined}>
                Flat {f.name}
              </Link>
            ))}
          </nav>
        )}

        {empty ? (
          <>
            {letter && <ItemSwitch item={item} onChange={setItem} />}
            <NothingToJudge
              report={report}
              hasLetter={Boolean(letter)}
              item={item}
              letterClaimsItem={report.claims.some((c) => c.doc_id === letter?.id && c.item === item && c.room_id === null)}
              buyer={buyer}
            />
            <NotChecked items={notChecked} />
          </>
        ) : (
          <>
            <section className={styles.billed} aria-label="What the demand letter billed">
              {bills.map((b) => (
                <BillPanel key={b.item} bill={b} />
              ))}
            </section>

            <div className={styles.columns}>
              <div className={styles.roomsColumn}>
                <div className={styles.secHead}>
                  <h2 className={styles.sec}>Room by room</h2>
                  <span className={styles.secNote}>
                    <Icon d={ICON.seal} size={15} />
                    Every line quoted word for word from the bill of quantities, and checked
                  </span>
                </div>
                {report.rooms.map((room) => (
                  <RoomEntry key={room.id} report={report} room={room} rows={rows.filter((r) => r.room.id === room.id)} />
                ))}
                <Flat3D rows={rows} />
              </div>

              <aside className={styles.aside} aria-label="What clears the rest">
                {unseenRooms.map((room) => (
                  <GapPanel key={room.id} report={report} room={room} view={view} onChange={onChange} />
                ))}
                {shortRows.map((r) => (
                  <ShortPanel key={r.claim.id} report={report} row={r} view={view} />
                ))}
                <NotChecked items={notChecked} />
              </aside>
            </div>
          </>
        )}

        <footer className={styles.footer}>
          SiteProof supports payment decisions with evidence. It doesn&apos;t replace an engineer&apos;s inspection of hidden or structural work.
        </footer>
      </main>
    </div>
  );
}

function BillPanel({ bill }: { bill: Bill }) {
  const sum = (rs: RoomRow[], f: (r: RoomRow) => number) => rs.reduce((n, r) => n + f(r), 0);
  const where = [
    bill.short.length > 0 && {
      short: true,
      text: `${sum(bill.short, missingOf)} short in ${bill.short.map((r) => r.room.name).join(", ")}`,
    },
    bill.notSeen.length > 0 && {
      short: false,
      text: `${sum(bill.notSeen, (r) => r.claim.qty)} not seen yet in ${bill.notSeen.map((r) => r.room.name).join(", ")}`,
    },
  ].filter((x): x is { short: boolean; text: string } => Boolean(x));

  if (!bill.claim?.quote_verified) {
    return (
      <div className={styles.bill}>
        <h2 className={styles.billHead}>Demand letter</h2>
        <p className={styles.billUnchecked}>
          {bill.claim
            ? `The letter's ${ITEM_PLURAL[bill.item]} line couldn't be matched word for word, so it isn't shown as a number.`
            : `The demand letter makes no claim about ${ITEM_PLURAL[bill.item]}. The rooms below are checked against the bill of quantities.`}
        </p>
      </div>
    );
  }
  return (
    <div className={styles.bill}>
      <h2 className={styles.billHead}>
        Demand letter <q className={styles.src}>{bill.claim.source_quote}</q>
        <span className={styles.chk}>
          <Icon d={ICON.seal} size={15} />
          quote checked
        </span>
      </h2>
      <p className={styles.fig}>
        <span className={styles.figN}>{bill.seen}</span>
        <span className={styles.figOf}>of {bill.claim.qty}</span>
        <span className={styles.figLabel}>{ITEM_PLURAL[bill.item]} seen and counted, with frames</span>
      </p>
      <p className={styles.split}>
        {where.length === 0 ? (
          <span>Every {ITEM_SINGULAR[bill.item]} billed was counted.</span>
        ) : (
          where.map((w) => (
            <span key={w.text} className={w.short ? styles.splitShort : undefined}>
              {w.text}
            </span>
          ))
        )}
      </p>
    </div>
  );
}

function RoomEntry({ report, room, rows }: { report: Report; room: Room; rows: RoomRow[] }) {
  if (rows.length === 0) return null;
  const cov = coverage(rows[0].segments);
  return (
    <section className={styles.room} id={`room-${room.id}`} aria-labelledby={`room-h-${room.id}`}>
      <div className={styles.roomHead}>
        <h3 id={`room-h-${room.id}`}>{room.name}</h3>
        <span className={cov.covered ? styles.cov : styles.covNo}>
          <Icon d={cov.covered ? ICON.sweep : ICON.unseen} />
          {cov.text}
        </span>
        <span className={styles.when}>{cov.when}</span>
      </div>
      <table className={styles.entries}>
        <thead>
          <tr>
            <th scope="col">Item, as the bill of quantities lists it</th>
            <th scope="col" className={styles.num}>
              Billed
            </th>
            <th scope="col" className={styles.num}>
              Counted
            </th>
            <th scope="col">Outcome</th>
            <th scope="col">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <Entry key={r.claim.id} report={report} row={r} order={i} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Entry({ report, row, order }: { report: Report; row: RoomRow; order: number }) {
  const { claim, result, room } = row;
  const item = claim.item as ItemKind;
  const unseen = result.outcome === "not_seen";
  const frames = unseen ? [] : framesFor(report, row);
  return (
    <tr>
      <td>
        <span className={styles.item}>{sentence(itemWord(item, claim.qty))}</span>
        <q className={styles.quote}>{claim.source_quote}</q>
      </td>
      <td className={styles.num} data-label="Billed">
        {claim.qty}
      </td>
      <td className={styles.num} data-label="Counted">
        {/* Not seen yet is never a number: the room wasn't judged, so a count would read as a zero. */}
        {unseen ? (
          <span className={`${styles.stamp} ${styles.stampNone}`} aria-label="Not counted">
            –
          </span>
        ) : (
          <span className={styles.stamp} style={{ animationDelay: `${order * 80}ms` }}>
            {result.counted}
          </span>
        )}
      </td>
      <td>
        <span className={`${styles.badge} ${styles[`badge_${result.outcome}`]}`}>
          <Icon d={result.outcome === "verified" ? ICON.tick : result.outcome === "short" ? ICON.gap : ICON.unseen} size={16} />
          {STAMP[result.outcome]}
        </span>
        {result.outcome === "short" && <span className={styles.gapNote}>{missingOf(row)} fewer than billed</span>}
      </td>
      <td className={styles.evCell}>
        {frames.length === 0 ? (
          <span className={styles.noEv}>No frames yet. Nothing is judged without footage.</span>
        ) : (
          <div className={styles.evs}>
            {frames.map(({ frame, masks }) => (
              <EvidenceFrame
                key={frame}
                frameUrl={frame}
                masks={masks}
                label={`Best frame, ${room.name}, ${masks.length} ${itemWord(item, masks.length)} outlined`}
              />
            ))}
            <span className={styles.evNote}>
              {result.counted} outlined · open frame
              {frames.length > 1 ? "s" : ""}
            </span>
          </div>
        )}
      </td>
    </tr>
  );
}

interface Step {
  key: string;
  label: string;
  text: string;
  action: React.ReactNode;
}

/** The next steps in the fixed band, one at a time. Builders clear gaps; buyers and banks see what to hold. */
function nextSteps(report: Report, view: View, shortRows: RoomRow[], unseenRooms: Room[], onChange: () => void): Step[] {
  const steps: Step[] = [];
  for (const room of unseenRooms) {
    const gap = report.gap_requests.find((g) => g.room_id === room.id && g.status !== "cleared");
    if (view === "builder") {
      steps.push({
        key: `gap-${room.id}`,
        label: gap ? "Next shot" : "Ask the site",
        text: gap?.text ?? `5 s of the ${room.name.toLowerCase()} clears it`,
        action: gap ? (
          <SendGapRequest projectId={report.project.id} roomId={room.id} text={gap.text} onSent={onChange} compact />
        ) : (
          <WriteGapRequest projectId={report.project.id} roomId={room.id} onWritten={onChange} compact />
        ),
      });
    } else {
      steps.push({
        key: `gap-${room.id}`,
        label: "Hold until filmed",
        text: `${room.name} isn't seen yet. ${gap ? "Footage has been requested." : "Nothing is judged without footage."}`,
        action: (
          <a className={styles.bandBtn} href={`#room-${room.id}`}>
            See the room
          </a>
        ),
      });
    }
  }
  for (const r of shortRows) {
    const n = missingOf(r);
    const letter = checkedLetter(report, r.claim.id);
    const toLetter = view === "bank" && letter;
    steps.push({
      key: `short-${r.claim.id}`,
      label: view === "builder" ? "Answer before buyers pay" : letter ? "Query letter ready" : "Hold this amount",
      text: `${r.room.name}: ${n} ${itemWord(r.claim.item as ItemKind, n)} fewer than billed`,
      action: (
        <a className={styles.bandBtn} href={toLetter ? `#letter-${r.claim.id}` : `#room-${r.room.id}`}>
          {toLetter ? "Read the letter" : "See the room"}
        </a>
      ),
    });
  }
  if (steps.length === 0)
    steps.push({
      key: "clear",
      label: "All clear",
      text: "Everything billed was counted, with frames.",
      action: null,
    });
  return steps;
}

function NextStep({ steps }: { steps: Step[] }) {
  const [i, setI] = useState(0);
  const step = steps[i % steps.length];
  return (
    <div className={styles.band}>
      <div className={styles.bandIn} key={step.key} aria-live="polite">
        <span className={styles.bandLabel}>
          <Icon d={ICON.sweep} size={16} />
          {step.label}
        </span>
        <span className={styles.bandText}>{step.text}</span>
        {steps.length > 1 && (
          <>
            <span className={styles.bandCount}>
              {(i % steps.length) + 1} of {steps.length}
            </span>
            <button type="button" className={styles.bandGhost} onClick={() => setI((n) => n + 1)}>
              Next step
            </button>
          </>
        )}
        {step.action}
      </div>
    </div>
  );
}

function GapPanel({ report, room, view, onChange }: { report: Report; room: Room; view: View; onChange: () => void }) {
  const gap = report.gap_requests.find((g) => g.room_id === room.id && g.status !== "cleared");
  return (
    <section className={styles.panel}>
      <h3 className={styles.panelTitle}>One short clip clears the {room.name.toLowerCase()}</h3>
      <p className={styles.ask}>{gap?.text ?? `Need 5 s of ${room.name.toLowerCase()}, from its room tag`}</p>
      {gap && gap.steps.length > 0 ? (
        <ol className={styles.steps}>
          {gap.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      ) : (
        <p className={styles.panelNote}>Start at the {room.name.toLowerCase()} room tag and pan slowly one way. Don&apos;t pan back.</p>
      )}
      {view === "builder" ? (
        gap ? (
          <SendGapRequest projectId={report.project.id} roomId={room.id} text={gap.text} onSent={onChange} />
        ) : (
          <WriteGapRequest projectId={report.project.id} roomId={room.id} onWritten={onChange} />
        )
      ) : (
        <span className={styles.panelNote}>{gap ? "Requested · waiting for footage" : "Not seen yet. Nothing is judged without footage."}</span>
      )}
    </section>
  );
}

function ShortPanel({ report, row, view }: { report: Report; row: RoomRow; view: View }) {
  const letter = checkedLetter(report, row.claim.id);
  if (view === "builder") {
    return (
      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>Buyers will see {row.room.name} as Short</h3>
        <p className={styles.letter}>{shortNote(row, row.claim.item as ItemKind)}</p>
      </section>
    );
  }
  // A letter whose citations don't all resolve is never shown.
  if (!letter) return null;
  return (
    <section className={styles.panel} id={`letter-${row.claim.id}`}>
      <h3 className={styles.panelTitle}>Draft query letter · {row.room.name}</h3>
      <p className={styles.letter}>{letter.body}</p>
      <span className={styles.cites}>
        <Icon d={ICON.seal} size={16} />
        {citationCount(letter)} citations re-checked: billed line, plan line, frames
      </span>
      <CopyButton text={letter.body} label="Copy letter" className={ui.secondaryButton} />
    </section>
  );
}

function NotChecked({ items }: { items: { claim: Claim; reason: NotCheckedReason; plan: Claim | undefined }[] }) {
  if (items.length === 0) return null;
  return (
    <section className={styles.panel} aria-labelledby="not-checked-title">
      <h3 id="not-checked-title" className={styles.panelTitle}>
        Not checked in this report
      </h3>
      <ul className={styles.ncList}>
        {items.map(({ claim, reason, plan }) => (
          <li key={claim.id}>
            <q>{claim.source_quote}</q>
            {plan && (
              <span className={styles.ncPlan}>
                Bill of quantities: <q>{plan.source_quote}</q>
              </span>
            )}
            <span className={styles.ncTag}>{NOT_CHECKED[reason]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The flat in 3D, tucked away: it's illustrative, the frames are the evidence. */
function Flat3D({ rows }: { rows: RoomRow[] }) {
  const [item, setItem] = useState<ItemKind>("window");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  // three.js is fetched and a WebGL context made only once someone opens this.
  const [open, setOpen] = useState(false);
  const rooms3d: Room3D[] = rows
    .filter((r) => r.claim.item === item)
    .map((r) => ({
      id: r.room.id,
      name: r.room.name,
      qty: r.claim.qty,
      counted: r.result.counted,
      outcome: r.result.outcome,
    }));
  return (
    <details className={styles.plan3d} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>See the flat in 3D</summary>
      {open && (
        <div className={styles.plan3dBody}>
          <ItemSwitch item={item} onChange={setItem} />
          <Plan3D
            rooms={rooms3d}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              document.getElementById(`room-${id}`)?.scrollIntoView({
                behavior: smooth ? "smooth" : "auto",
                block: "start",
              });
            }}
          />
          <span className={styles.note}>
            Not to scale. SiteProof counts what&apos;s in each room; it doesn&apos;t know the room&apos;s size or which wall each item is on, so this layout is
            illustrative. The frames above are the evidence.
          </span>
        </div>
      )}
    </details>
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
    body =
      boq && boq.status !== "failed"
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

/** Makes the room's gap request on the server; the report then shows it, ready to send. */
function WriteGapRequest({ projectId, roomId, onWritten, compact = false }: { projectId: string; roomId: string; onWritten: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={compact ? styles.sendCompact : styles.sendWrap}>
      <button
        type="button"
        className={compact ? styles.bandBtn : ui.markButton}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await data.requestFootage(projectId, roomId);
            onWritten();
          } catch (e) {
            setError(e instanceof DataError && e.status === 409 ? e.message : "Couldn't write the request. Try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Writing the request…" : "Write the request"}
      </button>
      <span className={styles.sendNote} role="status">
        {error ?? ""}
      </span>
    </div>
  );
}

/** Shares the phone page for this gap request (WhatsApp, on a phone), or copies its link. */
// The server marks a request sent when it's written, before the builder has shared it,
// so the button never says "Send again".
function SendGapRequest({
  projectId,
  roomId,
  text,
  onSent,
  compact = false,
}: {
  projectId: string;
  roomId: string;
  text: string;
  onSent: () => void;
  compact?: boolean;
}) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const [busy, setBusy] = useState(false);
  return (
    <div className={compact ? styles.sendCompact : styles.sendWrap}>
      <button
        type="button"
        className={compact ? styles.bandBtn : ui.markButton}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          // The site phone uploads into the project, so the link carries the builder link.
          const token = builderToken(projectId);
          const url = `${window.location.origin}/projects/${projectId}/rooms/${roomId}/request${token ? `#key=${encodeURIComponent(token)}` : ""}`;
          try {
            if (navigator.share) {
              await navigator.share({
                title: "SiteProof footage request",
                text,
                url,
              });
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
        {compact ? "Send to site" : "Send to site supervisor"}
      </button>
      <span className={styles.sendNote} role="status">
        {state === "copied" ? "Link copied. Paste it in WhatsApp." : state === "error" ? "Couldn't share. Try again." : ""}
      </span>
      {!compact && (
        <Link href={`/projects/${projectId}/rooms/${roomId}/request`} className={styles.sendPreview}>
          Open the request
        </Link>
      )}
    </div>
  );
}
