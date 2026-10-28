import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * The landing page's tower: built floor by floor, then Flat 302's Bedroom 2 is swept and
 * its windows outlined, then the camera pulls back with each window in its outcome colour.
 *
 * Everything shown is the demo flat's story: 2 of 4 windows installed in Bedroom 2 (Short 2)
 * and the kitchen window not filmed (Not seen yet). Nothing here is computed; it illustrates.
 */

/** Scroll progress through the scene at which each beat happens. */
export const BEATS = {
  built: 0.36,
  sweepStart: 0.55,
  sweepEnd: 0.8,
  result: 0.84,
};

export interface SceneFrame {
  /** Smoothed progress, 0 to 1. */
  p: number;
  /** Windows outlined so far in the sweep. */
  counted: number;
}

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const FLOORS = 10;
const FH = 3.2;
const W = 18;
const D = 11;
const BAYS = 8;
const BW = W / BAYS;
const WW = 1.4;
const WH = 1.6;
const SILL = 0.95;
const FLAT_FLOOR = 2; // Flat 302: the third floor
const MAST = 46;
const bayX = (i: number) => -W / 2 + BW * (i + 0.5);

const COLOURS = { verified: 0x2fa86c, short: 0xff7a1a, unseen: 0x9aa8a2 };

/**
 * Starts the scene on `canvas`. `target()` is the scroll progress to ease toward;
 * `onFrame` is called each drawn frame. Returns a function that stops and frees it.
 */
