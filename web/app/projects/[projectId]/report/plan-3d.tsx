"use client";

import type { Outcome } from "@siteproof/contract";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import styles from "./plan-3d.module.css";

export interface Room3D {
  id: string;
  name: string;
  /** What the plan holds for this room and item. */
  qty: number;
  counted: number;
  outcome: Outcome;
}

/**
 * The rooms as a 3D model. Loaded only when someone opens the 3D view.
 *
 * Nothing here is measured. SiteProof knows each room's claim and count, not its
 * size or where a window sits, so the rooms are laid out automatically (the same
 * arrangement as the 2D plan) and window markers are spaced evenly round each room.
 * A counted window is a solid frame; the rest are plain markers. No marker ever says
 * "missing here": the floor colour carries the outcome, and the evidence panel carries
 * the frames.
 */
export default function Plan3D({ rooms, selectedId, onSelect }: { rooms: Room3D[]; selectedId: string | undefined; onSelect: (id: string) => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const onSelectRef = useRef(onSelect);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // The scene is rebuilt when the rooms or their quantities change (another item, another project).
  const layoutKey = rooms.map((r) => `${r.id}:${r.qty}`).join("|");
  useEffect(() => {
    const stage = stageRef.current;
    const labels = labelsRef.current;
    if (!stage || !labels) return;
    let handle: SceneHandle;
    try {
      handle = buildScene(stage, labels, rooms, (id) => onSelectRef.current(id));
    } catch {
      // No WebGL (old phone, blocked GPU): say so; the 2D plan still works.
      queueMicrotask(() => setFailed(true));
      return;
    }
    sceneRef.current = handle;
    return () => {
      handle.dispose();
      sceneRef.current = null;
    };
    // rooms is read through layoutKey on purpose: outcome changes are applied below, without a rebuild.
  }, [layoutKey]);

  useEffect(() => {
    sceneRef.current?.apply(rooms, selectedId);
  }, [rooms, selectedId]);

  if (failed) {
    return <div className={styles.failed}>The 3D view isn&apos;t available on this device. Switch back to Plan.</div>;
  }

  return (
    <div className={styles.stage} ref={stageRef}>
      <div ref={labelsRef} className={styles.labels} aria-hidden="true" />
      <div className={styles.legend} aria-hidden="true">
        <span>
          <i className={styles.swVerified} />
          Verified
        </span>
        <span>
          <i className={styles.swShort} />
          Short
        </span>
        <span>
          <i className={styles.swNotSeen} />
          Not seen yet
        </span>
        <span>
          <i className={styles.swCounted} />
          Window counted
        </span>
        <span>
          <i className={styles.swMarker} />
          In the plan, not counted
        </span>
      </div>
      <span className={styles.hint}>Drag to turn · pinch or scroll to zoom · tap a room</span>
    </div>
  );
}

/* ---------- Layout ---------- */

interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

const CELL_W = 3.2;
const CELL_D = 2.6;
const WALL_H = 2.4;

/**
 * Rooms placed like the 2D plan's grid: three columns, the first room two cells by
 * two, the rest filling in reading order. Not to scale.
 */
function autoLayout(n: number): Rect[] {
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
    rects.push({ x: c * CELL_W, z: r * CELL_D, w: span * CELL_W, d: span * CELL_D });
  }
  const width = Math.max(...rects.map((q) => q.x + q.w));
  const depth = Math.max(...rects.map((q) => q.z + q.d));
  return rects.map((q) => ({ ...q, x: q.x - width / 2, z: q.z - depth / 2 }));
}

/**
 * Evenly spaced points along a room's outside walls, inset from the corners. Windows
 * sit in outside walls, and a marker on a shared wall would look as if it belonged to
 * the room next door. A room with no outside wall in the layout uses all four.
 */
