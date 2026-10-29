"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { LogoMark } from "@/components/ui";
import { DEMO_PROJECT_ID } from "@/lib/data";
import { BEATS, type SceneFrame } from "./landing-scene";
import s from "./landing.module.css";

const DEMO = `/projects/${DEMO_PROJECT_ID}/report`;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function Seal() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 12.2l2.4 2.3 4.6-4.8" />
    </svg>
  );
}

function Check() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.3l2.6 2.5L16 9.4" />
    </svg>
  );
}

/** The demo frame of Bedroom 2 with its two counted windows outlined. */
function Bedroom2Frame({ className, alt }: { className: string; alt: string }) {
  return (
    <div className={className}>
      <img src="/mock/frame-bed2.svg" alt={alt} />
      <span className={s.o} style={{ left: "5.9%", top: "22.7%", width: "17%", height: "41%" }} />
      <span className={s.o} style={{ left: "27.1%", top: "22.7%", width: "17%", height: "41%" }} />
    </div>
  );
}

const RULES = [
  "Every quote, word for word",
  "Objects, not appearances",
  "Short only when fully covered",
  "No evidence, no number",
  "Footage with no room tag is never a claim",
  "Every citation re-checked",
  "Private by default",
];

export function Landing() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pin = useRef<HTMLElement>(null);
  const caps = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const vf = useRef<HTMLDivElement>(null);
  const hud = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const prob = useRef<HTMLElement>(null);
  const plaster = useRef<SVGRectElement>(null);
  const trowel = useRef<SVGRectElement>(null);
  const probCap = useRef<HTMLDivElement>(null);
  const how = useRef<HTMLElement>(null);
  const phone = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const get = useRef<HTMLElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const vh = () => window.innerHeight;

    // ---- the hero: scroll progress drives the scene; the overlays follow it ----
    const target = () => {
      const r = pin.current!.getBoundingClientRect();
      return reduce ? 1 : clamp(-r.top / (r.height - vh()));
    };
    const heroVisible = () => pin.current!.getBoundingClientRect().bottom > 0;
    let shownCap = -1;
    const paint = ({ p, counted }: SceneFrame) => {
      const k = p < 0.2 ? 0 : p < 0.47 ? 1 : p < BEATS.result ? 2 : 3;
      if (k !== shownCap) {
        [...caps.current!.children].forEach((c, i) => c.classList.toggle(s.on, i === k));
        [...rail.current!.children].forEach((c, i) => c.classList.toggle(s.on, i <= k));
        shownCap = k;
      }
      vf.current!.classList.toggle(s.on, p >= 0.5 && p < 0.82);
      hud.current!.textContent =
        p < BEATS.sweepStart + 0.01 ? "Room tag read · Bedroom 2" : `Bedroom 2 · windows counted: ${Math.min(counted, 2)}${p > 0.78 ? " · room covered" : ""}`;
      card.current!.classList.toggle(s.on, p >= 0.86);
      hint.current!.style.opacity = p > 0.03 ? "0" : "";
    };

    let stopScene: (() => void) | null = null;
    let fallback = 0;
    let cancelled = false;
    // Without WebGL the story still reads: the words follow the scroll over the dusk sky.
    const runWithoutScene = () => {
      const tick = () => {
        fallback = requestAnimationFrame(tick);
        paint({ p: target(), counted: 2 });
      };
      tick();
    };
    import("./landing-scene")
      .then(({ startTowerScene }) => {
        if (cancelled) return;
        try {
          stopScene = startTowerScene(canvas.current!, { target, onFrame: paint, visible: heroVisible, reduceMotion: reduce });
        } catch {
          runWithoutScene();
        }
      })
      .catch(runWithoutScene);

    // ---- the sections below ----
    let howShown = -1;
    const sections = () => {
      const h = vh();
      {
        // The window is plastered over as the problem section scrolls past.
        const r = prob.current!.getBoundingClientRect();
        const k = reduce ? 1 : clamp((h * 0.55 - r.top) / (r.height * 0.7));
        plaster.current!.setAttribute("width", String(520 * k));
        trowel.current!.setAttribute("x", String(520 * k - 5));
        trowel.current!.style.opacity = k > 0 && k < 1 ? "0.55" : "0";
        probCap.current!.textContent = k < 0.35 ? "Stage 4 · windows installed" : k < 1 ? "Stage 5 · plastering" : "Stage 5 · what was behind it?";
      }
      {
        // The phone's screen follows the step.
        const r = how.current!.getBoundingClientRect();
        const k = reduce ? 1 : clamp(-r.top / (r.height - h));
        const i = Math.min(3, Math.floor(k * 4));
        if (i !== howShown) {
          how.current!.querySelectorAll("[data-step]").forEach((el) => el.classList.toggle(s.on, Number((el as HTMLElement).dataset.step) === i));
          howShown = i;
        }
        phone.current!.style.transform = `rotateY(${lerp(-16, 8, k)}deg) rotateX(4deg)`;
      }
      {
        // The report tilts flat as it arrives; the cards drift.
        const r = get.current!.getBoundingClientRect();
        const k = reduce ? 1 : clamp((h - r.top) / (h * 1.1));
        tilt.current!.style.transform = `rotateX(${lerp(22, 4, k)}deg) rotateY(${lerp(-14, -3, k)}deg)`;
        get.current!.querySelectorAll<HTMLElement>("[data-float]").forEach((f, i) => f.style.setProperty("--py", `${(1 - k) * (i ? 60 : -60)}px`));
      }
    };
    window.addEventListener("scroll", sections, { passive: true });
    window.addEventListener("resize", sections);
    sections();

    // Sections arrive as they scroll in.
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add(s.in);
          io.unobserve(e.target);
        }),
      { threshold: 0.15 },
    );
    root.current!.querySelectorAll(`.${s.rv}`).forEach((el) => (reduce ? el.classList.add(s.in) : io.observe(el)));

    return () => {
      cancelled = true;
      stopScene?.();
      cancelAnimationFrame(fallback);
      window.removeEventListener("scroll", sections);
      window.removeEventListener("resize", sections);
      io.disconnect();
    };
  }, []);

  return (
    <div className={s.page} ref={root}>
      <canvas ref={canvas} className={s.gl} aria-hidden="true" />
      <div className={s.scrim} aria-hidden="true" />

      <header className={s.bar}>
        <div className={s.barIn}>
          <Link href="/" className={s.brand}>
            <LogoMark />
            SiteProof
          </Link>
          <nav className={s.nav} aria-label="Site">
            <a href="#how">How it works</a>
            <Link href="/projects">Projects</Link>
            <Link href="/projects/new">Set up a project</Link>
          </nav>
          <Link href={DEMO} className={s.ghost}>
            Open the demo
          </Link>
        </div>
      </header>

      {/* ---------- the hero: the tower goes up, Flat 302 is swept, the outcome lands ---------- */}
      <div className={s.copy} ref={caps}>
        <div className={s.cap}>
          <h1>Proof of progress, floor by floor.</h1>
          <p>Homes in India are paid for as they go up. Every stage brings a demand letter, and a payment.</p>
          <Link className={s.cta} href={DEMO}>
            Open the Flat 302 demo
          </Link>
        </div>
        <div className={s.cap}>
          <h2>The letter says it’s done.</h2>
          <p>
            Flat 302: <span className={s.q}>“Windows complete: 12”</span>. Today buyers and banks pay against that line alone.
          </p>
        </div>
        <div className={s.cap}>
          <h2>The builder’s clip is the proof.</h2>
          <p>The room tag places the footage. One slow sweep in one direction, and each window is counted once, outlined in its frame.</p>
        </div>
        <div className={s.cap}>
          <h2>Pay against what was seen.</h2>
          <p>Nine verified with frames. Two short in a fully covered room. One not seen yet, with a request for five seconds of footage. Never an accusation.</p>
          <Link className={s.cta} href={DEMO}>
            Open the Flat 302 demo
          </Link>
        </div>
      </div>
      <div className={s.rail} ref={rail} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className={s.vf} ref={vf} aria-hidden="true">
        <b />
        <b />
        <b />
        <b />
        <span className={s.hud}>
          <i className={s.rec} />
          <span ref={hud}>Room tag read · Bedroom 2</span>
        </span>
      </div>
      <div className={s.card} ref={card}>
        <span className={s.stamp}>Short 2</span>
        <small>Demand letter · “Windows complete: 12”</small>
        <div className={s.fig}>
          9<span>of 12 windows seen</span>
        </div>
        <small>each one with its frame and outline</small>
        <div className={s.chips}>
          <span className={s.bV}>Verified 9</span>
          <span className={s.bS}>Short 2 · Bedroom 2</span>
          <span className={s.bN}>Not seen yet 1 · Kitchen</span>
        </div>
      </div>
      <div className={s.hint} ref={hint}>
        Scroll to build
      </div>
      <section className={s.pin} ref={pin} aria-label="The tower being built, and one flat checked" />

      <div className={s.after}>
        {/* ---------- the problem: the window is plastered over ---------- */}
        <section className={s.sProb} ref={prob}>
          <div className={s.ruler} aria-hidden="true" />
          <div className={s.probIn}>
            <div>
              <h2 className={s.rv}>
                Paid in stages.
                <br />
                <em>Checked by nobody.</em>
              </h2>
              <p className={`${s.big} ${s.rv}`}>
                A builder sends a demand letter. The buyer pays. The bank releases the loan. By the next stage, the work is plastered over.
              </p>
              <div className={s.voices}>
                <p className={s.rv}>
                  <b>Buyers</b> lack the time and the expertise to check.
                </p>
                <p className={s.rv}>
                  <b>Banks</b> send an engineer occasionally, so most stages go out on paper.
                </p>
                <p className={s.rv}>
                  <b>Honest builders</b> spend weeks answering “is it really done?”
                </p>
              </div>
            </div>
            <div className={s.wallScene} aria-label="A wall with a new window, plastered over as time passes" role="img">
              <svg viewBox="0 0 520 560" className={s.wall}>
                <defs>
                  <pattern id="lp-brick" width="64" height="32" patternUnits="userSpaceOnUse">
                    <rect width="64" height="32" fill="#a85a3c" />
                    <path d="M0 0h64M0 16h64M16 0v16M48 16v16" stroke="#8a4630" strokeWidth="2.5" />
                  </pattern>
                  <linearGradient id="lp-sky" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#9cc2d6" />
                    <stop offset="1" stopColor="#f3d8b0" />
                  </linearGradient>
                  <clipPath id="lp-plaster">
                    <rect ref={plaster} x="0" y="0" width="0" height="560" />
                  </clipPath>
                </defs>
                <rect width="520" height="560" fill="url(#lp-brick)" />
                <Window />
                <g clipPath="url(#lp-plaster)">
                  <rect width="520" height="560" fill="#ddd3c1" />
                  <path d="M0 80h520M0 240h520M0 400h520" stroke="#cfc4b0" strokeWidth="2" />
                  <Window />
                </g>
                <rect ref={trowel} x="0" y="0" width="10" height="560" fill="#fff" opacity="0" />
              </svg>
              <div className={s.letterPin}>
                <span className={s.lh}>Demand letter · Tower B · Flat 302</span>
                <p>The following stage is complete:</p>
                <p>
                  <span className={s.hl}>“Windows complete: 12”</span>
                </p>
                <p>Kindly release the stage payment.</p>
                <span className={s.due}>Payment due</span>
              </div>
              <div className={s.caption} ref={probCap}>
                Stage 4 · windows installed
              </div>
            </div>
          </div>
        </section>

        {/* ---------- how a builder uses it: the phone stays, the screen plays each step ---------- */}
        <section className={s.sHow} ref={how} id="how">
          <div className={s.howStick}>
            <div className={s.howIn}>
              <div>
                <h2>
                  One habit on site.
                  <br />
                  <em>No new hardware.</em>
                </h2>
                <ol className={s.howSteps}>
                  {[
                    ["Stick a room tag", "One printed tag at each doorway, once per project."],
                    ["Film one slow sweep", "Start with the tag in view. Pan steadily one way, never back."],
                    ["Upload from the phone", "The clip is placed in its room and the windows are counted."],
                    ["Send the report link", "Buyers and the bank open it. No accounts, no app."],
                  ].map(([title, body], i) => (
                    <li key={title} data-step={i}>
                      <span>{i + 1}</span>
                      <div>
                        <h3>{title}</h3>
                        <p>{body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
              <div className={s.phoneWrap} aria-hidden="true">
                <div className={s.phone3} ref={phone}>
                  <div className={s.notch} />
                  <div className={s.scr} data-step="0">
                    <div className={s.cam}>
                      <div className={s.door} />
                      <div className={s.qr}>
                        <i />
                      </div>
                      <div className={s.scan} />
                    </div>
                    <div className={s.toast}>Room tag read · Bedroom 2</div>
                  </div>
                  <div className={s.scr} data-step="1">
                    <div className={`${s.cam} ${s.pan}`}>
                      <div className={s.panIn}>
                        <span className={`${s.w} ${s.wIn}`} />
                        <span className={`${s.w} ${s.wIn}`} />
                        <span className={s.w} />
                        <span className={s.w} />
                      </div>
                    </div>
                    <div className={s.arrow}>One way, never back</div>
                    <div className={s.toast}>Windows counted: 2</div>
                  </div>
                  <div className={s.scr} data-step="2">
                    <div className={s.appbar}>
                      SiteProof<small>Flat 302 · uploads</small>
                    </div>
                    <div className={s.up}>
                      <div className={s.thumb} />
                      <div>
                        <b>Bedroom 2 · 0:27</b>
                        <div className={s.bar2}>
                          <i />
                        </div>
                        <small>Placed in Bedroom 2 · 2 windows counted</small>
                      </div>
                    </div>
                    <div className={`${s.up} ${s.dim}`}>
                      <div className={`${s.thumb} ${s.thumbK}`} />
                      <div>
                        <b>Living Room · 0:31</b>
                        <div className={`${s.bar2} ${s.full}`}>
                          <i />
                        </div>
                        <small>3 windows, 1 door counted</small>
                      </div>
                    </div>
                  </div>
                  <div className={s.scr} data-step="3">
                    <div className={s.chat}>
                      <div className={s.chatbar}>
                        Flat 302 · buyer<small>online</small>
                      </div>
                      <div className={`${s.msg} ${s.me}`}>
                        <div className={s.link}>
                          <b>Flat 302 progress report</b>
                          <small>Verified 9 · Short 2 · Not seen yet 1</small>
                        </div>
                        <small>Every count with its frame.</small>
                      </div>
                      <div className={`${s.msg} ${s.them}`}>Thank you. Opening it with the bank now.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- what the buyer and the bank open ---------- */}
        <section className={s.sGet} ref={get}>
          <div className={s.inner}>
            <h2 className={s.rv}>
              What the buyer and
              <br />
              the bank open.
            </h2>
            <p className={`${s.big} ${s.rv}`}>Every number with the frame it was counted in, and the line of the document it answers.</p>
            <div className={s.stageGet}>
              <div className={s.browser} ref={tilt}>
                <div className={s.chrome}>
                  <i />
                  <i />
                  <i />
                  <span>siteproof · Flat 302 report</span>
                </div>
                <div className={s.repHead}>
                  <b>Bedroom 2</b>
                  <span>Covered · one complete sweep from the room tag</span>
                </div>
                <div className={s.repRow}>
                  <div>
                    <span className={s.it}>Windows</span>
                    <span className={s.qt}>“W-4 UPVC openable window, 1200 x 1500 mm Bedroom 2 nos 4”</span>
                  </div>
                  <div className={s.nums}>
                    <span>
                      <small>Billed</small>
                      <b>4</b>
                    </span>
                    <span>
                      <small>Counted</small>
                      <i className={s.st}>2</i>
                    </span>
                  </div>
                  <span className={s.bS}>Short</span>
                </div>
                <Bedroom2Frame className={s.fr} alt="Best frame of Bedroom 2: two windows outlined, two openings empty" />
              </div>
              <div className={`${s.float} ${s.bubble} ${s.rv}`} data-float>
                <small>To · Site supervisor</small>
                <p className={s.ask}>Need 5 s of Flat 302 kitchen, east wall</p>
                <p>Start at the kitchen’s room tag. Turn slowly toward the east wall window. Don’t pan back.</p>
                <span className={s.ticks}>Delivered</span>
              </div>
              <div className={`${s.float} ${s.paperL} ${s.rv}`} data-float>
                <small>Query letter · Bedroom 2</small>
                <p>
                  “A one-way sweep from the Bedroom 2 room tag shows 2 installed. Could you confirm the status of the remaining 2, or share footage of
                  them?”
                </p>
                <span className={s.seal}>
                  <Seal />3 citations re-checked
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- three honest answers, each a room ---------- */}
        <section className={s.sOut}>
          <div className={s.inner}>
            <h2 className={s.rv}>
              Three honest answers.
              <br />
              <em>Never an accusation.</em>
            </h2>
            <div className={s.rooms}>
              <figure className={s.rv}>
                <svg viewBox="0 0 300 190" aria-hidden="true">
                  <RoomBack />
                  <rect x="30" y="40" width="60" height="70" fill="#a9c7d6" />
                  <rect x="120" y="40" width="60" height="70" fill="#a9c7d6" />
                  <rect x="210" y="40" width="60" height="70" fill="#a9c7d6" />
                  <g fill="none" stroke="#2fa86c" strokeWidth="5" className={s.ol}>
                    <rect x="24" y="34" width="72" height="82" rx="3" />
                    <rect x="114" y="34" width="72" height="82" rx="3" />
                    <rect x="204" y="34" width="72" height="82" rx="3" />
                  </g>
                </svg>
                <figcaption>
                  <span className={s.bV}>Verified</span>
                  <b>The count meets the claim.</b> Every object outlined in its frame.
                </figcaption>
              </figure>
              <figure className={s.rv}>
                <svg viewBox="0 0 300 190" aria-hidden="true">
                  <defs>
                    <pattern id="lp-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <rect width="10" height="10" fill="#fbeee0" />
                      <rect width="4" height="10" fill="#f0c9a0" />
                    </pattern>
                  </defs>
                  <RoomBack />
                  <rect x="30" y="40" width="60" height="70" fill="#a9c7d6" />
                  <rect x="120" y="40" width="60" height="70" fill="#a9c7d6" />
                  <rect x="210" y="40" width="60" height="70" fill="url(#lp-hatch)" stroke="#a35408" strokeWidth="3" strokeDasharray="7 5" />
                  <g fill="none" stroke="#ff7a1a" strokeWidth="5" className={s.ol}>
                    <rect x="24" y="34" width="72" height="82" rx="3" />
                    <rect x="114" y="34" width="72" height="82" rx="3" />
                  </g>
                </svg>
                <figcaption>
                  <span className={s.bS}>Short</span>
                  <b>Fewer seen, room fully covered.</b> The gap, the frames, a polite query letter.
                </figcaption>
              </figure>
              <figure className={s.rv}>
                <svg viewBox="0 0 300 190" aria-hidden="true">
                  <RoomBack />
                  <rect x="30" y="40" width="60" height="70" fill="#a9c7d6" />
                  <rect x="120" y="40" width="60" height="70" fill="#a9c7d6" />
                  <rect x="150" y="0" width="150" height="190" fill="#4c5a54" opacity=".82" />
                  <rect x="18" y="22" width="120" height="110" rx="8" fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="10 8" className={s.vfr} />
                  <text x="225" y="100" textAnchor="middle" fill="#e9f1ec" fontSize="15" fontWeight="600">
                    not filmed
                  </text>
                </svg>
                <figcaption>
                  <span className={s.bN}>Not seen yet</span>
                  <b>Not filmed well enough to judge.</b> An exact ask for five seconds of footage.
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* ---------- models find, code decides ---------- */}
        <section className={s.sRules}>
          <div className={s.inner}>
            <h2 className={s.rv}>
              Models find.
              <br />
              <em>Code decides.</em>
            </h2>
            <p className={`${s.big} ${s.rv}`}>
              AI reads the documents and spots the windows. Every outcome, every number and every citation is decided and re-checked by plain code that
              can be tested.
            </p>
            <div className={`${s.flow} ${s.rv}`}>
              <div className={s.node}>
                <small>Found in the clip</small>
                <Bedroom2Frame className={s.mini} alt="" />
                <small>Read from the bill of quantities</small>
                <p className={s.qq}>“W-4 UPVC openable window, 1200 x 1500 mm Bedroom 2 nos 4”</p>
              </div>
              <svg className={s.pipe} viewBox="0 0 120 200" preserveAspectRatio="none" aria-hidden="true">
                <path d="M0 60 C60 60 60 100 120 100 M0 150 C60 150 60 100 120 100" />
              </svg>
              <div className={s.gate}>
                <small>Checked by code</small>
                <ul>
                  {[
                    "Quote matches the document word for word",
                    "Placed by the Bedroom 2 room tag",
                    "Each window counted once",
                    "One complete sweep: room covered",
                    "Every frame resolves",
                  ].map((t) => (
                    <li key={t}>
                      <Check />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              <svg className={s.pipe} viewBox="0 0 120 200" preserveAspectRatio="none" aria-hidden="true">
                <path d="M0 100 H120" />
              </svg>
              <div className={s.result}>
                <small>Outcome</small>
                <span className={s.big2}>Short 2</span>
                <small>with frames and a query letter</small>
              </div>
            </div>
          </div>
          <div className={s.marquee}>
            <ul className={s.mq} aria-label="The rules SiteProof's code keeps">
              {[...RULES, ...RULES].map((r, i) => (
                <li key={i} aria-hidden={i >= RULES.length || undefined}>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- the close ---------- */}
        <section className={s.sClose}>
          <svg className={s.blue} viewBox="0 0 600 700" aria-hidden="true">
            <g fill="none" stroke="rgba(233,241,236,.16)" strokeWidth="2">
              <rect x="150" y="80" width="300" height="620" />
              <path d="M150 140h300M150 200h300M150 260h300M150 320h300M150 380h300M150 440h300M150 500h300M150 560h300M150 620h300M225 80v620M300 80v620M375 80v620" />
              <path d="M500 700V20M500 30H40M500 30l-60-20M40 30v60" />
            </g>
          </svg>
          <div className={s.inner}>
            <h2 className={s.rv}>
              Proof that gets
              <br />
              builders paid.
            </h2>
            <div className={`${s.trio3} ${s.rv}`}>
              <p>
                <b>Builders</b> get paid faster, without the argument.
              </p>
              <p>
                <b>Buyers</b> pay a demand letter against proof.
              </p>
              <p>
                <b>Banks</b> release each stage with evidence and an audit trail.
              </p>
            </div>
            <Link className={`${s.cta} ${s.rv}`} href={DEMO}>
              Open the Flat 302 demo
            </Link>
            <p className={s.foot}>SiteProof supports payment decisions with evidence. It doesn’t replace an engineer’s inspection of hidden or structural work.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

/** A window in the wall of the problem section, the same before and after plastering. */
function Window() {
  return (
    <>
      <rect x="130" y="120" width="260" height="290" fill="url(#lp-sky)" />
      <g fill="none" stroke="#f4f4f0" strokeWidth="14">
        <rect x="137" y="127" width="246" height="276" />
        <path d="M260 127v276" />
      </g>
      <rect x="120" y="410" width="280" height="16" fill="#cfc6b4" />
    </>
  );
}

function RoomBack() {
  return (
    <>
      <rect width="300" height="190" rx="10" fill="#e4dccb" />
      <rect y="150" width="300" height="40" fill="#b9b0a0" />
    </>
  );
}
