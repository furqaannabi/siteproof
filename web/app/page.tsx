import type { Metadata } from "next";
import Link from "next/link";
import type { Detection } from "@siteproof/contract";
import { EvidenceFrame } from "@/components/evidence-frame";
import { DEMO_PROJECT_ID } from "@/lib/data";
import { StampReveal } from "./landing-stamps";
import { BuildScene } from "./landing-tower";
import { CountDiagram, PlaceDiagram, QuoteDiagram, SweepDiagram } from "./landing-diagrams";
import s from "./landing.module.css";

export const metadata: Metadata = {
  title: "SiteProof · Verified construction progress",
  description: "SiteProof turns the progress clips builders already share into verified construction progress, so buyers and banks can release stage payments with evidence.",
};

const DEMO = `/projects/${DEMO_PROJECT_ID}/report`;

// The demo flat's Bedroom 2: one one-way sweep, two of four windows found.
const bedroom2: Detection[] = [1, 2].map((n) => ({
  clip_id: "c-0412",
  room_id: "r-bed2",
  item: "window",
  track_id: `bed2-window-t${n}`,
  best_frame_url: "/mock/frame-bed2.svg",
  mask_url: `/mock/mask-bed2-window-${n}.svg`,
}));

function Stamp({ kind, children }: { kind: "verified" | "short" | "notSeen" | "neutral" | "check"; children: React.ReactNode }) {
  return (
    <span className={`${s.stamp} ${s[`stamp_${kind}`]}`} data-stamp>
      {children}
    </span>
  );
}

function Mark() {
  return (
    <span className={s.mark} aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12l5 5L20 6" />
      </svg>
    </span>
  );
}