function markerSpots(rect: Rect, n: number, bounds: Rect) {
  const inset = 0.35;
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const all = [
    { outside: near(rect.z, bounds.z), len: rect.w - 2 * inset, at: (t: number) => ({ x: rect.x + inset + t, z: rect.z, rot: 0 }) },
    { outside: near(rect.x + rect.w, bounds.x + bounds.w), len: rect.d - 2 * inset, at: (t: number) => ({ x: rect.x + rect.w, z: rect.z + inset + t, rot: Math.PI / 2 }) },
    { outside: near(rect.z + rect.d, bounds.z + bounds.d), len: rect.w - 2 * inset, at: (t: number) => ({ x: rect.x + rect.w - inset - t, z: rect.z + rect.d, rot: 0 }) },
    { outside: near(rect.x, bounds.x), len: rect.d - 2 * inset, at: (t: number) => ({ x: rect.x, z: rect.z + rect.d - inset - t, rot: Math.PI / 2 }) },
  ];
  const sides = all.some((x) => x.outside) ? all.filter((x) => x.outside) : all;
  const total = sides.reduce((s, x) => s + x.len, 0);
  const width = Math.min(1.1, (total / Math.max(n, 1)) * 0.55);
  return Array.from({ length: n }, (_, i) => {
    let t = ((i + 0.5) / n) * total;
    for (const side of sides) {
      if (t <= side.len) return { ...side.at(Math.min(Math.max(t, width / 2), side.len - width / 2)), width };
      t -= side.len;
    }
    return { ...sides[0].at(0), width };
  });
}

/* ---------- Scene ---------- */

interface SceneHandle {
  apply(rooms: Room3D[], selectedId: string | undefined): void;
  dispose(): void;
}

const COLORS = {
  verified: 0x1d5550,
  short: 0x5b3524,
  line: 0xdce9f7,
  mark: 0xf26b1d,
  counted: 0x9be7b0,
  marker: 0xb8c7d8,
};

function hatchTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#163A6B";
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = "rgba(220,233,247,0.55)";
  g.lineWidth = 3;
  for (let i = -64; i < 128; i += 16) {
    g.beginPath();
    g.moveTo(i, 64);
    g.lineTo(i + 64, 0);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildScene(stage: HTMLDivElement, labelLayer: HTMLDivElement, rooms: Room3D[], onPick: (id: string) => void): SceneHandle {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x07172b);
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", "3D model of the rooms. Use the room list or the plan to choose a room.");
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.minDistance = 4;
  controls.maxDistance = 32;

  const grid = new THREE.GridHelper(48, 96, 0x2a4b78, 0x14304f);
  grid.position.y = -0.01;
  scene.add(grid);

  const disposables: { dispose(): void }[] = [grid.geometry, grid.material as THREE.Material];
  const track = <T extends { dispose(): void }>(x: T) => {
    disposables.push(x);
    return x;
  };
  const hatch = track(hatchTexture());
  const basic = (opts: THREE.MeshBasicMaterialParameters) => track(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0, ...opts }));
  const lines = (color: number, opacity: number, dashed = false) =>
    track(
      dashed
        ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.12, gapSize: 0.08 })
        : new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    );

  const layout = autoLayout(rooms.length);
  const minX = Math.min(...layout.map((q) => q.x));
  const minZ = Math.min(...layout.map((q) => q.z));
  const bounds: Rect = {
    x: minX,
    z: minZ,
    w: Math.max(...layout.map((q) => q.x + q.w)) - minX,
    d: Math.max(...layout.map((q) => q.z + q.d)) - minZ,
  };
  const span = Math.max(...layout.map((r) => Math.max(Math.abs(r.x), Math.abs(r.x + r.w), Math.abs(r.z), Math.abs(r.z + r.d))));
  const home = new THREE.Vector3(span * 0.7, span * 1.4 + 4, span * 1.4 + 4);
  camera.position.copy(home);
  controls.target.set(0, 0, 0);

  interface RoomMeshes {
    floors: Record<Outcome, THREE.Mesh>;
    outline: THREE.LineLoop;
    markers: { solid: THREE.Mesh; solidEdge: THREE.LineSegments; markerEdge: THREE.LineSegments }[];
    centre: THREE.Vector3;
    label: HTMLDivElement;
  }
  const byId = new Map<string, RoomMeshes>();
  const pickable: THREE.Object3D[] = [];
  const fading: THREE.Material[] = [];

  rooms.forEach((room, i) => {
    const r = layout[i];
    const cx = r.x + r.w / 2;
    const cz = r.z + r.d / 2;

    const floorGeo = track(new THREE.PlaneGeometry(r.w - 0.06, r.d - 0.06));
    const tex = track(hatch.clone());
    tex.needsUpdate = true;
    tex.repeat.set(r.w / 1.2, r.d / 1.2);
    const floor = (mat: THREE.Material) => {
      const m = new THREE.Mesh(floorGeo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(cx, 0.01, cz);
      m.userData.room = room.id;
      scene.add(m);
      return m;
    };
    const floors: Record<Outcome, THREE.Mesh> = {
      verified: floor(basic({ color: COLORS.verified })),
      short: floor(basic({ color: COLORS.short })),
      not_seen: floor(basic({ map: tex })),
    };
    // A solid, invisible floor for tapping, whatever the outcome.
    // Raycasting ignores visibility, so this hidden floor still catches taps.
    const hit = floor(basic({}));
    hit.visible = false;
    pickable.push(hit);

    const corners = [
      [r.x, r.z],
      [r.x + r.w, r.z],
      [r.x + r.w, r.z + r.d],
      [r.x, r.z + r.d],
    ].map(([x, z]) => new THREE.Vector3(x, 0.03, z));
    const outline = new THREE.LineLoop(track(new THREE.BufferGeometry().setFromPoints(corners)), lines(COLORS.line, 0.5));
    scene.add(outline);

    const walls = [
      { x: cx, z: r.z, len: r.w, rot: 0 },
      { x: cx, z: r.z + r.d, len: r.w, rot: 0 },
      { x: r.x, z: cz, len: r.d, rot: Math.PI / 2 },
      { x: r.x + r.w, z: cz, len: r.d, rot: Math.PI / 2 },
    ];
    for (const wl of walls) {
      const geo = track(new THREE.BoxGeometry(wl.len, WALL_H, 0.08));
      const glass = new THREE.Mesh(geo, basic({ color: COLORS.line, opacity: 0.05 }));
      glass.position.set(wl.x, WALL_H / 2, wl.z);
      glass.rotation.y = wl.rot;
      scene.add(glass);
      const edge = new THREE.LineSegments(track(new THREE.EdgesGeometry(geo)), lines(COLORS.line, 0.4));
      edge.position.copy(glass.position);
      edge.rotation.copy(glass.rotation);
      scene.add(edge);
    }

    const markers = markerSpots(r, room.qty, bounds).map((spot) => {
      const geo = track(new THREE.BoxGeometry(spot.width, 1.1, 0.14));
      const solid = new THREE.Mesh(geo, basic({ color: COLORS.counted }));
      solid.position.set(spot.x, 1.45, spot.z);
      solid.rotation.y = spot.rot;
      scene.add(solid);
      const edges = track(new THREE.EdgesGeometry(geo));
      const solidEdge = new THREE.LineSegments(edges, lines(0xe9fff0, 0));
      const markerEdge = new THREE.LineSegments(edges, lines(COLORS.marker, 0, true));
      for (const l of [solidEdge, markerEdge]) {
        l.position.copy(solid.position);
        l.rotation.copy(solid.rotation);
        l.computeLineDistances();
        scene.add(l);
      }
      return { solid, solidEdge, markerEdge };
    });

    const label = document.createElement("div");
    label.className = styles.label;
    const name = document.createElement("b");
    name.textContent = room.name;
    const count = document.createElement("span");
    label.append(name, count);
    labelLayer.append(label);

    byId.set(room.id, { floors, outline, markers, centre: new THREE.Vector3(cx, 0, cz), label });
  });

  const fadeTo = (mat: THREE.Material, target: number) => {
    mat.userData.target = target;
    if (reduced) mat.opacity = target;
    if (!fading.includes(mat)) fading.push(mat);
  };

  let fly: { from: { t: THREE.Vector3; p: THREE.Vector3 }; to: { t: THREE.Vector3; p: THREE.Vector3 }; start: number } | null = null;
  let lastSelected: string | undefined;
  const flyTo = (id: string) => {
    const m = byId.get(id);
    if (!m) return;
    // Pull back further on narrow screens, so the rooms around it stay in view.
    const k = Math.max(1, 1.1 / camera.aspect);
    const to = { t: m.centre.clone(), p: m.centre.clone().add(new THREE.Vector3(4, 9, 9).multiplyScalar(k)) };
    if (reduced) {
      controls.target.copy(to.t);
      camera.position.copy(to.p);
      return;
    }
    fly = { from: { t: controls.target.clone(), p: camera.position.clone() }, to, start: performance.now() };
  };

  let current = rooms;
  const apply = (next: Room3D[], selectedId: string | undefined) => {
    current = next;
    for (const room of next) {
      const m = byId.get(room.id);
      if (!m) continue;
      (Object.keys(m.floors) as Outcome[]).forEach((k) => fadeTo(m.floors[k].material as THREE.Material, k === room.outcome ? 1 : 0));
      const sel = room.id === selectedId;
      const outlineMat = m.outline.material as THREE.LineBasicMaterial;
      outlineMat.color.set(sel ? COLORS.mark : COLORS.line);
      outlineMat.opacity = sel ? 1 : 0.5;
      // Not seen yet shows no counted frames: the room wasn't judged.
      const counted = room.outcome === "not_seen" ? 0 : Math.min(room.counted, room.qty);
      m.markers.forEach((w, i) => {
        const isCounted = i < counted;
        fadeTo(w.solid.material as THREE.Material, isCounted ? 0.55 : 0);
        fadeTo(w.solidEdge.material as THREE.Material, isCounted ? 1 : 0);
        fadeTo(w.markerEdge.material as THREE.Material, isCounted ? 0 : 0.7);
      });
      (m.label.lastChild as HTMLElement).textContent = `${room.outcome === "not_seen" ? "–" : room.counted} / ${room.qty}`;
      m.label.dataset.selected = String(sel);
    }
    if (selectedId && selectedId !== lastSelected && lastSelected !== undefined) flyTo(selectedId);
    lastSelected = selectedId ?? lastSelected ?? "";
  };
  apply(rooms, undefined);
  for (const mat of fading) mat.opacity = mat.userData.target;

  // Tap (not drag) a floor to select its room.
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downAt: [number, number] | null = null;
  const onDown = (e: PointerEvent) => (downAt = [e.clientX, e.clientY]);
  const onUp = (e: PointerEvent) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const found = ray.intersectObjects(pickable)[0];
    if (found) onPick(found.object.userData.room as string);
  };
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);

  const resize = () => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();

  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const v = new THREE.Vector3();
  let raf = 0;
  const tick = (now: number) => {
    if (fly) {
      const t = Math.min(1, (now - fly.start) / 700);
      controls.target.lerpVectors(fly.from.t, fly.to.t, ease(t));
      camera.position.lerpVectors(fly.from.p, fly.to.p, ease(t));
      if (t >= 1) fly = null;
    }
    for (const mat of fading) {
      const target = mat.userData.target as number;
      mat.opacity += (target - mat.opacity) * 0.1;
      if (Math.abs(target - mat.opacity) < 0.005) mat.opacity = target;
    }
    controls.update();
    renderer.render(scene, camera);
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    for (const room of current) {
      const m = byId.get(room.id);
      if (!m) continue;
      v.copy(m.centre).setY(0.05).project(camera);
      m.label.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
      m.label.hidden = v.z > 1;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    apply,
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      labelLayer.replaceChildren();
    },
  };
}
