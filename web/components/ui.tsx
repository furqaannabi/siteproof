"use client";

import type { ClipStatus, ProjectOverview, Report } from "@siteproof/contract";
import { Building2, ChevronDown, ChevronRight, CloudOff, Compass, FileCheck2, FolderOpen, KeyRound, type LucideIcon, Plus, SearchX, TriangleAlert, Unlink, Upload } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

export type NavKey = "projects" | "new" | "project" | "upload" | "report";

/** Where the builder is: inside a project (with its id and, once loaded, its name) or on the projects list. */
export interface NavPlace {
  current: NavKey;
  projectId?: string;
  projectName?: string;
  builder?: string;
}

interface NavLink {
  key: NavKey;
  href: string;
  label: string;
  icon: LucideIcon;
}

const APP_LINKS: NavLink[] = [
  { key: "projects", href: "/projects", label: "All projects", icon: FolderOpen },
  { key: "new", href: "/projects/new", label: "New project", icon: Plus },
];

function projectLinks(projectId: string): NavLink[] {
  return [
    { key: "project", href: `/projects/${projectId}`, label: "Overview", icon: Building2 },
    { key: "upload", href: `/projects/${projectId}/upload`, label: "Upload", icon: Upload },
    { key: "report", href: `/projects/${projectId}/report`, label: "Report", icon: FileCheck2 },
  ];
}

function NavItem({ link, active }: { link: NavLink; active: boolean }) {
  const Icon = link.icon;
  return (
    <Link href={link.href} className={styles.navItem} aria-current={active ? "page" : undefined}>
      <Icon size={20} strokeWidth={2} aria-hidden="true" />
      <span>{link.label}</span>
    </Link>
  );
}

// The sidebar's project list, kept between pages so it doesn't flash empty on each one.
let knownProjects: { id: string; name: string }[] | null = null;

