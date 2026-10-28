"use client";

import type { ClipStatus, ItemKind, Outcome, ProjectOverview, Report } from "@siteproof/contract";
import { EyeOff, FileText, LoaderCircle, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { data, DEMO_PROJECT_ID, resetMockData, usingMock } from "@/lib/data";
import { autoLayout } from "@/lib/room-layout";
import { allRows, checkedLetter, itemWord, type RoomRow } from "./[projectId]/report/report-view";
import s from "./projects.module.css";

const PENDING: ClipStatus[] = ["uploaded", "processing"];
// Past this many to-dos, the rest wait behind "Show all".
const FIRST_TODOS = 6;

/** What one flat's row says, worked out from its report the same way the report does. */
function summarise(report: Report, overview: ProjectOverview) {
  const letter = report.documents.find((d) => d.kind === "demand_letter" && d.status !== "failed");
  const claim = report.claims.find((c) => c.doc_id === letter?.id && c.item === "window" && c.room_id === null && c.quote_verified);
  const rows = allRows(report);
  const windows = rows.filter((r) => r.claim.item === "window");
  const seen = windows.filter((r) => r.result.outcome !== "not_seen").reduce((n, r) => n + Math.min(r.result.counted, r.claim.qty), 0);
  const short = windows.filter((r) => r.result.outcome === "short").reduce((n, r) => n + (r.claim.qty - r.result.counted), 0);
  const notSeen = windows.filter((r) => r.result.outcome === "not_seen").reduce((n, r) => n + r.claim.qty, 0);
  // Clips belong to the project, not a flat, so every flat counts the project's.
  const checking = [...overview.clips, ...report.documents].filter((x) => PENDING.includes(x.status)).length;
  return { letter, claimed: claim?.qty ?? null, seen, short, notSeen, checking, rows };
}

interface Loaded {
  report: Report;
  /** The project has more than one flat, so links name which. */
  oneOfMany: boolean;
  summary: ReturnType<typeof summarise>;
}

interface Todo {
  key: string;
  kind: "not_seen" | "short" | "documents";
  where: string;
  title: string;
  detail: string;
  href: string;
  action: string;
}

/**
 * What needs the builder, across every flat: rooms not seen yet, rooms that are Short, and
 * flats still waiting for their papers. The same rules as the report's next steps.
 */
function todosFor({ report, summary, oneOfMany }: Loaded): Todo[] {
  const base = `/projects/${report.project.id}`;
  const reportAt = (roomId: string) => `${base}/report${oneOfMany ? `?flat=${report.flat.id}` : ""}#room-${roomId}`;
  const flat = `Flat ${report.flat.name}`;
  if (!summary.letter) {
    return [
      {
        key: `docs-${report.flat.id}`,
        kind: "documents",
        where: flat,
        title: "Upload the demand letter and the bill of quantities",
        detail: "Nothing can be checked until they're read.",
        href: `${base}/upload`,
        action: "Upload",
      },
    ];
  }
  const todos: Todo[] = [];
  const unseen = report.rooms.filter((room) => summary.rows.some((r) => r.room.id === room.id && r.result.outcome === "not_seen"));
  for (const room of unseen) {
    const gap = report.gap_requests.find((g) => g.room_id === room.id && g.status !== "cleared");
    todos.push({
      key: `unseen-${room.id}`,
      kind: "not_seen",
      where: `${flat} · ${room.name} · Not seen yet`,
      title: gap?.text ?? `5 s of the ${room.name.toLowerCase()} clears it`,
      detail: gap?.status === "sent" ? "Sent to the site. Waiting for the clip." : "One sweep from its room tag clears it.",
      href: reportAt(room.id),
      action: gap?.status === "sent" ? "See the room" : "Ask the site",
    });
  }
  for (const r of summary.rows.filter((x: RoomRow) => x.result.outcome === "short")) {
    const item = r.claim.item as ItemKind;
    const letter = checkedLetter(report, r.claim.id);
    todos.push({
      key: `short-${r.claim.id}`,
      kind: "short",
      where: `${flat} · ${r.room.name} · Short`,
      title: `${r.result.counted} of ${r.claim.qty} ${itemWord(item, r.claim.qty)} seen`,
      detail: letter ? "Fully covered. A query letter is drafted, citing the bill line and the frames." : "Fully covered, and fewer seen than billed.",
      href: reportAt(r.room.id),
      action: "See the room",
    });
  }
  return todos;
}

export function ProjectCards() {
  const [cards, setCards] = useState<Loaded[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const projects = await data.listProjects();
      // One row per flat: each project's overview, then each of its flats' reports.
      const perProject = await Promise.all(
        projects.map(async (p): Promise<Loaded[]> => {
          const overview = await data.getOverview(p.id).catch(() => null);
          if (!overview) return [];
          const reports = await Promise.all(overview.project.flats.map((f) => data.getFlatReport(p.id, f.id).catch(() => null)));
          return reports
            .filter((r): r is Report => r !== null)
            .map((report) => ({ report, oneOfMany: overview.project.flats.length > 1, summary: summarise(report, overview) }));
        }),
      );
      setCards(perProject.flat());
    } catch {
      setCards([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const todos = cards?.flatMap(todosFor) ?? [];
  const shown = showAll ? todos : todos.slice(0, FIRST_TODOS);

  return (
    <>
      <div className={s.cols} aria-busy={cards === null}>
        <section aria-labelledby="needs-you">
          <h2 id="needs-you" className={s.secTitle}>
            Needs you {todos.length > 0 && <span className={s.count}>{todos.length}</span>}
          </h2>
          <div className={s.box}>
            {cards === null ? (
              <p className={s.quiet}>Loading your projects…</p>
            ) : todos.length === 0 ? (
              <p className={s.quiet}>Nothing needs you right now. Everything is verified, being checked, or waiting on footage you&apos;ve asked for.</p>
            ) : (
              <ul className={s.todos}>
                {shown.map((t) => (
                  <li key={t.key} className={s.todo} data-kind={t.kind}>
                    <span className={s.todoIcon} aria-hidden="true">
                      {t.kind === "not_seen" ? <EyeOff size={22} /> : t.kind === "short" ? <Minus size={22} /> : <FileText size={22} />}
                    </span>
                    <div className={s.todoText}>
                      <span className={s.where}>{t.where}</span>
                      <b>{t.title}</b>
                      <span>{t.detail}</span>
                    </div>
                    <Link href={t.href} className={t.kind === "not_seen" ? s.markAction : t.kind === "documents" ? s.primaryAction : s.secondaryAction}>
                      {t.action}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {todos.length > FIRST_TODOS && (
              <button type="button" className={s.showAll} onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show fewer" : `Show all ${todos.length}`}
              </button>
            )}
          </div>
        </section>

        <section aria-labelledby="flats">
          <h2 id="flats" className={s.secTitle}>
            Flats
          </h2>
          <div className={s.box}>
            {cards === null && <p className={s.quiet}>Loading…</p>}
            <ul className={s.flats}>
              {cards?.map((c) => (
                <li key={c.report.flat.id}>
                  <FlatRow {...c} />
                </li>
              ))}
            </ul>
            <div className={s.addRow}>
              <Link href="/projects/new" className={s.secondaryAction}>
                <Plus size={18} aria-hidden="true" />
                Set up a project
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* There is no list of projects in the API: this page lists the ones opened on this phone. */}
      {!usingMock && cards?.length === 0 && <p className={s.note}>Open a project&apos;s builder link on this phone and it appears here.</p>}

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

function FlatRow({ report, summary }: Loaded) {
  const { project, flat } = report;
  const { letter, claimed, seen, short, notSeen, checking, rows } = summary;
  const judged = rows.length > 0;
  const demo = project.id === DEMO_PROJECT_ID;
  const state = (roomId: string): Outcome | null => {
    const mine = rows.filter((r) => r.room.id === roomId);
    if (mine.length === 0) return null;
    if (mine.some((r) => r.result.outcome === "not_seen")) return "not_seen";
    if (mine.some((r) => r.result.outcome === "short")) return "short";
    return "verified";
  };

  return (
    <Link href={`/projects/${project.id}`} className={s.flat}>
      <MiniPlan states={report.rooms.map((r) => state(r.id))} />
      <span className={s.flatText}>
        <b>Flat {flat.name}</b>
        <span className={s.flatMeta}>
          {project.name}
          {demo ? " · demo data" : ""}
        </span>
        {claimed !== null && judged ? (
          <>
            <span className={s.flatCount}>
              {seen} of {claimed} windows verified
            </span>
            <span className={s.tally} aria-hidden="true">
              {seen > 0 && <i className={s.tV} style={{ flexGrow: seen }} />}
              {short > 0 && <i className={s.tS} style={{ flexGrow: short }} />}
              {notSeen > 0 && <i className={s.tN} style={{ flexGrow: notSeen }} />}
            </span>
          </>
        ) : (
          <span className={s.flatCount}>{letter ? "Reading the documents" : "No demand letter yet"}</span>
        )}
        {checking > 0 && (
          <span className={s.checking}>
            <LoaderCircle size={14} aria-hidden="true" />
            Checking {checking} {checking === 1 ? "upload" : "uploads"}
          </span>
        )}
      </span>
    </Link>
  );
}

const CELL = 10;

/** The flat's rooms from above, at an angle, each coloured by its outcome. Not to scale. */
function MiniPlan({ states }: { states: (Outcome | null)[] }) {
  const rects = autoLayout(states.length, CELL, CELL);
  const iso = (x: number, z: number) => [(x - z) * 0.866, (x + z) * 0.5] as const;
  const corners = rects.flatMap((r) => [iso(r.x, r.z), iso(r.x + r.w, r.z), iso(r.x + r.w, r.z + r.d), iso(r.x, r.z + r.d)]);
  if (corners.length === 0) return <span className={s.mini} />;
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const [minX, minY] = [Math.min(...xs) - 2, Math.min(...ys) - 2];
  return (
    <svg className={s.mini} viewBox={`${minX} ${minY} ${Math.max(...xs) - minX + 2} ${Math.max(...ys) - minY + 2}`} aria-hidden="true">
      {rects.map((r, i) => {
        const pts = [iso(r.x, r.z), iso(r.x + r.w, r.z), iso(r.x + r.w, r.z + r.d), iso(r.x, r.z + r.d)].map((p) => p.join(",")).join(" ");
        return <polygon key={i} points={pts} className={s.miniRoom} data-state={states[i] ?? "none"} />;
      })}
    </svg>
  );
}
