"use client";

import type { ClipStatus, ProjectOverview, Report } from "@siteproof/contract";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { takeBuilderLink } from "@/lib/access";
import { data, DataError, usingMock } from "@/lib/data";
import styles from "./ui.module.css";

/** `href` is where the mark leads: the projects list for a builder, the start page for a buyer. */
export function Brand({ href = "/projects" }: { href?: string }) {
  return (
    <Link href={href} className={styles.brand}>
      <span className={styles.brandMark}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12l5 5L20 6" />
        </svg>
      </span>
      <span className={styles.brandName}>SiteProof</span>
    </Link>
  );
}

/**
 * The top bar, fixed while the page scrolls. `title` and `eyebrow` name where you are;
 * `children` go on the right; `band` is a full-width strip under it, such as the next step.
 */
export function AppHeader({
  eyebrow,
  title,
  brandHref,
  band,
  children,
}: {
  eyebrow?: string;
  title?: string;
  brandHref?: string;
  band?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Brand href={brandHref} />
        {(eyebrow || title) && (
          <div className={styles.headerTitle}>
            {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
            {title && <span className={styles.headerMain}>{title}</span>}
          </div>
        )}
        {children}
      </div>
      {band}
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

/** `home` offers the way back to the projects list; a buyer's report link has none. */
export function ErrorPanel({ error, retry, home = true }: { error: unknown; retry?: () => void; home?: boolean }) {
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
        {home && (
          <Link href="/projects" className={styles.secondaryButton}>
            Back to projects
          </Link>
        )}
      </div>
    </div>
  );
}

const PENDING: ClipStatus[] = ["uploaded", "processing"];

const RETRY_MS = [3000, 6000, 12000, 30000];

/**
 * Loads something from the API, and keeps reloading it while `busy` says part of it is
 * still being processed. `load` is null while what it depends on isn't known yet.
 *
 * Site data drops out. Once it has loaded, a failed refresh never takes it off the
 * screen: `stale` turns on, the hook retries with backoff and as soon as the phone is
 * back online, and `error` is reserved for a first load that never worked.
 */
function useLive<T>(key: string | null, load: (() => Promise<T>) | null, busy: (value: T) => boolean) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [stale, setStale] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failures = useRef(0);
  const loaded = useRef(false);
  // The latest load and busy, read when reloading; the key decides when to start over.
  const latest = useRef({ load, busy });
  latest.current = { load, busy };

  const reload = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const { load } = latest.current;
    if (!load) return;
    try {
      const next = await load();
      loaded.current = true;
      failures.current = 0;
      setValue(next);
      setError(null);
      setStale(false);
      if (latest.current.busy(next)) timer.current = setTimeout(reload, 3000);
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
    // key is what the load depends on; a new key starts over.
  }, [key]);

  useEffect(() => {
    // Something new to load: never show the last one's data or error meanwhile.
    loaded.current = false;
    setValue(null);
    setError(null);
    setStale(false);
    void reload();
    const online = () => void reload();
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("online", online);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [reload]);

  return { value, error, stale, reload };
}

/**
 * The builder's whole project, reloaded while any clip or document is being processed.
 * A page opened from a builder link saves the link first.
 */
export function useOverview(projectId: string) {
  const { value, ...rest } = useLive(
    `overview:${projectId}`,
    () => {
      takeBuilderLink(projectId);
      return data.getOverview(projectId);
    },
    (o: ProjectOverview) => [...o.clips, ...o.documents].some((x) => PENDING.includes(x.status)),
  );
  // A builder link pasted into a tab already on this project changes only the part after "#".
  const { reload } = rest;
  useEffect(() => {
    const pasted = () => {
      if (!window.location.hash.startsWith("#key=")) return;
      takeBuilderLink(projectId);
      void reload();
    };
    window.addEventListener("hashchange", pasted);
    return () => window.removeEventListener("hashchange", pasted);
  }, [projectId, reload]);
  return { overview: value, ...rest };
}

/**
 * One flat's report, reloaded while any of its documents is being read. `flatId` is null
 * until the flat is known.
 */
export function useFlatReport(projectId: string, flatId: string | null) {
  const { value, ...rest } = useLive(
    flatId && `report:${flatId}`,
    flatId ? () => data.getFlatReport(projectId, flatId) : null,
    (r: Report) => r.documents.some((d) => PENDING.includes(d.status)),
  );
  return { report: value, ...rest };
}

/** One flat's report from its report link: the buyer's and bank's view. */
export function useReportByLink(token: string | null) {
  const { value, ...rest } = useLive(
    token && `link:${token}`,
    token ? () => data.getReportByLink(token) : null,
    (r: Report) => r.documents.some((d) => PENDING.includes(d.status)),
  );
  return { report: value, ...rest };
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

/** Copies `text`, and says so. Where the clipboard is blocked, the text is on screen to select. */
export function CopyButton({ text, label, className = styles.primaryButton }: { text: string; label: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "blocked">("idle");
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("copied");
        } catch {
          setState("blocked");
        }
        setTimeout(() => setState("idle"), 2500);
      }}
    >
      <span role="status">{state === "copied" ? "Copied" : state === "blocked" ? "Couldn't copy. Select the text instead" : label}</span>
    </button>
  );
}

/** Plain words for a failed request, by what went wrong. */
export function describeError(error: unknown): { title: string; body: string; retry: boolean } {
  const status = error instanceof DataError ? error.status : -1;
  if (status === 0)
    return { title: "No connection", body: "Check your mobile data or Wi-Fi. This page will try again when you're back online.", retry: true };
  if (status === 401 && error instanceof DataError && error.message === "no_link")
    return { title: "Open this project from its link", body: "This phone hasn't opened the project's builder link yet. Open the link you were sent, or ask the project's owner for it.", retry: false };
  if (status === 401 || status === 403)
    return { title: "This link doesn't open anything", body: "It may have been replaced by a new one. Ask whoever sent it for the current link.", retry: false };
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
