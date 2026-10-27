"use client";

import type { Claim, Detection, ItemKind, Outcome, Result, Room, Segment } from "@siteproof/contract";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EvidenceFrame } from "@/components/evidence-frame";
import { AppHeader, captureTime, ErrorPanel, Loading, ProjectNav, ui, useReport } from "@/components/ui";
import { data } from "@/lib/data";
import type { Report } from "@/lib/types";
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

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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

/** Not seen yet is never a number: the room wasn't judged, so a count would read as a zero. */
function countedText(row: RoomRow) {
  return row.result.outcome === "not_seen" ? "–" : String(row.result.counted);
}

function coverageText(segments: Segment[]) {
  if (segments.some((s) => s.full_sweep)) return "Full sweep";
  if (segments.length > 0) return "Partial pan";
  return "Not filmed";
}

function seconds(t: number) {
  const s = Math.round(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function clipCaption(report: Report, row: RoomRow) {
  const sweep = row.segments.find((s) => s.full_sweep);
  if (sweep) {
    const clip = report.clips.find((c) => c.id === sweep.clip_id);
    return `Clip filmed ${captureTime(clip?.captured_at ?? null)} · one-way sweep ${seconds(sweep.t_start)}–${seconds(sweep.t_end)} · best frame per object`;
  }
  if (row.segments.length > 0) return "Only a partial pan reached this room, and it didn't start at its door tag.";
  return "No clip has passed this room's door tag yet.";
}

function summary(row: RoomRow, item: ItemKind) {
  const { claim, result, room } = row;
  if (result.outcome === "verified") {
    return claim.qty === 1
      ? `The 1 ${ITEM_SINGULAR[item]} in the plan was found and tracked in a full sweep from the door tag.`
      : `All ${claim.qty} ${ITEM_PLURAL[item]} in the plan were found and tracked in one sweep from the door tag. Each one is outlined in its best frame.`;
  }
  if (result.outcome === "short") {
    return `One complete sweep from the ${room.name} door tag covered the whole room and found ${result.counted} of the ${claim.qty} ${ITEM_PLURAL[item]} in the plan. Because the room is fully covered, the gap counts as Short.`;
  }
  return `${room.name} hasn't been covered well enough to judge, so it stays Not seen yet. Nothing is wrong. We just need 5 seconds of footage.`;
}

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
  const { report, error, reload } = useReport(projectId);
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
  return <ReportView report={report} onChange={reload} />;
}

function ReportView({ report, onChange }: { report: Report; onChange: () => void }) {
  const [view, setView] = useState<View>("builder");
  const [item, setItem] = useState<ItemKind>("window");
  const [planMode, setPlanMode] = useState<"plan" | "3d">("plan");
  const rows = roomRows(report, item);
  const rooms3d: Room3D[] = useMemo(
    () => rows.map((r) => ({ id: r.room.id, name: r.room.name, qty: r.claim.qty, counted: r.result.counted, outcome: r.result.outcome })),
    // rows is rebuilt every render; these are the values it is made from.
    [report, item],
  );
  const [selectedId, setSelectedId] = useState<string>(
    () => roomRows(report, "window").find((r) => r.result.outcome === "short")?.room.id ?? report.rooms[0]?.id ?? "",
  );
  const selected = rows.find((r) => r.room.id === selectedId) ?? rows[0];

  const letter = report.documents.find((d) => d.kind === "demand_letter");
  const letterClaim = report.claims.find((c) => c.doc_id === letter?.id && c.item === item && c.room_id === null);
  const notCountable = report.claims.filter((c) => c.doc_id === letter?.id && c.item === "not_countable" && c.quote_verified);

  // Objects counted with frames, in rooms that were judged; the gap in covered rooms; everything in rooms not seen yet.
  const seen = rows.filter((r) => r.result.outcome !== "not_seen").reduce((n, r) => n + Math.min(r.result.counted, r.claim.qty), 0);
  const short = rows.filter((r) => r.result.outcome === "short").reduce((n, r) => n + (r.claim.qty - r.result.counted), 0);
  const notSeen = rows.filter((r) => r.result.outcome === "not_seen").reduce((n, r) => n + r.claim.qty, 0);
  const claimed = letterClaim?.quote_verified ? letterClaim.qty : null;

  const gapRooms = rows.filter((r) => r.result.outcome === "not_seen");
  const shortRooms = rows.filter((r) => r.result.outcome === "short");
  const gap = selected && report.gap_requests.find((g) => g.room_id === selected.room.id);
  const letterForSelected =
    selected && report.query_letters.find((q) => q.claim_id === selected.claim.id && q.citations_rechecked);
  const flat = `Flat ${report.flat.name}`;

  const clearParts = [
    gapRooms.length > 0 && `${gapRooms.length} short clip${gapRooms.length === 1 ? "" : "s"}`,
    shortRooms.length > 0 && `${shortRooms.length} answer${shortRooms.length === 1 ? "" : "s"}`,
  ].filter(Boolean);
  const clearDetail = [
    gapRooms.length > 0 && `film 5 s of ${gapRooms.map((r) => `the ${r.room.name.toLowerCase()}`).join(", ")}`,
    shortRooms.length > 0 &&
      `resolve ${shortRooms.map((r) => `${r.claim.qty - r.result.counted} ${itemWord(item, r.claim.qty - r.result.counted)} in ${r.room.name}`).join(", ")}`,
  ].filter(Boolean);

  return (
    <div className={styles.page}>
      <AppHeader eyebrow={report.project.name} title={`${flat}${report.stage ? ` · ${report.stage}` : ""} · Windows & doors`}>
        <div role="group" aria-label="Report view" className={ui.toggle}>
          <button type="button" aria-pressed={view === "builder"} onClick={() => setView("builder")}>
            Builder view
          </button>
          <button type="button" aria-pressed={view === "bank"} onClick={() => setView("bank")}>
            Buyer / bank view
          </button>
        </div>
        {view === "builder" && <ProjectNav projectId={report.project.id} current="report" />}
        <button type="button" className={ui.primaryButton} onClick={() => window.print()}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
          </svg>
          Export PDF
        </button>
      </AppHeader>

      <main className={styles.main}>
        <div role="group" aria-label="Item" className={styles.itemTabs}>
          {(["window", "door"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={item === k} onClick={() => setItem(k)}>
              {ITEM_PLURAL[k][0].toUpperCase() + ITEM_PLURAL[k].slice(1)}
            </button>
          ))}
        </div>

        {!letter || rows.length === 0 ? (
          <NothingToJudge report={report} hasLetter={Boolean(letter)} />
        ) : (
        <>
        <section className={styles.hero}>
          <div className={styles.heroMain}>
            <span className={styles.eyebrow}>Claim checked · Demand letter</span>
            {claimed === null ? (
              <h1 className={styles.heroTitle}>The letter&apos;s {ITEM_PLURAL[item]} line couldn&apos;t be checked word for word</h1>
            ) : (
              <h1 className={styles.heroTitle}>
                {seen} <span className={styles.heroOf}>of</span> {claimed} {ITEM_PLURAL[item]} verified
              </h1>
            )}
            {claimed !== null && (
              <>
                <div className={styles.tally} aria-hidden="true">
                  {Array.from({ length: seen }, (_, i) => <span key={`v${i}`} className={styles.tallyVerified} />)}
                  {Array.from({ length: short }, (_, i) => <span key={`s${i}`} className={styles.tallyShort} />)}
                  {Array.from({ length: notSeen }, (_, i) => <span key={`n${i}`} className={styles.tallyNotSeen} />)}
                </div>
                <div className={styles.legend}>
                  <span><span className={styles.keyVerified} />Verified {seen}</span>
                  <span><span className={styles.keyShort} />Short {short}</span>
                  <span><span className={styles.keyNotSeen} />Not seen yet {notSeen}</span>
                </div>
              </>
            )}
          </div>

          {view === "builder" ? (
            <div className={styles.callout}>
              <span className={styles.calloutEyebrowShort}>To clear the rest</span>
              <span className={styles.calloutTitle}>{clearParts.length > 0 ? clearParts.join(" + ") : "Nothing left to clear"}</span>
              <span className={styles.calloutBody}>
                {clearDetail.length > 0 ? `${sentence(clearDetail.join(" and "))}. ` : ""}Buyers see this report before they pay.
              </span>
            </div>
          ) : (
            <div className={styles.callout}>
              <span className={styles.calloutEyebrowVerified}>Backed by evidence</span>
              <span className={styles.calloutTitle}>
                {seen} / {claimed ?? "–"} {ITEM_PLURAL[item]} verified with frames
              </span>
              <span className={styles.calloutBody}>Every verified item links to its frames. Hold the rest until the builder answers.</span>
            </div>
          )}
        </section>

        <section className={styles.columns}>
          <div className={styles.planColumn}>
            <div className={styles.planHeading}>
              <h2 className={styles.h2}>Rooms</h2>
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
                <Plan3D rooms={rooms3d} selectedId={selected?.room.id} onSelect={setSelectedId} />
                <div role="group" aria-label="Choose a room" className={styles.roomChips}>
                  {rows.map((r) => (
                    <button key={r.room.id} type="button" aria-pressed={r.room.id === selected?.room.id} onClick={() => setSelectedId(r.room.id)}>
                      <span className={`${styles.chipDot} ${styles[`dot_${r.result.outcome}`]}`} aria-hidden="true" />
                      {r.room.name}
                    </button>
                  ))}
                </div>
                <span className={styles.note}>
                  Not to scale. SiteProof counts the {ITEM_PLURAL[item]} in each room; it doesn&apos;t know the room&apos;s size or which wall each one is on, so
                  the layout and markers here are illustrative. The frames are the evidence.
                </span>
              </>
            ) : (
            <>
            <div className={styles.plan}>
              <div className={styles.planGrid}>
                {rows.map((r) => (
                  <button
                    key={r.room.id}
                    type="button"
                    aria-pressed={r.room.id === selected?.room.id}
                    onClick={() => setSelectedId(r.room.id)}
                    className={`${styles.planRoom} ${styles[`plan_${r.result.outcome}`]}`}
                  >
                    <span className={styles.planRoomName}>{r.room.name}</span>
                    <span className={styles.planRoomFoot}>
                      <span className={styles.planCount}>
                        {countedText(r)} / {r.claim.qty}
                      </span>
                      <span className={`${styles.planLabel} ${styles[`label_${r.result.outcome}`]}`}>{outcomeLabel(r)}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className={styles.titleBlock}>
                <div><span>FLAT</span><span>{report.flat.name}</span></div>
                <div><span>ITEM</span><span>{ITEM_PLURAL[item]}</span></div>
                <div><span>ROOMS</span><span>{rows.length}</span></div>
                <div><span>STATUS</span><span className={styles.titleBlockStage}>{report.stage}</span></div>
              </div>
            </div>
            <span className={styles.note}>
              Hatched rooms haven&apos;t had one complete sweep from their door tag yet, so SiteProof doesn&apos;t judge them.
            </span>
            </>
            )}
          </div>

          {selected && (
            <article className={styles.detail}>
              <div className={styles.detailHead}>
                <div>
                  <span className={styles.eyebrow}>{flat}</span>
                  <h2 className={styles.detailTitle}>{selected.room.name}</h2>
                </div>
                <span className={`${styles.stamp} ${styles[`stamp_${selected.result.outcome}`]}`}>{STAMP[selected.result.outcome]}</span>
              </div>

              <div className={styles.detailBody}>
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

                {selected.result.outcome === "not_seen" ? (
                  <div className={styles.noFrame}>
                    <span className={styles.noFrameTitle}>No complete sweep yet</span>
                    <span>{clipCaption(report, selected)}</span>
                  </div>
                ) : (
                  framesFor(report, selected).map(({ frame, masks }) => (
                    <figure key={frame} className={styles.figure}>
                      <EvidenceFrame
                        frameUrl={frame}
                        masks={masks}
                        label={`Best frame, ${selected.room.name}, ${masks.length} ${itemWord(item, masks.length)} outlined`}
                        badge={`Tracked · ${masks.length} outlined`}
                      />
                      <figcaption className={styles.monoNote}>{clipCaption(report, selected)}</figcaption>
                    </figure>
                  ))
                )}

                <p className={styles.summary}>{summary(selected, item)}</p>

                <div className={styles.sources}>
                  <span className={styles.label}>Where the claim comes from</span>
                  <div className={styles.sourceRow}>
                    {letterClaim && (
                      <Source title="Demand letter" claim={letterClaim} />
                    )}
                    <Source title="Bill of quantities" claim={selected.claim} />
                  </div>
                </div>

                {selected.result.outcome === "not_seen" && gap && (
                  <div className={styles.shot}>
                    <span className={styles.shotIcon}>
                      <Camera />
                    </span>
                    <div className={styles.shotText}>
                      <span className={styles.shotEyebrow}>Footage request</span>
                      <span className={styles.shotTitle}>{gap.text}</span>
                      <span className={styles.shotHint}>Start at the {selected.room.name.toLowerCase()} door tag and pan slowly one way. Don&apos;t pan back.</span>
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
                    <div className={styles.queryHead}>
                      <span className={styles.queryEyebrow}>Draft query letter</span>
                      <span className={styles.queryChecked}>{letterForSelected.citation_count} citations re-checked</span>
                    </div>
                    <p>{letterForSelected.body}</p>
                    <div className={styles.queryActions}>
                      <CopyButton text={letterForSelected.body} label="Copy letter" />
                    </div>
                  </div>
                )}

                {selected.result.outcome === "short" && view === "builder" && (
                  <div className={styles.query}>
                    <span className={styles.queryEyebrow}>Buyers will see this as Short</span>
                    <p>
                      {selected.claim.qty - selected.result.counted} {itemWord(item, selected.claim.qty - selected.result.counted)} weren&apos;t found in a complete sweep. If they&apos;re installed somewhere the sweep missed, film one slow sweep from the {selected.room.name} door tag. If they&apos;re pending, update the demand letter before buyers pay.
                    </p>
                  </div>
                )}
              </div>
            </article>
          )}
        </section>

        </>
        )}

        {notCountable.length > 0 && (
          <section className={styles.notCountable}>
            <h2 className={styles.h2}>Also in this demand letter</h2>
            <ul>
              {notCountable.map((c) => (
                <li key={c.id}>
                  <span className={styles.quote}>&ldquo;{c.source_quote}&rdquo;</span>
                  <span className={styles.notCountableTag}>Not checked from footage in this version</span>
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

function NothingToJudge({ report, hasLetter }: { report: Report; hasLetter: boolean }) {
  const reading = report.documents.some((d) => d.kind === "demand_letter" && (d.status === "uploaded" || d.status === "processing"));
  const failed = report.documents.some((d) => d.kind === "demand_letter" && d.status === "failed");
  let title = "No demand letter yet";
  let body = "Upload the demand letter and the bill of quantities, then the clips. The report fills in as each one is read.";
  if (reading) {
    title = "Reading the demand letter";
    body = "This usually takes a minute. The page updates by itself.";
  } else if (failed) {
    title = "The demand letter couldn't be read";
    body = "Upload a clearer copy, ideally the PDF the letter was made from rather than a photo or scan.";
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
      {!reading && (
        <Link href={`/projects/${report.project.id}/upload`} className={ui.primaryButton}>
          Upload documents and clips
        </Link>
      )}
    </section>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={ui.primaryButton}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
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
          const url = `${window.location.origin}/projects/${projectId}/rooms/${roomId}/request`;
          try {
            if (navigator.share) {
              await navigator.share({ title: "SiteProof footage request", text, url });
            } else {
              await navigator.clipboard.writeText(`${text}: ${url}`);
              setState("copied");
            }
            await data.requestFootage(roomId).catch(() => undefined);
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
        Open on this phone
      </Link>
    </div>
  );
}

