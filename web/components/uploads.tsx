"use client";

import type { ClipStatus } from "@siteproof/contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { data } from "@/lib/data";
import type { NewDocument } from "@/lib/types";
import { StatusBadge, ui } from "./ui";

// What the counter accepts: MP4 or MOV. WebM and VP9 are refused upstream, so say so now.
const CLIP_TYPES = ["video/mp4", "video/quicktime"];
const CLIP_EXTENSIONS = [".mp4", ".mov", ".m4v"];
export const CLIP_ACCEPT = [...CLIP_TYPES, ...CLIP_EXTENSIONS].join(",");
export const DOCUMENT_ACCEPT = "application/pdf,.pdf";

const POLL_MS = 2000;

export function clipProblem(file: File): string | null {
  const name = file.name.toLowerCase();
  if (CLIP_TYPES.includes(file.type) || CLIP_EXTENSIONS.some((e) => name.endsWith(e))) return null;
  if (file.type === "video/webm" || name.endsWith(".webm")) return "This video format can't be checked. Send it as MP4: WhatsApp and most phone cameras do this already.";
  return "This isn't a video SiteProof can read. Upload an MP4 or MOV clip.";
}

export function documentProblem(file: File): string | null {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return null;
  return "Upload the document as a PDF. A PDF made from the original reads best; a photo or scan may not be readable.";
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
}

/** A queue of uploads: register, PUT with progress, then poll the status until it settles. */
export function useUploads(onSettled?: () => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const live = timers.current;
    return () => live.forEach(clearTimeout);
  }, []);

  const patch = useCallback((key: string, change: Partial<UploadItem>) => {
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...change } : x)));
  }, []);

  const poll = useCallback(
    (key: string, kind: UploadItem["kind"], id: string) => {
      const tick = async () => {
        try {
          const status = kind === "clip" ? await data.clipStatus(id) : (await data.documentStatus(id)).status;
          patch(key, { status });
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
    [onSettled, patch],
  );

  const run = useCallback(
    async (item: UploadItem, file: File, register: () => Promise<{ id: string; upload_url: string }>) => {
      setItems((xs) => [item, ...xs]);
      try {
        const { id, upload_url } = await register();
        patch(item.key, { id });
        await data.upload(upload_url, file, (p) => patch(item.key, { progress: p }));
        patch(item.key, { progress: 1, status: "uploaded" });
        onSettled?.();
        poll(item.key, item.kind, id);
      } catch (e) {
        patch(item.key, { status: "failed", error: e instanceof Error ? e.message : "The upload didn't finish. Try again." });
      }
    },
    [onSettled, patch, poll],
  );

  const addClip = useCallback(
    (projectId: string, file: File, roomHint: string | null = null) => {
      const item: UploadItem = { key: crypto.randomUUID(), label: file.name, kind: "clip", id: null, progress: 0, status: "uploading", error: null };
      const problem = clipProblem(file);
      if (problem) {
        setItems((xs) => [{ ...item, status: "failed", error: problem }, ...xs]);
        return;
      }
      void run(item, file, async () => {
        const r = await data.registerClip(projectId, file, roomHint);
        return { id: r.item.id, upload_url: r.upload_url };
      });
    },
    [run],
  );

  const addDocument = useCallback(
    (input: NewDocument, file: File, detail: string) => {
      const item: UploadItem = { key: crypto.randomUUID(), label: file.name, detail, kind: "document", id: null, progress: 0, status: "uploading", error: null };
      const problem = documentProblem(file);
      if (problem) {
        setItems((xs) => [{ ...item, status: "failed", error: problem }, ...xs]);
        return;
      }
      void run(item, file, async () => {
        const r = await data.registerDocument(input, file);
        return { id: r.item.id, upload_url: r.upload_url };
      });
    },
    [run],
  );

  return { items, addClip, addDocument };
}

const STATUS_NOTE: Partial<Record<UploadItem["status"], string>> = {
  uploaded: "Waiting to be checked",
  processing: "Being checked. You can leave this page.",
  done: "Done. The report is updated.",
};

export function UploadList({ items }: { items: UploadItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className={ui.list} aria-live="polite">
      {items.map((x) => (
        <li key={x.key}>
          <span className={ui.grow}>
            <span className={ui.mono}>{x.label}</span>
            {x.detail && <span className={ui.muted}> · {x.detail}</span>}
            {x.status === "uploading" && (
              <span className={ui.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(x.progress * 100)}>
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
          <StatusBadge status={x.status} />
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
