"use client";

import type { ClipStatus } from "@siteproof/contract";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { data, DataError, usingMock } from "@/lib/data";
import type { Report } from "@/lib/types";
import styles from "./ui.module.css";

export function Brand() {
  return (
    <Link href="/projects" className={styles.brand}>
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
      {usingMock && <div className={styles.mockBar}>Demo data · not real site footage</div>}
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
    <nav aria-label="Project" className={styles.projectNav}>
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
  const { title, body, retry: canRetry } = describeError(error);
  return (
    <div className={styles.errorPanel} role="alert">
      <strong>{title}</strong>
      <span>{body}</span>
      <div className={styles.row}>
        {retry && canRetry && (
          <button type="button" className={styles.secondaryButton} onClick={retry}>
            Try again
          </button>
        )}
        <Link href="/projects" className={styles.secondaryButton}>
          Back to projects
        </Link>
      </div>
    </div>
  );
}

const PENDING: ClipStatus[] = ["uploaded", "processing"];

const RETRY_MS = [3000, 6000, 12000, 30000];

/**
 * Loads a project's report, and keeps reloading it while any clip or document is still
 * being processed.
 *
 * Site data drops out. Once a report has loaded, a failed refresh never takes it off
 * the screen: `stale` turns on, the hook retries with backoff and as soon as the phone
 * is back online, and `error` is reserved for a first load that never worked.
 */
export function useReport(projectId: string) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [stale, setStale] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failures = useRef(0);
  const loaded = useRef(false);

  const reload = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    try {
      const next = await data.getReport(projectId);
      loaded.current = true;
      failures.current = 0;
      setReport(next);
      setError(null);
      setStale(false);
      const busy = [...next.clips, ...next.documents].some((x) => PENDING.includes(x.status));
      if (busy) timer.current = setTimeout(reload, 3000);
    } catch (e) {
      // A missing project or a refused link won't fix itself; anything else is retried.
      const final = e instanceof DataError && [401, 403, 404].includes(e.status);
      if (!loaded.current || final) {
        setError(e);
        return;
      }
      setStale(true);
      timer.current = setTimeout(reload, RETRY_MS[Math.min(failures.current++, RETRY_MS.length - 1)]);
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
    const online = () => void reload();
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("online", online);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [reload]);

  return { report, error, stale, reload };
}

/** Shown over a page whose last refresh failed. The page underneath is the last good copy. */
export function StaleNotice({ stale, onRetry }: { stale: boolean; onRetry: () => void }) {
  if (!stale) return null;
  return (
    <div className={styles.stale} role="status">
      <span>Couldn&apos;t refresh. Showing the last copy; retrying.</span>
      <button type="button" onClick={onRetry}>
        Retry now
      </button>
    </div>
  );
}

/** Plain words for a failed request, by what went wrong. */
export function describeError(error: unknown): { title: string; body: string; retry: boolean } {
  const status = error instanceof DataError ? error.status : -1;
  if (status === 0)
    return { title: "No connection", body: "Check your mobile data or Wi-Fi. This page will try again when you're back online.", retry: true };
  if (status === 401 || status === 403)
    return { title: "This link doesn't open this project", body: "Ask the builder for a fresh link.", retry: false };
  if (status === 404) return { title: "We couldn't find this project", body: "Check the link, or start a new project.", retry: false };
  if (status === 429) return { title: "Too many uploads for today", body: "Try again tomorrow, or ask the SiteProof team to raise the limit.", retry: true };
  if (status >= 500) return { title: "SiteProof is having trouble", body: "Nothing you did caused this. Try again in a minute.", retry: true };
  return { title: "Something went wrong", body: error instanceof Error ? error.message : "Try again in a moment.", retry: true };
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
