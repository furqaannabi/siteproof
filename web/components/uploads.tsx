"use client";

import type { ClipStatus } from "@siteproof/contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { data, DataError } from "@/lib/data";
import type { NewDocument } from "@/lib/types";
import { StatusBadge, ui } from "./ui";

// What the counter accepts: MP4 or MOV. WebM and VP9 are refused upstream, so say so now.
const CLIP_TYPES = ["video/mp4", "video/quicktime"];
const CLIP_EXTENSIONS = [".mp4", ".mov", ".m4v"];
export const CLIP_ACCEPT = [...CLIP_TYPES, ...CLIP_EXTENSIONS].join(",");
export const DOCUMENT_ACCEPT = "application/pdf,.pdf";

// The server's limits (ADRs of 27 October), checked here first so a builder on slow
// site data never waits for an upload that will be refused at the end.
const MAX_CLIP_BYTES = 250 * 1024 * 1024;
const MAX_CLIP_SECONDS = 60;
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

const POLL_MS = 2000;

export function clipProblem(file: File): string | null {
  const name = file.name.toLowerCase();
  const isClip = CLIP_TYPES.includes(file.type) || CLIP_EXTENSIONS.some((e) => name.endsWith(e));
  if (!isClip) {
    if (file.type === "video/webm" || name.endsWith(".webm")) return "This video format can't be checked. Send it as MP4: WhatsApp and most phone cameras do this already.";
    return "This isn't a video SiteProof can read. Upload an MP4 or MOV clip.";
  }
  if (file.size === 0) return "This file is empty. Choose the clip again.";
  if (file.size > MAX_CLIP_BYTES) return "This clip is over 250 MB. Film at 1080p rather than 4K, or send it through WhatsApp, which makes it smaller.";
  return null;
}

export function documentProblem(file: File): string | null {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))
    return "Upload the document as a PDF. A PDF made from the original reads best; a photo or scan may not be readable.";
  if (file.size === 0) return "This file is empty. Choose the PDF again.";
  if (file.size > MAX_DOCUMENT_BYTES) return "This PDF is over 20 MB. Send the PDF the document was made from, not a scan.";
  return null;
}

/**
 * The clip's length, read from its own metadata in the browser. null when the browser
 * can't tell (some phones' HEVC files): the server's ingest step still enforces the limit.
 */
function clipSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(value);
    };
    const timeout = setTimeout(() => done(null), 5000);
    video.preload = "metadata";
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

function megabytes(bytes: number) {
  return bytes < 1024 * 1024 ? "under 1 MB" : `${Math.round(bytes / (1024 * 1024))} MB`;
}

export interface UploadItem {
  key: string;
  label: string;
  detail?: string;
  kind: "clip" | "document";
  id: string | null;
  progress: number;
  status: ClipStatus | "uploading";
  error: string | null;
  /** The transfer failed, not the file: the same file can be sent again. */
  retryable: boolean;
}

