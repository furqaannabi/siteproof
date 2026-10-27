"use client";

import type { ClipStatus } from "@siteproof/contract";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { data, DataError, usingMock } from "@/lib/data";
import type { Report } from "@/lib/types";
import styles from "./ui.module.css";

export function Brand() {
  return (
    <Link href="/" className={styles.brand}>
      <span className={styles.brandMark}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12l5 5L20 6" />
        </svg>
      </span>
      <span className={styles.brandName}>SiteProof</span>
    </Link>
  );
}

/** The top bar. `title` and `eyebrow` name where you are; `children` go on the right. */
export function AppHeader({ eyebrow, title, children }: { eyebrow?: string; title?: string; children?: React.ReactNode }) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Brand />
        {(eyebrow || title) && (
          <div className={styles.headerTitle}>
            {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
            {title && <span className={styles.headerMain}>{title}</span>}
          </div>
        )}
        {children}
      </div>
      {usingMock && <div className={styles.mockBar}>Demo data · nothing here is real site footage</div>}
    </header>
  );
}

/** Project / Upload / Report, with the current one marked. */
export function ProjectNav({ projectId, current }: { projectId: string; current: "project" | "upload" | "report" }) {
  const links = [
    { key: "project", href: `/projects/${projectId}`, label: "Project" },
    { key: "upload", href: `/projects/${projectId}/upload`, label: "Upload" },
    { key: "report", href: `/projects/${projectId}/report`, label: "Report" },
  ] as const;
  return (
    <nav aria-label="Project" className={styles.toggle}>
      {links.map((l) => (
        <Link key={l.key} href={l.href} aria-current={l.key === current ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

const STATUS_LABEL: Record<ClipStatus, string> = {
  uploaded: "Uploaded",
  processing: "Processing",
  done: "Done",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: ClipStatus | "uploading" }) {
  return (
    <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>{status === "uploading" ? "Uploading" : STATUS_LABEL[status]}</span>
  );
}

export function Loading({ what = "Loading" }: { what?: string }) {
  return (
    <div className={styles.loading} role="status">
      {what}…
    </div>
  );
}

export function ErrorPanel({ error, retry }: { error: unknown; retry?: () => void }) {
  const notFound = error instanceof DataError && error.status === 404;
  return (
    <div className={styles.errorPanel} role="alert">
      <strong>{notFound ? "We couldn't find this project." : "Something went wrong."}</strong>
      <span>{notFound ? "Check the link, or start a new project." : error instanceof Error ? error.message : "Try again in a moment."}</span>
      <div className={styles.row}>
        {retry && !notFound && (
          <button type="button" className={styles.secondaryButton} onClick={retry}>
            Try again
          </button>
        )}
        <Link href="/" className={styles.secondaryButton}>
          Back to projects
        </Link>
      </div>
    </div>
  );
}

const PENDING: ClipStatus[] = ["uploaded", "processing"];

/** Loads a project's report, and keeps reloading it while any clip or document is still being processed. */
export function useReport(projectId: string) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<unknown>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    try {
      const next = await data.getReport(projectId);
      setReport(next);
      setError(null);
      const busy = [...next.clips, ...next.documents].some((x) => PENDING.includes(x.status));
      if (busy) timer.current = setTimeout(reload, 3000);
    } catch (e) {
      setError(e);
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [reload]);

  return { report, error, reload };
}

export function captureTime(iso: string | null) {
  if (!iso) return "capture time unknown";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
}

export { styles as ui };