export function startTowerScene(
  canvas: HTMLCanvasElement,
  { target, onFrame, visible, reduceMotion }: { target: () => number; onFrame: (f: SceneFrame) => void; visible: () => boolean; reduceMotion: boolean },
): () => void {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // Golden-hour sky: deep binding green overhead into a warm horizon.
  const skyCanvas = document.createElement("canvas");
  skyCanvas.width = 2;
  skyCanvas.height = 512;
  const g = skyCanvas.getContext("2d")!;
  const gr = g.createLinearGradient(0, 0, 0, 512);
  [
    [0, "#0f2a22"],
    [0.45, "#2f5d4c"],
    [0.72, "#c99a6b"],
    [0.86, "#f3c48e"],
    [1, "#f6dcb6"],
  ].forEach(([o, c]) => gr.addColorStop(o as number, c as string));
  g.fillStyle = gr;
  g.fillRect(0, 0, 2, 512);
  const skyTexture = new THREE.CanvasTexture(skyCanvas);
  skyTexture.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTexture;
  scene.fog = new THREE.Fog(0xd9b48c, 70, 190);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  scene.add(new THREE.HemisphereLight(0xffe9cf, 0x2f4a3f, 0.55));
  const sun = new THREE.DirectionalLight(0xffc98f, 3.2);
  sun.position.set(-40, 32, 28);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 50, bottom: -10, near: 1, far: 150 });
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  const std = (color: number, roughness: number, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const M = {
    concrete: std(0x9c9b93, 0.92),
    column: std(0xa19f96, 0.9),
    plaster: std(0xd9cfbd, 0.85),
    brick: std(0xa8573a, 0.95),
    frame: std(0xf4f4f0, 0.4),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x3e5a68, metalness: 0.15, roughness: 0.06, envMapIntensity: 1.6, clearcoat: 1 }),
    hole: std(0x221d18, 1),
    ground: std(0x6e5d48, 1),
    yellow: std(0xe7a614, 0.5, 0.3),
    steel: std(0x9aa3a6, 0.4, 0.8),
    board: std(0xb98a4e, 0.9),
    hoarding: std(0x2c6b52, 0.8),
    haze: std(0x8f8577, 1),
  };
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  };

  // ---------- the site ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), M.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(600, 14), std(0x3d3a36, 0.95));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.02, 34);
  road.receiveShadow = true;
  scene.add(road);
  const site = new THREE.Group();
  scene.add(site);
  for (let i = -6; i <= 6; i++) box(3.8, 2, 0.12, M.hoarding, i * 4, 1, 26, site);
  box(6, 2.8, 3, std(0xdfe6e2, 0.7), -22, 1.4, 12, site);
  for (let i = 0; i < 5; i++) box(1.2, 0.5, 0.8, std(0xd9d4c8, 0.95), 17 + i * 0.3, 0.25 + i * 0.5, 14, site);
  for (let i = 0; i < 8; i++) box(4, 0.12, 0.12, M.steel, 15, 0.1 + i * 0.13, 18 + (i % 2) * 0.2, site);
  // A distant skyline in the haze. Seeded so it's the same on every visit.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 70; i++) {
    const a = -Math.PI * 0.95 + (i / 70) * Math.PI * 1.3;
    const r = 110 + rand() * 50;
    const h = 8 + rand() * 34;
    const w = 6 + rand() * 10;
    box(w, h, w, M.haze, Math.sin(a) * r, h / 2, -Math.cos(a) * r * 0.9 - 20, site);
  }

  // ---------- the tower ----------
  const tower = new THREE.Group();
  scene.add(tower);
  const floors: THREE.Object3D[] = [];
  interface Outline {
    group: THREE.Group;
    bay: number;
    edge: THREE.MeshBasicMaterial;
    fill: THREE.MeshBasicMaterial;
  }
  const outlines: Outline[] = [];

  function facade(gr: THREE.Group, z: number, floor: number, front: boolean) {
    const wallM = floor < 5 ? M.plaster : M.brick;
    if (floor >= 7) return; // the top floors are frame only
    const glazed = floor < 4;
    for (let i = 0; i < BAYS; i++) {
      const x = bayX(i);
      const pier = (BW - WW) / 2;
      box(pier, FH - 0.35, 0.25, wallM, x - WW / 2 - pier / 2, FH / 2, z, gr);
      box(pier, FH - 0.35, 0.25, wallM, x + WW / 2 + pier / 2, FH / 2, z, gr);
      box(WW, SILL, 0.25, wallM, x, SILL / 2 + 0.17, z, gr);
      const head = FH - 0.35 - SILL - WH;
      box(WW, head, 0.25, wallM, x, SILL + WH + head / 2 + 0.17, z, gr);
      const y = SILL + WH / 2 + 0.17;
      // Bedroom 2 is bays 0-3 of Flat 302's front; bays 2 and 3 have no window yet.
      const missing = front && floor === FLAT_FLOOR && (i === 2 || i === 3);
      if (glazed && !missing) {
        box(WW, 0.08, 0.12, M.frame, x, y + WH / 2, z + 0.06, gr);
        box(WW, 0.08, 0.12, M.frame, x, y - WH / 2, z + 0.06, gr);
        box(0.08, WH, 0.12, M.frame, x - WW / 2, y, z + 0.06, gr);
        box(0.08, WH, 0.12, M.frame, x + WW / 2, y, z + 0.06, gr);
        box(0.06, WH, 0.1, M.frame, x, y, z + 0.06, gr);
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(WW - 0.1, WH - 0.1), M.glass);
        glass.position.set(x, y, z + 0.02);
        if (!front) glass.rotation.y = Math.PI;
        gr.add(glass);
      } else if (glazed) {
        const hole = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), M.hole);
        hole.position.set(x, y, z - 0.08);
        gr.add(hole);
      }
      // Outlines for Bedroom 2 (bays 0-3) and the kitchen window (bay 4), hidden until needed.
      if (front && floor === FLAT_FLOOR && i <= 4) {
        const o = new THREE.Group();
        const edge = new THREE.MeshBasicMaterial({ color: COLOURS.short, toneMapped: false });
        const t = 0.09;
        const pad = 0.16;
        for (const [w, h, dx, dy] of [
          [WW + pad * 2, t, 0, WH / 2 + pad],
          [WW + pad * 2, t, 0, -WH / 2 - pad],
          [t, WH + pad * 2, -WW / 2 - pad, 0],
          [t, WH + pad * 2, WW / 2 + pad, 0],
        ]) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), edge);
          b.position.set(dx, dy, 0);
          o.add(b);
        }
        const fill = new THREE.MeshBasicMaterial({ color: COLOURS.short, transparent: true, opacity: 0.18, toneMapped: false, depthWrite: false });
        o.add(new THREE.Mesh(new THREE.PlaneGeometry(WW + pad * 2, WH + pad * 2), fill));
        o.position.set(x, y, z + 0.3);
        o.visible = false;
        gr.add(o);
        outlines.push({ group: o, bay: i, edge, fill });
      }
    }
  }

  for (let f = 0; f < FLOORS; f++) {
    const gr = new THREE.Group();
    gr.userData.base = f * FH;
    tower.add(gr);
    box(W + 0.6, 0.35, D + 0.6, M.concrete, 0, 0, 0, gr);
    for (const cx of [-W / 2, -W / 4, 0, W / 4, W / 2]) for (const cz of [-D / 2, D / 2]) box(0.5, FH - 0.35, 0.5, M.column, cx, FH / 2 + 0.17, cz, gr);
    facade(gr, D / 2, f, true);
    facade(gr, -D / 2, f, false);
    if (f < 7) {
      const m = f < 5 ? M.plaster : M.brick;
      box(0.25, FH - 0.35, D, m, -W / 2, FH / 2 + 0.17, 0, gr);
      box(0.25, FH - 0.35, D, m, W / 2, FH / 2 + 0.17, 0, gr);
    }
    floors.push(gr);
  }
  const roof = box(W + 0.6, 0.35, D + 0.6, M.concrete, 0, 0, 0, tower);
  roof.userData.base = FLOORS * FH;
  floors.push(roof);

  // Scaffolding on the upper storeys.
  const scaffold = new THREE.Group();
  tower.add(scaffold);
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 6);
  for (let x = -W / 2 - 1; x <= W / 2 + 1; x += 2.25)
    for (const z of [D / 2 + 1.1, D / 2 + 1.9]) {
      const pole = new THREE.Mesh(poleGeo, M.steel);
      pole.scale.y = FH * 5;
      pole.position.set(x, 5 * FH + FH * 2.5, z);
      pole.castShadow = true;
      scaffold.add(pole);
    }
  for (let f = 5; f < FLOORS; f++) {
    box(W + 2, 0.06, 0.9, M.board, 0, f * FH + 0.1, D / 2 + 1.5, scaffold);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, W + 2, 6), M.steel);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, f * FH + 1.1, D / 2 + 1.9);
    scaffold.add(rail);
  }

  // ---------- tower crane ----------
  const crane = new THREE.Group();
  crane.position.set(W / 2 + 6, 0, -D / 2 - 3);
  scene.add(crane);
  for (let y = 0; y < MAST; y += 2) {
    for (const [dx, dz] of [
      [-0.7, -0.7],
      [0.7, -0.7],
      [-0.7, 0.7],
      [0.7, 0.7],
    ])
      box(0.14, 2, 0.14, M.yellow, dx, y + 1, dz, crane);
    box(1.5, 0.1, 0.1, M.yellow, 0, y + 1, -0.7, crane);
    box(1.5, 0.1, 0.1, M.yellow, 0, y + 1, 0.7, crane);
    box(0.1, 0.1, 1.5, M.yellow, -0.7, y + 1, 0, crane);
    box(0.1, 0.1, 1.5, M.yellow, 0.7, y + 1, 0, crane);
  }
  const slew = new THREE.Group();
  slew.position.y = MAST;
  crane.add(slew);
  box(36, 0.9, 1.1, M.yellow, -10, 0, 0, slew);
  box(3, 2.2, 2.2, std(0xdcdcd4, 0.6), 0, 1.4, 1.4, slew);
  box(5, 1.6, 2, std(0x6b6f6d, 0.8), 9, -0.2, 0, slew);
  box(0.4, 5, 0.4, M.yellow, 0, 3, 0, slew);
  box(1.2, 0.5, 1.4, M.yellow, -14, -0.6, 0, slew);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 4), std(0x222222, 0.6));
  slew.add(cable);
  const load = box(5, 0.3, 2, M.concrete, 0, 0, 0, slew);

  // ---------- dust in the low sun ----------
  const N = 600;
  const dustPos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    dustPos[i * 3] = (rand() - 0.5) * 80;
    dustPos[i * 3 + 1] = rand() * 30;
    dustPos[i * 3 + 2] = (rand() - 0.5) * 60;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffe2b8, size: 0.09, transparent: true, opacity: 0.7, depthWrite: false }));
  scene.add(dust);

  // ---------- the sweep: a scan light that moves with the camera ----------
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(0.1, FH * 0.85), beamMat);
  tower.add(beam);
  const scanLight = new THREE.PointLight(0xffa860, 0, 9, 1.6);
  tower.add(scanLight);

  // ---------- camera path ----------
  const F2 = FLAT_FLOOR * FH;
  const eye = new THREE.Vector3();
  const look = new THREE.Vector3();
  function placeCamera(p: number, t: number) {
    const build = seg(p, 0, BEATS.built);
    const a = lerp(0.75, 0.3, ease(build)) + Math.sin(t * 0.05) * 0.02;
    const r = lerp(46, 48, build);
    const orbit = [Math.sin(a) * r, lerp(6, 14, build), Math.cos(a) * r];
    const orbitLook = [-9, lerp(11, 15, build), 0];
    // One-way sweep across Bedroom 2, ending at the kitchen window.
    const sx = lerp(bayX(0) - 0.6, bayX(4) + 0.4, ease(seg(p, BEATS.sweepStart, BEATS.sweepEnd)));
    const close = [sx + 0.6, F2 + 2.3, D / 2 + 9];
    const closeLook = [sx, F2 + 1.75, D / 2];
    const back = [20, 9, 38];
    const backLook = [-10, F2 + 4, 0];
    const fly = ease(seg(p, 0.38, 0.54));
    const ret = ease(seg(p, 0.82, 0.95));
    for (let i = 0; i < 3; i++) {
      eye.setComponent(i, lerp(lerp(orbit[i], close[i], fly), back[i], ret));
      look.setComponent(i, lerp(lerp(orbitLook[i], closeLook[i], fly), backLook[i], ret));
    }
    camera.position.copy(eye);
    camera.lookAt(look);
    return sx;
  }

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = window.innerWidth < 800 ? 52 : 38;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", resize);
  resize();

  let p = reduceMotion ? 1 : 0;
  let last = performance.now();
  let raf = 0;
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    p += (target() - p) * (reduceMotion ? 1 : Math.min(1, dt * 5));
    // Past the scene, nothing is on screen to draw.
    if (!visible()) return;
    const t = reduceMotion ? 0 : now / 1000;

    // The lower floors are already up; the rest drop into place in turn.
    const b = lerp(0.3, 1, seg(p, 0.02, BEATS.built));
    floors.forEach((gr, i) => {
      const k = ease(seg(b, i / floors.length, (i + 1) / floors.length));
      gr.visible = k > 0;
      gr.position.y = gr.userData.base + (1 - k) * 2.2;
      gr.scale.setScalar(lerp(0.96, 1, k));
    });
    scaffold.visible = b > 0.5;
    const cur = Math.min(floors.length - 1, Math.floor(b * floors.length));
    const within = (b * floors.length) % 1;
    slew.rotation.y = lerp(-0.9, -0.15, ease(within)) + (b >= 1 ? Math.sin(t * 0.15) * 0.25 : 0);
    const ty = b < 1 ? floors[cur].userData.base + lerp(12, 1, ease(within)) - MAST : -30;
    load.position.set(-14, ty, 0);
    load.visible = b < 1;
    cable.position.set(-14, (ty - 0.6) / 2, 0);
    cable.scale.y = Math.max(0.1, -ty);

    const sx = placeCamera(p, t);

    // Outlines appear as the camera passes each window; only installed windows are counted.
    const sweeping = p >= BEATS.sweepStart && p < BEATS.result;
    beamMat.opacity = sweeping ? 0.4 : 0;
    beam.position.set(sx, F2 + 1.75, D / 2 + 0.35);
    scanLight.intensity = sweeping ? 18 : 0;
    scanLight.position.set(sx, F2 + 1.8, D / 2 + 2);
    let counted = 0;
    for (const o of outlines) {
      const installed = o.bay < 2;
      const kitchen = o.bay === 4;
      if (p < BEATS.result) {
        o.group.visible = p >= BEATS.sweepStart && sx >= bayX(o.bay) - 0.1 && installed;
        o.edge.color.setHex(COLOURS.short);
        o.fill.color.setHex(COLOURS.short);
        o.fill.opacity = 0.18;
        if (o.group.visible) counted++;
      } else {
        o.group.visible = true;
        const c = kitchen ? COLOURS.unseen : installed ? COLOURS.verified : COLOURS.short;
        o.edge.color.setHex(c);
        o.fill.color.setHex(c);
        o.fill.opacity = 0.22 + 0.08 * Math.sin(t * 3);
      }
    }

    dust.rotation.y = t * 0.01;
    dust.position.y = Math.sin(t * 0.3) * 0.3;
    renderer.render(scene, camera);
    onFrame({ p, counted });
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
      }
    });
    skyTexture.dispose();
    pmrem.dispose();
    renderer.dispose();
  };
}
