/**
 * The secret links on this device: each project's builder link, and the team's setup key
 * ([ADR](../../docs/decisions/2026-10-28-builder-access-by-secret-links-accepted.md)).
 *
 * A link carries its token after `#`, in the part of a URL a browser never sends to a
 * server, so a token never lands in the web host's request logs or in a Referer header:
 *
 * - builder link: `/projects/<project id>#key=<builder token>`, opens the whole project;
 * - report link:  `/report#<report token>`, opens one flat's report, no login.
 *
 * Opening a builder link saves its token here, and every builder request after that sends
 * it as `Authorization: Bearer`. Tokens are never logged.
 */

const BUILDER_KEY = "siteproof-builder-links";
const SETUP_KEY = "siteproof-setup-key";

function read<T>(key: string, fallback: T): T {
  try {
    const saved = window.localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private window or blocked storage: the link still works for this page.
  }
}

// Also kept in memory, so a link opened in a private window works until the tab closes.
let memory: Record<string, string> | null = null;

function builderTokens(): Record<string, string> {
  memory ??= read<Record<string, string>>(BUILDER_KEY, {});
  return memory;
}

export function builderToken(projectId: string): string | null {
  return builderTokens()[projectId] ?? null;
}

export function saveBuilderToken(projectId: string, token: string) {
  memory = { ...builderTokens(), [projectId]: token };
  write(BUILDER_KEY, memory);
}

/** Forget a project's link on this device, such as one that was replaced. */
export function forgetBuilderToken(projectId: string) {
  const { [projectId]: _, ...rest } = builderTokens();
  memory = rest;
  write(BUILDER_KEY, rest);
}

/** The projects whose builder links were opened on this device. */
export function knownProjects(): string[] {
  return Object.keys(builderTokens());
}

/**
 * If the page was opened from a builder link, save its token and take it out of the
 * address bar, so it isn't left on screen or copied along with the address.
 */
export function takeBuilderLink(projectId: string) {
  const match = window.location.hash.match(/^#key=([^&]+)$/);
  if (!match) return;
  saveBuilderToken(projectId, decodeURIComponent(match[1]));
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

/** The report token from a report link's address, or null. */
export function reportTokenFromHash(): string | null {
  const token = window.location.hash.slice(1);
  return token && !token.includes("=") ? decodeURIComponent(token) : null;
}

export function builderLink(origin: string, projectId: string, token: string) {
  return `${origin}/projects/${projectId}#key=${encodeURIComponent(token)}`;
}

export function reportLink(origin: string, token: string) {
  return `${origin}/report#${encodeURIComponent(token)}`;
}

/** The team's setup key, remembered on this device once typed. */
export function setupKey(): string | null {
  return read<string | null>(SETUP_KEY, null);
}

export function saveSetupKey(key: string | null) {
  write(SETUP_KEY, key);
}
