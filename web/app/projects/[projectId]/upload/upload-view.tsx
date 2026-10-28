"use client";

import type { Clip, Document, DocumentKind, ProjectOverview, Segment } from "@siteproof/contract";
import { Ban, Check, FileSpreadsheet, FileText, type LucideIcon, ReceiptIndianRupee, RotateCw, ScanQrCode, Undo2, Video, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AppHeader, captureTime, ErrorPanel, Loading, StaleNotice, ui, useOverview } from "@/components/ui";
import { CLIP_ACCEPT, DOCUMENT_ACCEPT, DropZone, type UploadItem, useUploads } from "@/components/uploads";
import { DOCUMENT_LABEL } from "../project-view";
import styles from "./upload.module.css";

export function UploadPage({ projectId }: { projectId: string }) {
  const { overview: report, error, stale, reload } = useOverview(projectId);
  if (error) {
    return (
      <>
        <AppHeader nav={{ current: "upload", projectId }} />
        <main className={ui.main}>
          <ErrorPanel error={error} retry={reload} />
        </main>
      </>
    );
  }
  if (!report) {
    return (
      <>
        <AppHeader nav={{ current: "upload", projectId }} />
        <Loading what="Loading the project" />
      </>
    );
  }
  return (
    <>
      <StaleNotice stale={stale} onRetry={reload} />
      <UploadView report={report} onSettled={reload} />
    </>
  );
}

const DOCUMENT_HINT: Record<DocumentKind, string> = {
  demand_letter: "bills one flat",
  invoice: "bills one flat",
  boq: "whole project",
};

