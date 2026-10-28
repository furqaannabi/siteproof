"use client";

import type * as Three from "three";
import { useEffect, useRef } from "react";
import s from "./landing.module.css";

/**
 * The landing's opening: a building going up, in blueprint light. Scrolling through the
 * pinned first screen builds it: each slab drops into place, its columns stand, its
 * windows fill in, the core and the crane climb ahead of the work. When the building
 * reaches Flat 302, the flat lights and a scan passes it, and the readout lands on the
 * demo's own answer: 9 of 12 windows verified.
 *
 * An illustration, not a measurement: SiteProof knows each room's claim and count, not
 * the building's shape. The demo's numbers are the only facts in it.
 *
 * three.js is fetched only in the browser, after first paint. Reduced motion shows the
 * finished building, still. Without WebGL the blueprint ground and the readout remain.
 */

const FLOORS = 14;
const FLAT_FLOOR = 2; // Flat 302: the third floor, counting the ground floor as 0
const W = 11; // tower width (x)
const D = 7; // tower depth (z)
const H = 1.25; // floor height
const PODIUM = 2; // the first floors are a wider podium
const PW = 16;
const PD = 10;
const BAYS = 5; // window bays on the long faces
const SIDE_BAYS = 3;

const NAVY = 0x0d2747;
const LINE = 0xdce9f7;
const GREEN = 0x7fd08d;
const RUST = 0xffb38a;
const ORANGE = 0xe8590c;
const GREY = 0xc9d3df;

