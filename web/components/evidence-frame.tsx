"use client";

import type { Detection } from "@siteproof/contract";
import { useEffect, useId, useState } from "react";
import styles from "./ui.module.css";

/**
 * One best frame with the outline of every object counted in it.
 *
 * Built to take whatever the pipeline hands back, not just the mock files:
 * - The frame's real pixel size sets the drawing box, so portrait phone clips and
 *   landscape ones both fit, and a mask (which is the same size as its frame) lines up.
 * - A mask is a shape image: white on transparent, or white on black. The filter below
 *   reads its brightness as the shape, then paints our own fill and outline from it.
 *   So the colours live here, in the design tokens, not in the mask file.
 * - URLs are used as given. In production they are short-lived presigned links.
 */
export function EvidenceFrame({
  frameUrl,
  masks,
  label,
  badge,
}: {
  frameUrl: string;
  masks: Detection[];
  /** Read out to screen readers, such as "Best frame, Bedroom 2, 2 windows outlined". */
  label: string;
  badge?: string;
}) {
  const filterId = `outline-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const img = new Image();
    img.onload = () => live && setSize({ w: img.naturalWidth || 1600, h: img.naturalHeight || 900 });
    img.onerror = () => live && setFailed(true);
    img.src = frameUrl;
    return () => {
      live = false;
    };
  }, [frameUrl]);

  if (failed) {
    return (
      <div className={styles.frameMissing} role="img" aria-label={label}>
        This frame couldn&apos;t be loaded. The count stands; reload to try the image again.
      </div>
    );
  }

  const w = size?.w ?? 1600;
  const h = size?.h ?? 900;
  // Outline thickness scales with the frame, so it reads the same on any resolution.
  const ring = Math.max(2, Math.round(Math.max(w, h) / 320));

  return (
    <a href={frameUrl} target="_blank" rel="noreferrer" className={styles.frame} style={{ aspectRatio: `${w} / ${h}` }}>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB">
            <feColorMatrix in="SourceGraphic" type="luminanceToAlpha" result="bright" />
            <feComponentTransfer in="bright" result="shape">
              <feFuncA type="discrete" tableValues="0 1" />
            </feComponentTransfer>
            <feFlood className={styles.maskFill} result="tint" />
            <feComposite in="tint" in2="shape" operator="in" result="fill" />
            <feMorphology in="shape" operator="dilate" radius={ring} result="grown" />
            <feComposite in="grown" in2="shape" operator="out" result="ring" />
            <feFlood className={styles.maskLine} result="line" />
            <feComposite in="line" in2="ring" operator="in" result="outline" />
            <feMerge>
              <feMergeNode in="fill" />
              <feMergeNode in="outline" />
            </feMerge>
          </filter>
        </defs>
        {size && (
          <>
            <image href={frameUrl} width={w} height={h} />
            {masks.map((d) => (
              <image key={d.track_id} href={d.mask_url} width={w} height={h} filter={`url(#${filterId})`} />
            ))}
          </>
        )}
      </svg>
      {badge && <span className={styles.frameBadge}>{badge}</span>}
    </a>
  );
}