/** A queue of uploads: check, register, PUT with progress, then poll the status until it settles. */
export function useUploads(projectId: string, onSettled?: () => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const retries = useRef(new Map<string, () => void>());

  useEffect(() => {
    const live = timers.current;
    return () => live.forEach(clearTimeout);
  }, []);

  // Closing the tab mid-transfer loses the file; ask first. Once it's sent, leaving is fine.
  const sending = items.some((x) => x.status === "uploading");
  useEffect(() => {
    if (!sending) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [sending]);

  const patch = useCallback((key: string, change: Partial<UploadItem>) => {
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...change } : x)));
  }, []);

  const poll = useCallback(
    (key: string, kind: UploadItem["kind"], id: string) => {
      const tick = async () => {
        try {
          let status: ClipStatus;
          let reason: string | null = null;
          if (kind === "clip") status = await data.clipStatus(projectId, id);
          else ({ status, reason } = await data.documentStatus(projectId, id));
          // A document that can't be read says why, in words chosen by the server.
          patch(key, status === "failed" ? { status, error: reason ?? "This file couldn't be read. Upload it again, or a clearer copy." } : { status });
          if (status === "done" || status === "failed") {
            onSettled?.();
            return;
          }
        } catch {
          // A missed poll is retried; the status will catch up.
        }
        const t = setTimeout(tick, POLL_MS);
        timers.current.add(t);
      };
      void tick();
    },
    [projectId, onSettled, patch],
  );

  const run = useCallback(
    async (key: string, kind: UploadItem["kind"], sendFile: (onProgress: (p: number) => void) => Promise<{ id: string }>) => {
      try {
        const { id } = await sendFile((p) => patch(key, { progress: p }));
        retries.current.delete(key);
        patch(key, { id, progress: 1, status: "uploaded" });
        onSettled?.();
        poll(key, kind, id);
      } catch (e) {
        const message =
          e instanceof DataError && e.message === "no_link"
            ? "This phone hasn't opened the project's builder link. Open it, then upload again."
            : e instanceof Error
              ? e.message
              : "The upload didn't finish.";
        // Sending the same file again only helps when the transfer failed, not the file:
        // never for one refused as unreadable, too large, over today's limit, or without a link.
        const refused = e instanceof DataError && [400, 401, 404, 413, 429].includes(e.status);
        patch(key, { status: "failed", error: message, retryable: !refused && retries.current.has(key) });
      }
    },
    [onSettled, patch, poll],
  );

  const start = useCallback(
    (item: UploadItem, sendFile: (onProgress: (p: number) => void) => Promise<{ id: string }>) => {
      const go = () => {
        patch(item.key, { status: "uploading", progress: 0, error: null, retryable: false });
        void run(item.key, item.kind, sendFile);
      };
      retries.current.set(item.key, go);
      void run(item.key, item.kind, sendFile);
    },
    [patch, run],
  );

  const addClip = useCallback(
    (projectId: string, file: File, roomHint: string | null = null) => {
      const item: UploadItem = {
        key: crypto.randomUUID(),
        label: file.name,
        detail: megabytes(file.size),
        kind: "clip",
        id: null,
        progress: 0,
        status: "uploading",
        error: null,
        retryable: false,
      };
      const problem = clipProblem(file);
      setItems((xs) => [problem ? { ...item, status: "failed", error: problem } : item, ...xs]);
      if (problem) return;
      void clipSeconds(file).then((seconds) => {
        if (seconds !== null && seconds > MAX_CLIP_SECONDS + 0.5) {
          patch(item.key, {
            status: "failed",
            error: `This clip is ${Math.round(seconds)} seconds long. SiteProof checks clips up to 60 seconds: trim it, or film each room separately.`,
          });
          return;
        }
        start(item, (onProgress) => data.uploadClip(projectId, file, onProgress, roomHint));
      });
    },
    [patch, start],
  );

  const addDocument = useCallback(
    (input: NewDocument, file: File, detail: string) => {
      const item: UploadItem = {
        key: crypto.randomUUID(),
        label: file.name,
        detail,
        kind: "document",
        id: null,
        progress: 0,
        status: "uploading",
        error: null,
        retryable: false,
      };
      const problem = documentProblem(file);
      setItems((xs) => [problem ? { ...item, status: "failed", error: problem } : item, ...xs]);
      if (problem) return;
      start(item, (onProgress) => data.uploadDocument(input, file, onProgress));
    },
    [start],
  );

  const retry = useCallback((key: string) => retries.current.get(key)?.(), []);

  return { items, addClip, addDocument, retry };
}

const STATUS_NOTE: Partial<Record<UploadItem["status"], string>> = {
  uploaded: "Waiting to be checked",
  processing: "Being checked. You can leave this page.",
  done: "Done. The report is updated.",
};

export function UploadList({ items, onRetry }: { items: UploadItem[]; onRetry?: (key: string) => void }) {
  if (items.length === 0) return null;
  return (
    <ul className={ui.list} aria-live="polite">
      {items.map((x) => (
        <li key={x.key}>
          <span className={ui.grow}>
            <span className={ui.mono}>{x.label}</span>
            {x.detail && <span className={ui.muted}> · {x.detail}</span>}
            {x.status === "uploading" && (
              <span
                className={ui.progress}
                role="progressbar"
                aria-label={`Sending ${x.label}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(x.progress * 100)}
              >
                <span style={{ width: `${Math.round(x.progress * 100)}%` }} />
              </span>
            )}
            {x.error ? (
              <span className={ui.fieldError} style={{ display: "block" }}>
                {x.error}
              </span>
            ) : (
              STATUS_NOTE[x.status] && (
                <span className={ui.muted} style={{ display: "block" }}>
                  {STATUS_NOTE[x.status]}
                </span>
              )
            )}
          </span>
          {x.retryable && onRetry ? (
            <button type="button" className={ui.secondaryButton} onClick={() => onRetry(x.key)}>
              Try again
            </button>
          ) : (
            <StatusBadge status={x.status} />
          )}
        </li>
      ))}
    </ul>
  );
}

/** A big, thumb-sized drop zone that also opens the file picker or the camera. */
export function DropZone({
  title,
  hint,
  accept,
  multiple,
  capture,
  onFiles,
}: {
  title: string;
  hint: string;
  accept: string;
  multiple?: boolean;
  capture?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <label
      className={ui.drop}
      data-over={over}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles([...e.dataTransfer.files]);
      }}
    >
      <span className={ui.dropTitle}>{title}</span>
      <span className={ui.muted}>{hint}</span>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        capture={capture ? "environment" : undefined}
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </label>
  );
}
