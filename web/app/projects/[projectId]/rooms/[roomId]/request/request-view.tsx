"use client";

import Link from "next/link";
import { useCallback } from "react";
import { usingMock } from "@/lib/data";
import { ErrorPanel, Loading, useReport } from "@/components/ui";
import { CLIP_ACCEPT, UploadList, useUploads } from "@/components/uploads";
import type { Report } from "@/lib/types";
import styles from "./request.module.css";

export function RequestPage({ projectId, roomId }: { projectId: string; roomId: string }) {
  const { report, error, reload } = useReport(projectId);
  if (error) {
    return (
      <main className={styles.screen}>
        <ErrorPanel error={error} retry={reload} />
      </main>
    );
  }
  if (!report) return <Loading what="Loading the request" />;
  return <RequestView report={report} roomId={roomId} onSettled={reload} />;
}

function RequestView({ report, roomId, onSettled }: { report: Report; roomId: string; onSettled: () => void }) {
  const settled = useCallback(() => onSettled(), [onSettled]);
  const uploads = useUploads(settled);
  const room = report.rooms.find((r) => r.id === roomId);
  const flat = report.project.flats.find((f) => f.id === room?.flat);
  const gap = report.gap_requests.find((g) => g.room_id === roomId);
  const roomName = room?.name ?? "this room";
  const lower = roomName.toLowerCase();
  const sentDone = uploads.items.some((x) => x.status === "done");
  const reportHref = `/projects/${report.project.id}/report`;

  return (
    <main className={styles.screen}>
      <div className={styles.top}>
        <Link href={reportHref} className={styles.brand}>
          <span className={styles.brandMark}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12l5 5L20 6" />
            </svg>
          </span>
          <span>SiteProof</span>
        </Link>
        <span className={styles.flat}>{flat ? `Flat ${flat.name}` : ""}</span>
      </div>

      {!room ? (
        <div className={styles.done}>
          <h1 className={styles.title}>This room isn&apos;t in the project</h1>
          <p>The link may be out of date. Ask for a new one.</p>
        </div>
      ) : !gap ? (
        <div className={styles.done}>
          <span className={styles.eyebrow}>{sentDone ? "Thank you" : "Nothing needed"}</span>
          <h1 className={styles.title}>{sentDone ? `${roomName} is covered now` : `No footage needed for ${lower}`}</h1>
          <p>{sentDone ? "The clip was checked and the report is updated." : "This room has already been covered by a complete sweep."}</p>
          <Link href={reportHref} className={styles.cta}>
            See the report
          </Link>
        </div>
      ) : (
        <>
          <div className={styles.heading}>
            <span className={styles.eyebrow}>1 shot clears the {lower}</span>
            <h1 className={styles.title}>{gap.text}</h1>
          </div>

          <div className={styles.viewfinder} aria-hidden="true">
            <span className={`${styles.corner} ${styles.tl}`} />
            <span className={`${styles.corner} ${styles.tr}`} />
            <span className={`${styles.corner} ${styles.bl}`} />
            <span className={`${styles.corner} ${styles.br}`} />
            <div className={styles.tagMock}>
              <span className={styles.tagSquare} />
              <span className={styles.tagLabel}>Start at the {lower} door tag</span>
            </div>
            <div className={styles.sweep}>
              <span>door</span>
              <span className={styles.sweepLine} />
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 5l7 7-7 7" />
              </svg>
              <span>one way</span>
            </div>
            <span className={styles.panHint}>Pan slowly, one way only</span>
          </div>

          <ol className={styles.steps}>
            {gap.steps.map((s, i) => (
              <li key={s}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {s}
              </li>
            ))}
          </ol>

          <div className={styles.actions}>
            <UploadList items={uploads.items} />
            <label className={styles.cta}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8h3l2-3h8l2 3h3v11H3z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              {uploads.items.length > 0 ? "Record or upload another" : "Record or upload clip"}
              <input
                type="file"
                accept={CLIP_ACCEPT}
                capture="environment"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // In the mock, the clip is credited to this room. The real pipeline reads the room tag in the footage.
                  if (file) uploads.addClip(report.project.id, file, usingMock ? roomId : null);
                  e.target.value = "";
                }}
              />
            </label>
            <span className={styles.small}>Any phone video works. WhatsApp clips are fine.</span>
          </div>
        </>
      )}
    </main>
  );
}