/** How far the build has got for a floor, 0 to 1, given overall progress. */
const floorProgress = (p: number, f: number) => Math.min(1, Math.max(0, p * (FLOORS + 2) - f));
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function BuildScene() {
  const stageRef = useRef<HTMLDivElement>(null);
  const levelRef = useRef<HTMLElement>(null);
  const percentRef = useRef<HTMLElement>(null);
  const flatRef = useRef<HTMLDivElement>(null);
  const gaugeRef = useRef<HTMLOListElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const section = stage?.closest("section");
    if (!stage || !section) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ticks = [...(gaugeRef.current?.children ?? [])] as HTMLElement[];

    /** The readout, set straight on the DOM every frame rather than through React. */
    const readout = (p: number) => {
      const built = Math.min(FLOORS, Math.floor(p * (FLOORS + 2)));
      const level = Math.max(1, Math.min(FLOORS, built + 1));
      if (levelRef.current) levelRef.current.textContent = String(level).padStart(2, "0");
      if (percentRef.current) percentRef.current.textContent = `${Math.round(Math.min(1, p / 0.875) * 100)}%`;
      ticks.forEach((t, i) => {
        const floor = FLOORS - 1 - i;
        t.dataset.state = floor < built ? "built" : floor === built ? "working" : "planned";
      });
      if (flatRef.current) flatRef.current.dataset.lit = String(p > 0.8);
      if (hintRef.current) hintRef.current.style.opacity = p > 0.85 ? "0" : "1";
    };

    /** Scroll progress through the pinned section, 0 at its top to 1 when it lets go. */
    const scrollProgress = () => {
      const r = section.getBoundingClientRect();
      const run = r.height - window.innerHeight;
      return run > 0 ? Math.min(1, Math.max(0, -r.top / run)) : 1;
    };

    let disposed = false;
    let cleanup: (() => void) | undefined;
    readout(reduced ? 1 : 0.3);

    const start = async () => {
      const probe = document.createElement("canvas");
      if (!probe.getContext("webgl2") && !probe.getContext("webgl")) {
        // No 3D: the readout still follows the scroll.
        const onScroll = () => readout(Math.max(0.3, 0.3 + scrollProgress() * 0.7));
        window.addEventListener("scroll", onScroll, { passive: true });
        cleanup = () => window.removeEventListener("scroll", onScroll);
        return;
      }
      const [THREE, { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
        import("three"),
        import("three/examples/jsm/postprocessing/EffectComposer.js"),
        import("three/examples/jsm/postprocessing/RenderPass.js"),
        import("three/examples/jsm/postprocessing/UnrealBloomPass.js"),
        import("three/examples/jsm/postprocessing/OutputPass.js"),
      ]);
      if (disposed) return;

      // Whether the screen is phone-sized, re-read on every resize.
      const narrow = window.matchMedia("(max-width: 899px)");
      let phone = narrow.matches;
      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      const ratio = Math.min(window.devicePixelRatio, phone ? 1.25 : 1.5);
      renderer.setPixelRatio(ratio);
      // The bloom chain encodes colour once at the end, so the ground is given in linear light.
      const groundColor = new THREE.Color(NAVY).convertSRGBToLinear();
      renderer.setClearColor(groundColor, 1);
      renderer.domElement.setAttribute("aria-hidden", "true");
      stage.prepend(renderer.domElement);

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(groundColor, 26, 80);
      const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 300);
      const world = new THREE.Group();
      scene.add(world);

      const disposables: { dispose(): void }[] = [];
      const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
      const lineMat = (color: number, opacity: number) =>
        keep(new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
      const fillMat = (color: number, opacity: number) =>
        keep(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: true }));
      const lines = (pts: number[], material: Three.Material, parent: Three.Object3D) => {
        const g = keep(new THREE.BufferGeometry());
        g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
        const l = new THREE.LineSegments(g, material);
        if (material instanceof THREE.LineDashedMaterial) l.computeLineDistances();
        parent.add(l);
        return l;
      };
      /** A box drawn as its twelve edges plus a faint fill. */
      const box = (w: number, h: number, d: number, edge: Three.Material, fill: Three.Material | null, parent: Three.Object3D) => {
        const geo = keep(new THREE.BoxGeometry(w, h, d));
        const edges = new THREE.LineSegments(keep(new THREE.EdgesGeometry(geo)), edge);
        parent.add(edges);
        if (fill) edges.add(new THREE.Mesh(geo, fill));
        return edges;
      };
      /** A rectangle in a vertical plane, as four segments. */
      const rect = (out: number[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
        const a = [x0, y0, z0], b = [x1, y0, z1], c = [x1, y1, z1], d = [x0, y1, z0];
        out.push(...a, ...b, ...b, ...c, ...c, ...d, ...d, ...a);
      };
      /** A rectangle on the ground, as four segments. */
      const groundRect = (out: number[], hx: number, hz: number, y: number) =>
        out.push(-hx, y, -hz, hx, y, -hz, hx, y, -hz, hx, y, hz, hx, y, hz, -hx, y, hz, -hx, y, hz, -hx, y, -hz);

      // ---- The site: a drafting grid and the plot boundary, dashed.
      const site: number[] = [];
      for (let i = -40; i <= 40; i += 2) site.push(i, 0, -40, i, 0, 40, -40, 0, i, 40, 0, i);
      lines(site, lineMat(LINE, 0.06), world);
      const plot: number[] = [];
      groundRect(plot, 12, 9, 0.01);
      lines(plot, keep(new THREE.LineDashedMaterial({ color: ORANGE, transparent: true, opacity: 0.55, dashSize: 0.5, gapSize: 0.35, depthWrite: false })), world);

      // ---- Floors: each its own group, so it can drop into place and fade in.
      interface Floor {
        group: Three.Group;
        mats: Three.Material[];
        base: number[];
        windows: Three.Material;
      }
      const floors: Floor[] = [];
      const sizeOf = (f: number) => (f < PODIUM ? { fw: PW, fd: PD } : { fw: W, fd: D });
      for (let f = 0; f < FLOORS; f++) {
        const podium = f < PODIUM;
        const { fw, fd } = sizeOf(f);
        const hx = fw / 2, hz = fd / 2;
        const group = new THREE.Group();
        group.position.y = f * H;
        world.add(group);
        const mats: Three.Material[] = [], base: number[] = [];
        const add = <M extends Three.Material>(mm: M) => (mats.push(mm), base.push(mm.opacity), mm);

        // Slab, with a balcony along the front on the tower floors.
        const slab = box(fw + 0.4, 0.14, fd + 0.4, add(lineMat(LINE, 0.85)), add(fillMat(LINE, 0.05)), group);
        slab.position.y = 0.07;
        if (!podium) {
          const lip: number[] = [];
          const bz = hz + 1.1;
          lip.push(-hx + 1, 0.14, hz, -hx + 1, 0.14, bz, -hx + 1, 0.14, bz, hx - 1, 0.14, bz, hx - 1, 0.14, bz, hx - 1, 0.14, hz);
          lip.push(-hx + 1, 0.9, bz, hx - 1, 0.9, bz, -hx + 1, 0.14, bz, -hx + 1, 0.9, bz, hx - 1, 0.14, bz, hx - 1, 0.9, bz);
          for (let x = -hx + 2; x < hx - 1; x += 1) lip.push(x, 0.14, bz, x, 0.9, bz);
          lines(lip, add(lineMat(LINE, 0.4)), group);
        }
        // Columns on a grid.
        const cols: number[] = [];
        for (let i = 0; i <= BAYS; i++) {
          const x = -hx + (fw / BAYS) * i;
          cols.push(x, 0, -hz, x, H, -hz, x, 0, hz, x, H, hz);
        }
        for (let j = 1; j < SIDE_BAYS; j++) {
          const z = -hz + (fd / SIDE_BAYS) * j;
          cols.push(-hx, 0, z, -hx, H, z, hx, 0, z, hx, H, z);
        }
        lines(cols, add(lineMat(LINE, 0.5)), group);
        // Glass: a faint fill on the four faces.
        const glass = add(fillMat(0x6fa8e8, 0.035));
        for (const [span, x, z, ry] of [
          [fw, 0, hz, 0],
          [fw, 0, -hz, 0],
          [fd, hx, 0, Math.PI / 2],
          [fd, -hx, 0, Math.PI / 2],
        ] as const) {
          const pane = new THREE.Mesh(keep(new THREE.PlaneGeometry(span, H - 0.14)), glass);
          pane.position.set(x, H / 2 + 0.07, z);
          pane.rotation.y = ry;
          group.add(pane);
        }
        // Window frames in every bay; Flat 302's are drawn by outcome below.
        const wins: number[] = [];
        if (f !== FLAT_FLOOR) {
          const y0 = 0.36, y1 = H - 0.2;
          for (let b = 0; b < BAYS; b++) {
            const bw = fw / BAYS, x0 = -hx + bw * b + 0.35, x1 = x0 + bw - 0.7;
            rect(wins, x0, y0, hz, x1, y1, hz);
            rect(wins, x0, y0, -hz, x1, y1, -hz);
          }
          for (let b = 0; b < SIDE_BAYS; b++) {
            const bd = fd / SIDE_BAYS, z0 = -hz + bd * b + 0.3, z1 = z0 + bd - 0.6;
            rect(wins, hx, y0, z0, hx, y1, z1);
            rect(wins, -hx, y0, z0, -hx, y1, z1);
          }
        }
        const windows = lineMat(LINE, 0.3);
        lines(wins, windows, group);
        floors.push({ group, mats, base, windows });
      }

      // ---- Flat 302: twelve windows in the demo's outcomes, lit when the build reaches it.
      const flatFloor = floors[FLAT_FLOOR];
      const { fw, fd } = sizeOf(FLAT_FLOOR);
      const hx = fw / 2, hz = fd / 2;
      const order: ("v" | "s" | "n")[] = ["v", "v", "s", "s", "v", "v", "v", "v", "v", "v", "v", "n"];
      const slots: { x0: number; x1: number; z0: number; z1: number }[] = [];
      for (let b = 0; b < BAYS; b++) {
        const bw = fw / BAYS, x0 = -hx + bw * b + 0.35;
        slots.push({ x0, x1: x0 + bw - 0.7, z0: hz, z1: hz });
      }
      for (const x of [hx, -hx]) {
        for (let b = 0; b < SIDE_BAYS; b++) {
          const bd = fd / SIDE_BAYS, z0 = -hz + bd * b + 0.3;
          slots.push({ x0: x, x1: x, z0, z1: z0 + bd - 0.6 });
        }
      }
      slots.push({ x0: -hx + 0.35, x1: -hx + fw / BAYS - 0.35, z0: -hz, z1: -hz });
      const greenLines = lineMat(GREEN, 0), rustLines = lineMat(RUST, 0);
      const greyLines = keep(new THREE.LineDashedMaterial({ color: GREY, transparent: true, opacity: 0, dashSize: 0.14, gapSize: 0.1, depthWrite: false }));
      const greenFill = fillMat(GREEN, 0), rustFill = fillMat(RUST, 0);
      const vPts: number[] = [], sPts: number[] = [], nPts: number[] = [];
      const fy0 = 0.36, fy1 = H - 0.2;
      slots.forEach((sl, i) => {
        const kind = order[i];
        rect(kind === "v" ? vPts : kind === "s" ? sPts : nPts, sl.x0, fy0, sl.z0, sl.x1, fy1, sl.z1);
        if (kind === "n") return;
        const along = Math.abs(sl.x1 - sl.x0) > Math.abs(sl.z1 - sl.z0);
        const pane = new THREE.Mesh(keep(new THREE.PlaneGeometry(along ? sl.x1 - sl.x0 : sl.z1 - sl.z0, fy1 - fy0)), kind === "v" ? greenFill : rustFill);
        pane.position.set((sl.x0 + sl.x1) / 2, (fy0 + fy1) / 2, (sl.z0 + sl.z1) / 2);
        if (!along) pane.rotation.y = Math.PI / 2;
        flatFloor.group.add(pane);
      });
      lines(vPts, greenLines, flatFloor.group);
      lines(sPts, rustLines, flatFloor.group);
      lines(nPts, greyLines, flatFloor.group);
      const flatOutline = lineMat(ORANGE, 0), flatGlow = fillMat(ORANGE, 0);
      box(fw + 0.5, H, fd + 0.5, flatOutline, flatGlow, flatFloor.group).position.y = H / 2;
      const flatLit: [Three.Material, number][] = [
        [greenLines, 1],
        [rustLines, 1],
        [greyLines, 0.9],
        [greenFill, 0.32],
        [rustFill, 0.3],
        [flatOutline, 1],
        [flatGlow, 0.07],
      ];

      // ---- The core: a lift shaft that climbs ahead of the floors.
      const core = new THREE.Group();
      core.position.set(-1.5, 0, -0.5);
      world.add(core);
      box(2.6, 1, 2.6, lineMat(LINE, 0.75), fillMat(LINE, 0.04), core).position.y = 0.5;

      // ---- Formwork on the floor being built: a cage with braces, in orange.
      const formwork = new THREE.Group();
      world.add(formwork);
      const fwPts: number[] = [];
      const fx = W / 2 + 0.6, fz = D / 2 + 0.6;
      for (const [x, z] of [[-fx, -fz], [fx, -fz], [fx, fz], [-fx, fz]]) fwPts.push(x, 0, z, x, H * 1.4, z);
      for (const y of [0, H * 0.7, H * 1.4]) groundRect(fwPts, fx, fz, y);
      for (let i = 0; i < 6; i++) {
        const x = -fx + ((2 * fx) / 6) * i;
        fwPts.push(x, 0, fz, x + (2 * fx) / 6, H * 1.4, fz, x, 0, -fz, x + (2 * fx) / 6, H * 1.4, -fz);
      }
      const formMat = lineMat(ORANGE, 0.55);
      lines(fwPts, formMat, formwork);

      // ---- The crane: a lattice mast on the core, a jib that swings, a hook line.
      const crane = new THREE.Group();
      crane.position.set(-1.5, 0, -0.5);
      world.add(crane);
      const mast: number[] = [];
      const m = 0.45;
      for (let y = 0; y < 30; y += 0.9) {
        groundRect(mast, m, m, y);
        mast.push(-m, y, -m, m, y + 0.9, -m, m, y, m, -m, y + 0.9, m);
      }
      for (const [x, z] of [[-m, -m], [m, -m], [m, m], [-m, m]]) mast.push(x, 0, z, x, 30, z);
      const mastLines = lines(mast, lineMat(LINE, 0.5), crane);
      const jib = new THREE.Group();
      crane.add(jib);
      const jibPts: number[] = [];
      for (let x = -5; x < 16; x += 1) jibPts.push(x, 0, -0.35, x + 1, 0, -0.35, x, 0, 0.35, x + 1, 0, 0.35, x, 0, -0.35, x + 1, 0.7, 0, x, 0, 0.35, x + 1, 0.7, 0);
      jibPts.push(-5, 0.7, 0, 16, 0.7, 0, 0, 0.7, 0, 0, 3.2, 0, 0, 3.2, 0, 16, 0.7, 0, 0, 3.2, 0, -5, 0.7, 0);
      lines(jibPts, lineMat(LINE, 0.6), jib);
      const hook = lines([11, 0, 0, 11, -6, 0], lineMat(ORANGE, 0.8), jib);
      box(2.2, 1, 1.2, lineMat(LINE, 0.6), fillMat(LINE, 0.05), jib).position.set(-4, -0.4, 0);

      // ---- The scan: a ring that passes Flat 302 once the flat is reached.
      const scan = new THREE.Group();
      world.add(scan);
      const ring: number[] = [];
      const rx = PW / 2 + 0.8, rz = PD / 2 + 0.8;
      groundRect(ring, rx, rz, 0);
      const scanLine = lineMat(ORANGE, 0);
      lines(ring, scanLine, scan);
      const scanFill = fillMat(ORANGE, 0);
      const scanPlane = new THREE.Mesh(keep(new THREE.PlaneGeometry(rx * 2, rz * 2)), scanFill);
      scanPlane.rotation.x = -Math.PI / 2;
      scan.add(scanPlane);

      // ---- Bloom: the lines glow like a drawing lit from behind.
      const composer = new EffectComposer(renderer);
      composer.setPixelRatio(ratio);
      composer.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), phone ? 0.55 : 0.75, 0.2, 0.5);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());

      let width = 1, height = 1;
      const resize = () => {
        phone = narrow.matches;
        width = stage.clientWidth;
        height = stage.clientHeight;
        renderer.setSize(width, height, false);
        composer.setSize(width, height);
        bloom.resolution.set(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(stage);

      // Drag turns the building; the slow turn resumes on letting go.
      let drag = 0, dragging = false, lastX = 0;
      const down = (e: PointerEvent) => {
        if ((e.target as HTMLElement).closest("a, button")) return;
        dragging = true;
        lastX = e.clientX;
      };
      const move = (e: PointerEvent) => {
        if (!dragging) return;
        drag += (e.clientX - lastX) * 0.006;
        lastX = e.clientX;
      };
      const up = () => (dragging = false);
      section.addEventListener("pointerdown", down);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);

      const anchor = new THREE.Vector3();
      const projected = new THREE.Vector3();
      const t0 = performance.now();
      let shown = reduced ? 1 : 0;
      let spin = 0.5;

      const draw = (now: number) => {
        const t = (now - t0) / 1000;
        // A short build on arrival, then the scroll takes over.
        const intro = 0.3 * ease(Math.min(1, t / 3.2));
        const target = reduced ? 1 : Math.max(intro, 0.3 + scrollProgress() * 0.7);
        shown += (target - shown) * (reduced ? 1 : 0.08);
        const p = shown;

        // Floors drop in from above and fade up; their windows follow.
        floors.forEach((fl, f) => {
          const k = floorProgress(p, f);
          const e = ease(k);
          fl.group.visible = k > 0;
          fl.group.position.y = f * H + (1 - e) * 2.4;
          fl.mats.forEach((mm, i) => (mm.opacity = fl.base[i] * e));
          fl.windows.opacity = 0.3 * Math.min(1, Math.max(0, (k - 0.55) / 0.45));
        });
        const top = Math.min(FLOORS, p * (FLOORS + 2)) * H;
        const working = Math.min(FLOORS - 1, Math.floor(p * (FLOORS + 2)));
        formwork.visible = p > 0.02 && p < 0.97;
        formwork.position.y = Math.max(PODIUM, working) * H;
        formMat.opacity = 0.35 + 0.25 * Math.sin(t * 3);
        core.scale.y = Math.max(0.01, top + H * 1.6);
        const mastTop = Math.max(6, top + 5);
        jib.position.y = mastTop;
        mastLines.scale.y = mastTop / 30;
        jib.rotation.y = reduced ? 0.8 : 0.8 + Math.sin(t * 0.25) * 0.9;
        hook.scale.y = 0.6 + 0.4 * Math.sin(t * 0.7);

        // Flat 302 lights once the build has passed it.
        const lit = Math.min(1, Math.max(0, (p - 0.74) / 0.12));
        flatLit.forEach(([mm, full]) => (mm.opacity = full * lit));
        const sweep = reduced ? 0.5 : (Math.sin(t * 1.2) + 1) / 2;
        scan.position.y = FLAT_FLOOR * H - 0.6 + sweep * (H + 1.2);
        scanLine.opacity = 0.9 * lit;
        scanFill.opacity = 0.06 * lit;

        // Camera: low and close at the footings, higher and wider as the tower rises.
        if (!reduced && !dragging) spin += 0.0018;
        world.rotation.y = spin + drag;
        // Looking at a point left of the tower puts it right of the headline on a desktop.
        const aim = phone ? 0 : -9;
        const dist = (phone ? 48 : 40) + top * 0.75;
        camera.position.set(aim + 3, 3 + top * 0.45, dist);
        camera.lookAt(aim, 1 + top * 0.45, 0);

        composer.render();
        readout(p);

        // The flat's label follows its corner on screen.
        const label = labelRef.current;
        if (label) {
          anchor.set(hx + 0.25, FLAT_FLOOR * H + H / 2, hz + 0.25).applyMatrix4(world.matrixWorld);
          projected.copy(anchor).project(camera);
          label.style.transform = `translate(${Math.round(((projected.x + 1) / 2) * width + 16)}px, ${Math.round(((1 - projected.y) / 2) * height - 14)}px)`;
          label.style.opacity = String(lit);
        }
      };

      let frame = 0;
      let running = true;
      const loop = (now: number) => {
        draw(now);
        frame = running ? requestAnimationFrame(loop) : 0;
      };
      // Pause once the section has scrolled away or the tab is hidden.
      const wake = () => {
        const r = section.getBoundingClientRect();
        const should = r.bottom > 0 && r.top < window.innerHeight && !document.hidden;
        if (should && !running) {
          running = true;
          frame = requestAnimationFrame(loop);
        }
        running = should;
      };
      window.addEventListener("scroll", wake, { passive: true });
      document.addEventListener("visibilitychange", wake);
      frame = requestAnimationFrame(loop);
      stage.dataset.ready = "true";

      cleanup = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        section.removeEventListener("pointerdown", down);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("scroll", wake);
        document.removeEventListener("visibilitychange", wake);
        disposables.forEach((d) => d.dispose());
        composer.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    };

    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 150));
    const handle = idle(() => void start());
    return () => {
      disposed = true;
      if (window.cancelIdleCallback && typeof handle === "number") window.cancelIdleCallback(handle);
      cleanup?.();
    };
  }, []);

  return (
    <>
      <div className={s.towerStage} ref={stageRef}>
        <span className={s.towerLabel} ref={labelRef} aria-hidden="true">
          Flat 302
        </span>
      </div>

      {/* The level gauge: the building's floors, top to bottom, with Flat 302 marked. */}
      <ol className={s.gauge} ref={gaugeRef} aria-hidden="true">
        {Array.from({ length: FLOORS }, (_, i) => {
          const floor = FLOORS - 1 - i;
          return (
            <li key={floor} data-flat={floor === FLAT_FLOOR || undefined}>
              <span>{floor === FLAT_FLOOR ? "302" : String(floor + 1).padStart(2, "0")}</span>
            </li>
          );
        })}
      </ol>

      <div className={s.readout} aria-hidden="true">
        <div className={s.readoutRow}>
          <span>Level</span>
          <b ref={levelRef}>05</b>
        </div>
        <div className={s.readoutRow}>
          <span>Structure</span>
          <b ref={percentRef}>34%</b>
        </div>
        <div className={s.readoutFlat} ref={flatRef} data-lit="false">
          <span>Flat 302 · windows</span>
          <b>9 of 12 verified</b>
        </div>
      </div>

      <p className={s.buildHint} ref={hintRef} aria-hidden="true">
        Scroll to build
      </p>
    </>
  );
}