function UploadView({ report, onSettled }: { report: ProjectOverview; onSettled: () => void }) {
  const { project } = report;
  const clips = useUploads(report.project.id, onSettled);
  const docs = useUploads(report.project.id, onSettled);
  const [kind, setKind] = useState<DocumentKind>("demand_letter");
  const [flatId, setFlatId] = useState<string>(project.flats[0]?.id ?? "");

  // A BOQ covers the whole project; a demand letter or invoice bills one flat.
  const wholeProject = kind === "boq";
  const flatLabel = (id: string) => `Flat ${project.flats.find((f) => f.id === id)?.name ?? ""}`;
  const clipNumber = new Map(report.clips.map((c, i) => [c.id, i + 1]));

  // This visit's uploads first, then everything already in the project.
  const sentClips = new Set(clips.items.map((x) => x.id));
  const sentDocs = new Set(docs.items.map((x) => x.id));
  const earlierClips = report.clips.filter((c) => !sentClips.has(c.id)).sort((a, b) => (b.captured_at ?? "").localeCompare(a.captured_at ?? ""));
  const earlierDocs = report.documents.filter((d) => !sentDocs.has(d.id));

  return (
    <>
      <AppHeader
        eyebrow={project.builder}
        title={project.name}
        nav={{ current: "upload", projectId: project.id, projectName: project.name, builder: project.builder }}
      />
      <main className={styles.main}>
        <div>
          <h1 className={styles.title}>Upload</h1>
          <p className={styles.lede}>Send the clips you already have, in any order. Nothing needs to be filmed specially. Each clip is placed by the room tags it passes.</p>
        </div>

        <div className={styles.trays}>
          <section className={styles.tray} aria-labelledby="clips-title">
            <div className={styles.trayHead}>
              <h2 id="clips-title">Clips</h2>
              <span>MP4 or MOV · WhatsApp is fine · up to 60 s</span>
            </div>
            <DropZone
              className={styles.drop}
              title="Add clips"
              hint="Tap to choose videos or film one now. On a computer, drop them here."
              accept={CLIP_ACCEPT}
              multiple
              onFiles={(files) => files.forEach((f) => clips.addClip(project.id, f))}
            />
            {(clips.items.length > 0 || earlierClips.length > 0) && (
              <ul className={styles.strip} aria-live="polite">
                {clips.items.map((x) => {
                  const clip = report.clips.find((c) => c.id === x.id);
                  return (
                    <ClipCard
                      key={x.key}
                      title={clip ? `Clip ${clipNumber.get(clip.id)}` : x.label}
                      when={clip ? captureTime(clip.captured_at) : x.detail}
                      item={x}
                      segments={x.id ? report.segments.filter((s) => s.clip_id === x.id) : []}
                      report={report}
                      onRetry={clips.retry}
                    />
                  );
                })}
                {earlierClips.map((c) => (
                  <ClipCard
                    key={c.id}
                    title={`Clip ${clipNumber.get(c.id)}`}
                    when={captureTime(c.captured_at)}
                    item={fromServer(c)}
                    segments={report.segments.filter((s) => s.clip_id === c.id)}
                    report={report}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className={styles.tray} aria-labelledby="docs-title">
            <div className={styles.trayHead}>
              <h2 id="docs-title">Documents</h2>
              <span>PDF</span>
            </div>
            <div className={styles.kinds} role="radiogroup" aria-label="Which document">
              {(Object.keys(DOCUMENT_LABEL) as DocumentKind[]).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={k === kind} className={styles.kind} onClick={() => setKind(k)}>
                  <span className={styles.kindIcon}>
                    <PageIcon kind={k} size={40} />
                  </span>
                  <b>{DOCUMENT_LABEL[k]}</b>
                  <small>{DOCUMENT_HINT[k]}</small>
                </button>
              ))}
            </div>
            <div className={styles.forFlat}>
              {wholeProject ? (
                <span>For the whole project</span>
              ) : project.flats.length > 1 ? (
                <label>
                  For{" "}
                  <select className={ui.select} value={flatId} onChange={(e) => setFlatId(e.target.value)}>
                    {project.flats.map((f) => (
                      <option key={f.id} value={f.id}>
                        Flat {f.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span>For {flatLabel(flatId)}</span>
              )}
            </div>
            <DropZone
              className={styles.drop}
              title={`Add the ${DOCUMENT_LABEL[kind].toLowerCase()}`}
              hint="The PDF the document was made from reads best."
              accept={DOCUMENT_ACCEPT}
              onFiles={(files) =>
                files.forEach((f) =>
                  docs.addDocument(
                    { project_id: project.id, flat_id: wholeProject ? null : flatId, kind },
                    f,
                    `${DOCUMENT_LABEL[kind]} · ${wholeProject ? "Whole project" : flatLabel(flatId)}`,
                  ),
                )
              }
            />
            {(docs.items.length > 0 || earlierDocs.length > 0) && (
              <ul className={styles.sheets} aria-live="polite">
                {docs.items.map((x) => (
                  <DocCard key={x.key} kind={x.docKind ?? "demand_letter"} title={x.detail ?? x.label} file={x.label} item={x} onRetry={docs.retry} />
                ))}
                {earlierDocs.map((d) => (
                  <DocCard key={d.id} kind={d.kind} title={`${DOCUMENT_LABEL[d.kind]} · ${d.flat_id ? flatLabel(d.flat_id) : "Whole project"}`} item={fromServer(d)} />
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className={styles.guide} aria-labelledby="guide-title">
          <h2 id="guide-title" className={styles.guideTitle}>
            Film a room so it can be fully checked
          </h2>
          <ol>
            <li>
              <GuidePic step={1} />
              <span>
                <b>Start at the room tag</b>In the doorway, with the tag in frame.
              </span>
            </li>
            <li>
              <GuidePic step={2} />
              <span>
                <b>Pan slowly, one way</b>Round the whole room once.
              </span>
            </li>
            <li>
              <GuidePic step={3} />
              <span>
                <b>Don&apos;t pan back</b>A clip that does still counts, but the room may stay Not seen yet.
              </span>
            </li>
          </ol>
        </section>

        <div className={ui.row}>
          <Link href={`/projects/${project.id}/report`} className={ui.primaryButton}>
            Open the report
          </Link>
          <Link href={`/projects/${project.id}`} className={ui.secondaryButton}>
            Back to project
          </Link>
        </div>
      </main>
    </>
  );
}

/** A clip or document already in the project, shaped like an upload so it draws the same way. */
function fromServer(x: Clip | Document): UploadItem {
  const reason = "reason" in x ? x.reason : null;
  return {
    key: x.id,
    label: x.id,
    kind: "reason" in x ? "document" : "clip",
    id: x.id,
    progress: 1,
    status: x.status,
    error: x.status === "failed" ? (reason ?? "This file couldn't be checked. Upload it again.") : null,
    retryable: false,
  };
}

type Stage = "done" | "now" | "failed" | "todo";

/**
 * Three stages from the one status SiteProof reports: sent, then checked or read, then
 * placed or done. A failure marks the stage it stopped at. Nothing here is guessed: a clip
 * is "placed" only once it is done, and its rooms come from its segments.
 */
function stages(item: UploadItem): Stage[] {
  const { status } = item;
  if (status === "uploading") return ["now", "todo", "todo"];
  if (status === "uploaded" || status === "processing") return ["done", "now", "todo"];
  if (status === "done") return ["done", "done", "done"];
  // Failed: before it was sent, or while it was being checked.
  return item.id === null ? ["failed", "todo", "todo"] : ["done", "failed", "todo"];
}

function Track({ item, labels }: { item: UploadItem; labels: [string, string, string] }) {
  const s = stages(item);
  return (
    <ol className={styles.track}>
      {labels.map((label, i) => (
        <li key={label} data-stage={s[i]}>
          {s[i] === "now" && item.status === "uploading" && i === 0 ? (
            <span
              className={styles.bar}
              role="progressbar"
              aria-label={`Sending ${item.label}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(item.progress * 100)}
            >
              <span style={{ width: `${Math.max(4, Math.round(item.progress * 100))}%` }} />
            </span>
          ) : (
            <span className={styles.bar} aria-hidden="true" />
          )}
          {s[i] === "now" && i === 0 ? `Sending ${Math.round(item.progress * 100)}%` : label}
        </li>
      ))}
    </ol>
  );
}

function ClipCard({
  title,
  when,
  item,
  segments,
  report,
  onRetry,
}: {
  title: string;
  when?: string;
  item: UploadItem;
  segments: Segment[];
  report: ProjectOverview;
  onRetry?: (key: string) => void;
}) {
  const several = report.project.flats.length > 1;
  const roomName = (id: string) => {
    const room = report.rooms.find((r) => r.id === id);
    if (!room) return "";
    const flat = report.project.flats.find((f) => f.id === room.flat);
    return several && flat ? `Flat ${flat.name} ${room.name}` : room.name;
  };
  // One chip per room: a complete sweep from the tag anywhere in the clip wins.
  const rooms = new Map<string, boolean>();
  for (const s of segments) if (s.room_id) rooms.set(s.room_id, (rooms.get(s.room_id) ?? false) || s.full_sweep);
  const unplaced = segments.some((s) => !s.room_id);

  return (
    <li className={styles.film}>
      <span className={styles.reel} aria-hidden="true">
        <Video size={26} strokeWidth={2} />
      </span>
      <div className={styles.filmBody}>
        <b className={styles.filmTitle}>{title}</b>
        {when && <small>{when}</small>}
        <Track item={item} labels={["Sent", "Checking", "Placed in rooms"]} />
        {item.status === "done" && (
          <div className={styles.places}>
            {[...rooms].map(([id, full]) => (
              <span key={id} className={styles.place} data-full={full}>
                {roomName(id)} · {full ? "one complete sweep" : "partly filmed"}
              </span>
            ))}
            {unplaced && <span className={styles.place}>{rooms.size ? "Part with no room tag" : "No room tag found"} · never used for a claim</span>}
          </div>
        )}
        {item.error && <p className={styles.error}>{item.error}</p>}
        {item.retryable && onRetry && (
          <button type="button" className={styles.retry} onClick={() => onRetry(item.key)}>
            Try again
          </button>
        )}
      </div>
    </li>
  );
}

function DocCard({ kind, title, file, item, onRetry }: { kind: DocumentKind; title: string; file?: string; item: UploadItem; onRetry?: (key: string) => void }) {
  const mark = item.status === "done" ? "done" : item.status === "failed" ? "failed" : "working";
  return (
    <li className={styles.sheet}>
      <span className={styles.docTile} aria-hidden="true">
        <PageIcon kind={kind} size={30} />
        <span className={styles.docMark} data-mark={mark}>
          {mark === "done" && <Check size={12} strokeWidth={3.5} />}
          {mark === "failed" && <X size={12} strokeWidth={3.5} />}
        </span>
      </span>
      <div className={styles.filmBody}>
        <b>{title}</b>
        {file && <small>{file}</small>}
        <Track item={item} labels={["Sent", "Reading", "Read"]} />
        {item.error && <p className={styles.error}>{item.error}</p>}
        {item.retryable && onRetry && (
          <button type="button" className={ui.secondaryButton} onClick={() => onRetry(item.key)}>
            Try again
          </button>
        )}
      </div>
    </li>
  );
}

const DOCUMENT_ICON: Record<DocumentKind, LucideIcon> = {
  demand_letter: FileText,
  invoice: ReceiptIndianRupee,
  boq: FileSpreadsheet,
};

function PageIcon({ kind, size }: { kind: DocumentKind; size: number }) {
  const Icon = DOCUMENT_ICON[kind];
  return <Icon size={size} strokeWidth={1.75} />;
}

/** The three filming steps: the tag in frame, one sweep round, never back. */
const GUIDE_ICON: Record<1 | 2 | 3, LucideIcon> = { 1: ScanQrCode, 2: RotateCw, 3: Undo2 };

function GuidePic({ step }: { step: 1 | 2 | 3 }) {
  const Icon = GUIDE_ICON[step];
  return (
    <span className={styles.guidePic} data-step={step} aria-hidden="true">
      <Icon size={28} strokeWidth={2} />
      {step === 3 && <Ban className={styles.guideBan} size={18} strokeWidth={2.5} />}
    </span>
  );
}
