/** A room's place in an automatic layout, in whatever units the caller passes. */
export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

/**
 * Rooms placed on a grid: three columns, the first room two cells by two, the rest
 * filling in reading order, centred on the origin. Not to scale: SiteProof knows each
 * room's claims and counts, never its size or shape. The 3D view and the project
 * page's plan both use this, so a room sits in the same place on both.
 */
export function autoLayout(n: number, cellW: number, cellD: number): Rect[] {
  if (n === 0) return [];
  const cols = n <= 2 ? n : 3;
  const taken = new Set<string>();
  const rects: Rect[] = [];
  const big = n >= 4;
  for (let i = 0; i < n; i++) {
    const span = i === 0 && big ? 2 : 1;
    let r = 0;
    let c = 0;
    search: for (r = 0; ; r++) {
      for (c = 0; c <= cols - span; c++) {
        let free = true;
        for (let dr = 0; dr < span; dr++) for (let dc = 0; dc < span; dc++) if (taken.has(`${r + dr},${c + dc}`)) free = false;
        if (free) break search;
      }
    }
    for (let dr = 0; dr < span; dr++) for (let dc = 0; dc < span; dc++) taken.add(`${r + dr},${c + dc}`);
    rects.push({ x: c * cellW, z: r * cellD, w: span * cellW, d: span * cellD });
  }
  const width = Math.max(...rects.map((q) => q.x + q.w));
  const depth = Math.max(...rects.map((q) => q.z + q.d));
  return rects.map((q) => ({ ...q, x: q.x - width / 2, z: q.z - depth / 2 }));
}