function useProjectList(place: NavPlace) {
  const [projects, setProjects] = useState(knownProjects);
  useEffect(() => {
    let live = true;
    data
      .listProjects()
      .then((list) => {
        knownProjects = list.map((p) => ({ id: p.id, name: p.name }));
        if (live) setProjects(knownProjects);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  // Until the list arrives, the project you're in is still shown, so nothing jumps. Once
  // it has arrived, a project missing from it isn't invented.
  const list = projects ?? [];
  if (projects === null && place.projectId) {
    return [...list, { id: place.projectId, name: place.projectName ?? "This project" }];
  }
  return list;
}

/**
 * The builder's navigation. On a computer, a sidebar that is the same on every page: all
 * projects, each project with its three pages under it, and a new project. On a phone or
 * tablet, the current project's pages as a bar along the bottom edge, in thumb reach.
 * Buyers and banks never see it: a report link opens one flat and nothing else.
 */
function AppNav({ place }: { place: NavPlace }) {
  const projects = useProjectList(place);
  if (place.projectName === undefined && place.projectId) {
    place = { ...place, projectName: projects.find((p) => p.id === place.projectId)?.name };
  }
  const bottom = place.projectId ? [...projectLinks(place.projectId), { ...APP_LINKS[0], label: "Projects" }] : APP_LINKS;
  return (
    <>
      <aside className={styles.sidebar}>
        <Brand />
        <nav aria-label="SiteProof" className={styles.sideNav}>
          <NavItem link={APP_LINKS[0]} active={place.current === "projects"} />
          {projects.length > 0 && <span className={styles.sideLabel}>Projects</span>}
          {projects.map((p) => (
            <div key={p.id} className={styles.sideGroup}>
              <Link href={`/projects/${p.id}`} className={styles.sideProject} data-here={p.id === place.projectId || undefined}>
                <ChevronDown size={16} aria-hidden="true" />
                <span>{p.name}</span>
              </Link>
              {projectLinks(p.id).map((l) => (
                <NavItem key={l.key} link={l} active={p.id === place.projectId && l.key === place.current} />
              ))}
            </div>
          ))}
          <NavItem link={APP_LINKS[1]} active={place.current === "new"} />
        </nav>
      </aside>
      <nav aria-label="Pages" className={styles.tabBar}>
        {bottom.map((l) => (
          <NavItem key={l.key} link={l} active={l.key === place.current} />
        ))}
      </nav>
    </>
  );
}

/** Where a builder page's path puts you, or null for a page that has no sidebar. */
function placeFromPath(path: string): NavPlace | null {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "projects") return null;
  if (parts.length === 1) return { current: "projects" };
  if (parts[1] === "new") return { current: "new" };
  const projectId = decodeURIComponent(parts[1]);
  if (parts.length === 2) return { current: "project", projectId };
  if (parts.length === 3 && (parts[2] === "upload" || parts[2] === "report")) return { current: parts[2], projectId };
  // A gap request is the site supervisor's own full-screen page.
  return null;
}

/**
 * The builder's sidebar, drawn once by the projects layout so it stays put while the page
 * beside it changes.
 */
export function BuilderNav() {
  const place = placeFromPath(usePathname());
  return place ? <AppNav place={place} /> : null;
}

/**
 * The sidebar's empty frame, shown for the moment before the address is known, so the
 * page beside it doesn't shift when the links arrive.
 */
export function BuilderNavFrame() {
  return (
    <aside className={styles.sidebar} aria-hidden="true">
      <Brand />
    </aside>
  );
}

/**
 * The top of every page. `title` and `eyebrow` name where you are; `children` go on the
 * right; `band` is a full-width strip under it, such as the next step. With `nav` it is
 * the light strip beside the builder's sidebar, saying where you are; without it, as on a
 * buyer's report, it is the dark bar with the mark.
 */
export function AppHeader({
  eyebrow,
  title,
  brandHref,
  band,
  nav,
  children,
}: {
  eyebrow?: string;
  title?: string;
  brandHref?: string;
  band?: React.ReactNode;
  nav?: NavPlace;
  children?: React.ReactNode;
}) {
  return (
    <>
      <header className={styles.header} data-nav={nav ? "true" : undefined}>
        <div className={styles.headerInner}>
          <span className={nav ? styles.headerBrand : undefined}>
            <Brand href={brandHref} />
          </span>
          {nav && <Crumbs place={nav} title={title} />}
          {(eyebrow || title) && (
            <div className={`${styles.headerTitle} ${nav ? styles.headerTitleNav : ""}`}>
              {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
              {title && <span className={styles.headerMain}>{title}</span>}
            </div>
          )}
          {children}
          {usingMock && nav && <span className={styles.demoTag}>Demo data · not real site footage</span>}
        </div>
        {band}
        {usingMock && <div className={`${styles.mockBar} ${nav ? styles.mockBarNav : ""}`}>Demo data · not real site footage</div>}
      </header>
    </>
  );
}

const PAGE_LABEL: Record<NavKey, string> = {
  projects: "All projects",
  new: "New project",
  project: "Overview",
  upload: "Upload",
  report: "Report",
};

/** Where you are, on a computer beside the sidebar: All projects / the project / this page. */
function Crumbs({ place, title }: { place: NavPlace; title?: string }) {
  const here = place.current === "report" && title ? `Report · ${title}` : PAGE_LABEL[place.current];
  return (
    <nav aria-label="You are here" className={styles.crumbs}>
      {place.projectId && (
        <>
          <Link href="/projects">All projects</Link>
          <ChevronRight size={16} aria-hidden="true" />
          <Link href={`/projects/${place.projectId}`}>
            {place.projectName ?? knownProjects?.find((p) => p.id === place.projectId)?.name ?? "Project"}
          </Link>
          <ChevronRight size={16} aria-hidden="true" />
        </>
      )}
      <span aria-current="page">{here}</span>
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

/**
 * A page that can't show what was asked for: a link that doesn't open, a page that isn't
 * there, no connection. A card with an icon, a plain heading, what to do, and at most a
 * couple of ways on. Never blames whoever is reading it.
 */
export function Notice({
  icon: Icon,
  tone = "plain",
  title,
  children,
  actions,
}: {
  icon: LucideIcon;
  tone?: "plain" | "warn";
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className={styles.notice} data-tone={tone} role={tone === "warn" ? "alert" : undefined}>
      <span className={styles.noticeIcon} aria-hidden="true">
        <Icon size={30} strokeWidth={2} />
      </span>
      <h1 className={styles.noticeTitle}>{title}</h1>
      <div className={styles.noticeBody}>{children}</div>
      {actions && <div className={styles.noticeActions}>{actions}</div>}
    </section>
  );
}

/**
 * Any address SiteProof doesn't have. The way on is the start page, which anyone may see:
 * a buyer who mistypes a report link is never led into a builder's projects.
 */
export function PageNotFound() {
  return (
    <Notice
      icon={Compass}
      title="There's no page here"
      actions={
        <Link href="/" className={styles.noticePrimary}>
          Go to the start page
        </Link>
      }
    >
      <p>The address may be mistyped, or the page has moved. If someone sent you a link, open the whole link again or ask them for the current one.</p>
    </Notice>
  );
}

/** `home` offers the way back to the projects list; a buyer's report link has none. */
export function ErrorPanel({ error, retry, home = true }: { error: unknown; retry?: () => void; home?: boolean }) {
  const { title, body, retry: canRetry } = describeError(error);
  const status = error instanceof DataError ? error.status : -1;
  const icon = status === 0 ? CloudOff : status === 401 && error instanceof DataError && error.message === "no_link" ? KeyRound : status === 401 || status === 403 ? Unlink : status === 404 ? SearchX : TriangleAlert;
  const warn = status >= 500 || status === -1 || status === 429;
  return (
    <Notice
      icon={icon}
      tone={warn ? "warn" : "plain"}
      title={title}
      actions={
        (retry && canRetry) || home ? (
          <>
            {retry && canRetry && (
              <button type="button" className={styles.noticePrimary} onClick={retry}>
                Try again
              </button>
            )}
            {home && (
              <Link href="/projects" className={retry && canRetry ? styles.noticeSecondary : styles.noticePrimary}>
                Back to your projects
              </Link>
            )}
          </>
        ) : undefined
      }
    >
      <p>{body}</p>
    </Notice>
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
// The last copy of each thing loaded, so going back to a page shows it at once while it
// reloads, instead of a loading screen on every switch.
const lastLoaded = new Map<string, unknown>();

function useLive<T>(key: string | null, load: (() => Promise<T>) | null, busy: (value: T) => boolean) {
  const [value, setValue] = useState<T | null>(() => (key ? ((lastLoaded.get(key) as T | undefined) ?? null) : null));
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
      if (key) lastLoaded.set(key, next);
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
    // Something new to load: never show another one's data or error meanwhile; its own
    // last copy, if there is one, stands until the reload lands.
    const kept = key ? ((lastLoaded.get(key) as T | undefined) ?? null) : null;
    loaded.current = kept !== null;
    setValue(kept);
    setError(null);
    setStale(false);
    void reload();
    const online = () => void reload();
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("online", online);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, reload]);

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
