"use client";

import type { ClipStatus } from "@siteproof/contract";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { data, DEMO_PROJECT_ID, resetMockData, usingMock } from "@/lib/data";
import type { Report } from "@/lib/types";
import s from "./projects.module.css";

const PENDING: ClipStatus[] = ["uploaded", "processing"];
const TALLY_SEGMENT_LIMIT = 40;

/** What one project's card says, worked out from its report the same way the report does. */
function summarise(report: Report) {
  const letter = report.documents.find((d) => d.kind === "demand_letter" && d.status !== "failed");
  const claim = report.claims.find((c) => c.doc_id === letter?.id && c.item === "window" && c.room_id === null && c.quote_verified);
  const rows = report.rooms.flatMap((room) => {
    const c = report.claims.find((x) => x.room_id === room.id && x.item === "window" && x.quote_verified);
    const r = c && report.results.find((x) => x.claim_id === c.id);
    return c && r ? [{ room, claim: c, result: r }] : [];
  });
  const seen = rows.filter((r) => r.result.outcome !== "not_seen").reduce((n, r) => n + Math.min(r.result.counted, r.claim.qty), 0);
  const short = rows.filter((r) => r.result.outcome === "short").reduce((n, r) => n + (r.claim.qty - r.result.counted), 0);
  const notSeen = rows.filter((r) => r.result.outcome === "not_seen").reduce((n, r) => n + r.claim.qty, 0);
  const todo = [
    ...rows.filter((r) => r.result.outcome === "not_seen").map((r) => `film the ${r.room.name.toLowerCase()}`),
    ...rows.filter((r) => r.result.outcome === "short").map((r) => `explain ${r.room.name}`),
  ];
  const checking = [...report.clips, ...report.documents].filter((x) => PENDING.includes(x.status)).length;
  return { letter, claimed: claim?.qty ?? null, seen, short, notSeen, todo, checking, judged: rows.length > 0 };
}

interface Loaded {
  report: Report;
  summary: ReturnType<typeof summarise>;
}

export function ProjectCards() {
  const [cards, setCards] = useState<Loaded[] | null>(null);
  const [listable, setListable] = useState(true);

  const load = useCallback(async () => {
    try {
      const projects = await data.listProjects();
      const reports = await Promise.all(projects.map((p) => data.getReport(p.id).catch(() => null)));
      setCards(reports.filter((r): r is Report => r !== null).map((report) => ({ report, summary: summarise(report) })));
    } catch {
      // The API has no list of projects yet; the page still offers setting one up.
      setListable(false);
      setCards([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <ul className={s.grid} aria-busy={cards === null}>
        <li className={s.addCard}>
          <h2 className={s.addTitle}>Set up a project</h2>
          <p>Name the flats and their rooms. SiteProof makes one printed tag per doorway, so every clip finds its room.</p>
          <Link href="/projects/new" className={s.markAction}>
            Set up a project
          </Link>
        </li>
        {cards === null && <li className={s.loading}>Loading your projects…</li>}
        {cards?.map(({ report, summary }) => (
          <li key={report.project.id} className={s.card}>
            <ProjectCard report={report} summary={summary} />
          </li>
        ))}
      </ul>

      {!listable && <p className={s.note}>Projects you set up open from their own link until the project list is connected.</p>}

      {usingMock && cards && cards.length > 0 && (
        <button
          type="button"
          className={s.reset}
          onClick={async () => {
            await resetMockData();
            setCards(null);
            void load();
          }}
        >
          Reset demo data
        </button>
      )}
    </>
  );
}

function ProjectCard({ report, summary }: Loaded) {
  const { project, flat, stage } = report;
  const { letter, claimed, seen, short, notSeen, todo, checking, judged } = summary;
  const base = `/projects/${project.id}`;
  const demo = project.id === DEMO_PROJECT_ID;

  return (
    <>
      <div className={s.cardHead}>
        <h2 className={s.cardTitle}>
          <Link href={base}>{project.name}</Link>
        </h2>
        <p className={s.cardMeta}>
          Flat {flat.name}
          {stage ? ` · ${stage}` : ""}
          {` · ${report.rooms.length} ${report.rooms.length === 1 ? "room" : "rooms"}`}
          {demo ? " · demo data" : ""}
        </p>
      </div>

      {claimed !== null && judged ? (
        <div className={s.count}>
          <p className={s.countLine}>
            <span className={s.countNumber}>{seen}</span> <span className={s.countOf}>of {claimed} windows verified</span>
          </p>
          {seen + short + notSeen <= TALLY_SEGMENT_LIMIT ? (
            <div className={s.tally} aria-hidden="true">
              {Array.from({ length: seen }, (_, i) => <span key={`v${i}`} className={s.tV} />)}
              {Array.from({ length: short }, (_, i) => <span key={`s${i}`} className={s.tS} />)}
              {Array.from({ length: notSeen }, (_, i) => <span key={`n${i}`} className={s.tN} />)}
            </div>
          ) : (
            <div className={s.tally} aria-hidden="true">
              {seen > 0 && <span className={s.tV} style={{ flexGrow: seen }} />}
              {short > 0 && <span className={s.tS} style={{ flexGrow: short }} />}
              {notSeen > 0 && <span className={s.tN} style={{ flexGrow: notSeen }} />}
            </div>
          )}
        </div>
      ) : (
        <p className={s.empty}>{letter ? "Reading the documents" : "No demand letter yet"}</p>
      )}

      <p className={s.next}>
        {checking > 0 && (
          <span className={s.checking}>
            Checking {checking} {checking === 1 ? "upload" : "uploads"}.{" "}
          </span>
        )}
        {!letter
          ? "Upload the demand letter and the bill of quantities to start."
          : todo.length > 0
            ? `${todo.length} open: ${todo.join(", ")}.`
            : judged
              ? "Nothing open."
              : "The report fills in as each document is read."}
      </p>

      <div className={s.actions}>
        {letter ? (
          <>
            <Link href={`${base}/report`} className={s.primaryAction}>
              Open the report
            </Link>
            <Link href={`${base}/upload`} className={s.secondaryAction}>
              Upload
            </Link>
          </>
        ) : (
          <>
            <Link href={`${base}/upload`} className={s.primaryAction}>
              Upload
            </Link>
            <Link href={base} className={s.secondaryAction}>
              Room tags
            </Link>
          </>
        )}
      </div>
    </>
  );
}
