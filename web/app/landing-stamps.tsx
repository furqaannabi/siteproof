"use client";

import { useEffect } from "react";

/**
 * The page's one piece of motion. As each claim row reaches the fold, its stamp presses
 * onto the blueprint side, once. Without JavaScript, or with reduced motion asked for,
 * every stamp is simply there: the page is armed only when this runs and motion is welcome.
 */
export function StampReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rows = [...document.querySelectorAll<HTMLElement>("[data-row]")];
    if (rows.length === 0 || !("IntersectionObserver" in window)) return;

    document.documentElement.dataset.stamps = "armed";
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.pressed = "";
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -35% 0px" },
    );
    rows.forEach((row) => observer.observe(row));
    return () => {
      observer.disconnect();
      delete document.documentElement.dataset.stamps;
    };
  }, []);

  return null;
}
