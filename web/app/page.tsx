import type { Metadata } from "next";
import Link from "next/link";
import type { Detection } from "@siteproof/contract";
import { EvidenceFrame } from "@/components/evidence-frame";
import { DEMO_PROJECT_ID } from "@/lib/data";
import { StampReveal } from "./landing-stamps";
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

      {/* The sheet, folded: what a buyer pays against today, and what SiteProof shows. */}
      <section className={s.fold} aria-label="Paper claim and evidence">
        <div className={s.paper}>
          <Link href="/" className={s.brand}>
            <Mark />
            <span>SiteProof</span>
          </Link>
          <h1 className={s.foldTitle}>A demand letter says it&apos;s done.</h1>
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
          <p className={s.problem}>Buyers and banks pay against these lines, and by the next stage the work is plastered over.</p>
          <Link href="/projects/new" className={s.setUp}>
            Builders: set up a project
          </Link>
          <div className={s.block}>
            <span>Today</span>
            <span>What buyers and banks pay against</span>
          </div>
        </div>

        <div className={s.proof}>
          <nav className={s.nav} aria-label="Site">
            <a href="#line-for-line">How it works</a>
            <a href="#outcomes">Outcomes</a>
            <Link href="/projects">Projects</Link>
          </nav>
          <h2 className={s.foldTitle}>The builder&apos;s own clips show it.</h2>
          <ul className={s.evidence}>
            <li>
              <b>12 windows</b>
              <span className={s.stamps}>
                <Stamp kind="verified">Verified 9</Stamp>
                <Stamp kind="short">Short 2</Stamp>
                <Stamp kind="notSeen">Not seen yet 1</Stamp>
              </span>
              <small>Bedroom 2 is short 2; the kitchen isn&apos;t filmed yet</small>
            </li>
            <li>
              <b>5 doors</b>
              <span className={s.stamps}>
                <Stamp kind="verified">Verified 4</Stamp>
                <Stamp kind="notSeen">Not seen yet 1</Stamp>
              </span>
              <small>The kitchen hasn&apos;t been filmed from its room tag yet</small>
            </li>
            <li>
              <b>Plaster</b>
              <span className={s.stamps}>
                <Stamp kind="neutral">Not checked from footage</Stamp>
              </span>
              <small>This version counts windows and doors only</small>
            </li>
          </ul>
          <figure className={s.heroFrame}>
            <EvidenceFrame frameUrl="/mock/frame-bed2.svg" masks={bedroom2} label="Bedroom 2, best frame: two windows outlined, two openings empty" badge="Demo data · 2 outlined" />
            <figcaption>Bedroom 2 · one-way sweep from its room tag · 2 of the 4 windows in the plan found, so it&apos;s Short by 2</figcaption>
          </figure>
          <div className={`${s.block} ${s.blockProof}`}>
            <span>SiteProof</span>
            <span>What they can check before paying</span>
          </div>
        </div>

        <div className={s.seam}>
          <Link href={DEMO} className={s.cta}>
            Open the Flat 302 demo
          </Link>
        </div>
      </section>

      {/* Line for line: each paper claim, and how SiteProof proves it. */}
      <section id="line-for-line" className={s.lines} aria-labelledby="lines-title">
        <header className={s.linesHead}>
          <h2 id="lines-title" className={s.sectionTitle}>
            Nobody films anything new.
          </h2>
          <p>
            Builders already post progress clips for their buyers. SiteProof takes those same clips, finds each room from a printed tag at its door, and checks every line of the demand letter against what the footage shows.
          </p>
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
                <p>Every claim keeps the exact line it came from. A line that isn&apos;t in the document, exactly, is never shown as a number.</p>
              </div>
              <Stamp kind="check">Matched</Stamp>
            </div>
          </li>

          <li className={s.row} data-row>
            <div className={s.rowPaper}>
              <h3>A clip arrives with no labels.</h3>
              <p>Shaky, partial, in any order, forwarded from WhatsApp.</p>
            </div>
            <div className={s.rowProof}>
              <PlaceDiagram />
              <div className={s.rowText}>
                <h3>The room tag places it.</h3>
                <p>One printed QR tag at each doorway. Any clip that passes it is placed: Flat 302 · Bedroom 2. A clip with no tag is kept, never used for a room.</p>
              </div>
              <Stamp kind="check">Placed</Stamp>
            </div>
          </li>

          <li className={s.row} data-row>
            <div className={s.rowPaper}>
              <h3>The camera passes a window three times.</h3>
              <p>Counting appearances would say three windows.</p>
            </div>
            <div className={s.rowProof}>
              <CountDiagram />
              <div className={s.rowText}>
                <h3>Objects are counted, not appearances.</h3>
                <p>Each window is tracked as one object through the clip, so it counts once. Across clips, a room takes its highest count from any single clip.</p>
              </div>
              <Stamp kind="check">Counted 1</Stamp>
            </div>
          </li>

          <li className={s.row} data-row>
            <div className={s.rowPaper}>
              <h3>A quick pan misses a corner.</h3>
              <p>Is the window missing, or just not filmed?</p>
            </div>
            <div className={s.rowProof}>
              <SweepDiagram />
              <div className={s.rowText}>
                <h3>Short only when the whole room was seen.</h3>
                <p>A room counts as covered only after one sweep from its tag, all the way round in one direction. Anything less stays Not seen yet, with an exact request for footage.</p>
              </div>
              <Stamp kind="check">Covered</Stamp>
            </div>
          </li>
        </ol>
      </section>

      {/* The three outcomes, set as the drawing's legend. */}
      <section id="outcomes" className={s.outcomes} aria-labelledby="outcomes-title">
        <div className={s.outcomesHead}>
          <h2 id="outcomes-title" className={s.sectionTitle}>
            Three answers, never a guess.
          </h2>
          <div className={s.tally} aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <i key={`v${i}`} className={s.tV} />
            ))}
            <i className={s.tS} />
            <i className={s.tS} />
            <i className={s.tN} />
          </div>
          <p className={s.tallyNote}>Flat 302, windows: 9 Verified, 2 Short, 1 Not seen yet</p>
        </div>

        <dl className={s.legend}>
          <div className={s.legendRow}>
            <dt>
              <Stamp kind="verified">Verified</Stamp>
            </dt>
            <dd className={s.when}>The count meets the claim.</dd>
            <dd className={s.shows}>The frame and outline for every counted object.</dd>
          </div>
          <div className={s.legendRow}>
            <dt>
              <Stamp kind="short">Short</Stamp>
            </dt>
            <dd className={s.when}>Fewer seen than claimed, and the room was fully covered.</dd>
            <dd className={s.shows}>The gap, the frames, and a polite query letter citing the letter&apos;s line, the plan and the frames.</dd>
          </div>
          <div className={s.legendRow}>
            <dt>
              <Stamp kind="notSeen">Not seen yet</Stamp>
            </dt>
            <dd className={s.when}>The room hasn&apos;t been covered well enough to judge.</dd>
            <dd className={s.shows}>
              An exact request for one short clip, sent to the site:
              <span className={s.request}>Need 5 s of Flat 302 kitchen, east wall</span>
              Never an accusation.
            </dd>
          </div>
        </dl>
      </section>

      {/* The rules the product is built on. */}
      <section className={s.rules} aria-labelledby="rules-title">
        <h2 id="rules-title" className={s.sectionTitle}>
          Models find. Code decides.
        </h2>
        <ol className={s.ruleList}>
          <li>
            <span>
              <b>No evidence, no number.</b> Every count links to its frames and outlines.
            </span>
          </li>
          <li>
            <span>
              <b>Word for word.</b> Every quote is checked against the document before it&apos;s shown.
            </span>
          </li>
          <li>
            <span>
              <b>Short needs full coverage.</b> A room that wasn&apos;t fully seen is never called Short.
            </span>
          </li>
          <li>
            <span>
              <b>Code decides the outcome.</b> AI reads the documents and finds the objects; the verdict comes only from plain, testable rules.
            </span>
          </li>
        </ol>
      </section>

      {/* Who gets what. */}
      <section className={s.who} aria-labelledby="who-title">
        <h2 id="who-title" className={s.sectionTitle}>
          Proof that gets builders paid.
        </h2>
        <p className={s.whoLede}>
          SiteProof isn&apos;t a tool for catching cheats. A builder with verified progress gets paid without the argument, so builders want to send the footage.
        </p>
        <div className={s.whoGrid}>
          <div>
            <h3>Builders</h3>
            <p>Forward the clips you already take. See what&apos;s verified, and exactly which 5-second shots would clear the rest.</p>
          </div>
          <div>
            <h3>Buyers</h3>
            <p>A report for your flat, with frames for every verified item, before you pay a demand letter.</p>
          </div>
          <div>
            <h3>Banks</h3>
            <p>Evidence for each stage release, and an audit trail behind it.</p>
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
          Built by Furqaan, William and Apurva for the Meta Global AI Developer Hackathon, Indie track. The demo uses drawn frames and a fictional builder, not real site footage.
        </p>
      </footer>
    </div>
  );
}