export default function Landing() {
  return (
    <div className={s.page}>
      <StampReveal />

      {/* The building goes up as the visitor scrolls through the pinned first screen. */}
      <section className={s.hero} aria-labelledby="hero-title">
        <div className={s.heroPin}>
        <BuildScene />
        <header className={s.heroBar}>
          <Link href="/" className={s.brand}>
            <Mark />
            <span>SiteProof</span>
          </Link>
          <nav className={s.nav} aria-label="Site">
            <a href="#line-for-line">How it works</a>
            <Link href="/projects">Projects</Link>
            <Link href="/projects/new">Set up a project</Link>
          </nav>
        </header>
        <div className={s.heroText}>
          <h1 id="hero-title" className={s.heroTitle}>
            Proof of progress, flat by flat.
          </h1>
          <p className={s.heroLede}>The clips builders already send, checked against the demand letter.</p>
          <Link href={DEMO} className={s.cta}>
            Open the Flat 302 demo
          </Link>
        </div>
        </div>
      </section>

      {/* The sheet, folded: what a buyer pays against today, and what SiteProof shows. */}
      <section className={s.fold} aria-label="Paper claim and evidence">
        <div className={s.paper}>
          <h2 className={s.foldTitle}>A demand letter says it&apos;s done.</h2>
          <ul className={s.claims}>
            <li>
              <mark>&ldquo;Windows complete: 12&rdquo;</mark>
            </li>
            <li>
              <mark>&ldquo;Doors complete: 5&rdquo;</mark>
            </li>
            <li>
              <mark>&ldquo;Internal plaster complete in all rooms&rdquo;</mark>
            </li>
          </ul>
          <p className={s.problem}>Today buyers and banks pay against these lines alone.</p>
        </div>

        <div className={s.proof}>
          <h2 className={s.foldTitle}>The builder&apos;s own clips show it.</h2>
          <ul className={s.evidence}>
            <li>
              <b>12 windows</b>
              <span className={s.stamps}>
                <Stamp kind="verified">Verified 9</Stamp>
                <Stamp kind="short">Short 2</Stamp>
                <Stamp kind="notSeen">Not seen yet 1</Stamp>
              </span>
            </li>
            <li>
              <b>5 doors</b>
              <span className={s.stamps}>
                <Stamp kind="verified">Verified 4</Stamp>
                <Stamp kind="notSeen">Not seen yet 1</Stamp>
              </span>
            </li>
            <li>
              <b>Plaster</b>
              <span className={s.stamps}>
                <Stamp kind="neutral">Not checked from footage</Stamp>
              </span>
            </li>
          </ul>
          <figure className={s.heroFrame}>
            <EvidenceFrame frameUrl="/mock/frame-bed2.svg" masks={bedroom2} label="Bedroom 2, best frame: two windows outlined, two openings empty" badge="Demo data · 2 outlined" />
            <figcaption>Bedroom 2 · 2 of 4 found · Short by 2</figcaption>
          </figure>
        </div>

      </section>

      {/* Line for line: each paper claim, and how SiteProof proves it. */}
      <section id="line-for-line" className={s.lines} aria-labelledby="lines-title">
        <header className={s.linesHead}>
          <h2 id="lines-title" className={s.sectionTitle}>
            Nobody films anything new.
          </h2>
          <p>The progress clips builders already share, checked line by line.</p>
        </header>

        <ol className={s.rows}>
          <li className={s.row} data-row>
            <div className={s.rowPaper}>
              <h3>The letter makes a claim.</h3>
              <p className={s.quote}>&ldquo;Windows complete: 12&rdquo;</p>
            </div>
            <div className={s.rowProof}>
              <QuoteDiagram />
              <div className={s.rowText}>
                <h3>It&apos;s read word for word.</h3>
              </div>
              <Stamp kind="check">Matched</Stamp>
            </div>
          </li>

          <li className={s.row} data-row>
            <div className={s.rowPaper}>
              <h3>A clip arrives with no labels.</h3>
            </div>
            <div className={s.rowProof}>
              <PlaceDiagram />
              <div className={s.rowText}>
                <h3>The room tag places it.</h3>
              </div>
              <Stamp kind="check">Placed</Stamp>
            </div>
          </li>

          <li className={s.row} data-row>
            <div className={s.rowPaper}>
              <h3>The camera passes a window three times.</h3>
            </div>
            <div className={s.rowProof}>
              <CountDiagram />
              <div className={s.rowText}>
                <h3>Objects are counted, not appearances.</h3>
              </div>
              <Stamp kind="check">Counted 1</Stamp>
            </div>
          </li>

          <li className={s.row} data-row>
            <div className={s.rowPaper}>
              <h3>A quick pan misses a corner.</h3>
            </div>
            <div className={s.rowProof}>
              <SweepDiagram />
              <div className={s.rowText}>
                <h3>Short only when the whole room was seen.</h3>
              </div>
              <Stamp kind="check">Covered</Stamp>
            </div>
          </li>
        </ol>
      </section>

      {/* Who gets what. */}
      <section className={s.who} aria-labelledby="who-title">
        <h2 id="who-title" className={s.sectionTitle}>
          Proof that gets builders paid.
        </h2>
        <div className={s.whoGrid}>
          <div>
            <h3>Builders</h3>
            <p>Paid faster, without the argument.</p>
          </div>
          <div>
            <h3>Buyers</h3>
            <p>Pay a demand letter against proof.</p>
          </div>
          <div>
            <h3>Banks</h3>
            <p>Release each stage with evidence.</p>
          </div>
        </div>
      </section>

      {/* The fold again, as the close. */}
      <section className={s.close} aria-labelledby="close-title">
        <div className={s.closePaper}>
          <p>Pay against paper,</p>
        </div>
        <div className={s.closeProof}>
          <p id="close-title">or against proof.</p>
        </div>
        <div className={s.seam}>
          <Link href={DEMO} className={s.cta}>
            Open the Flat 302 demo
          </Link>
        </div>
      </section>

      <footer className={s.footer}>
        <p>SiteProof supports payment decisions with evidence. It doesn&apos;t replace an engineer&apos;s inspection of hidden or structural work.</p>
        <p>
          Built for the Meta Global AI Developer Hackathon. The demo uses drawn frames and a fictional builder.
        </p>
      </footer>
    </div>
  );
}
