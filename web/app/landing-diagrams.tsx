/**
 * The landing page's mechanism drawings, in the plan's own language: tracing lines on
 * blueprint, Safety Orange only for what gets counted, placed or proven. Each is a
 * small sheet detail with its own accessible description.
 */
import s from "./landing.module.css";

const LINE = "var(--plan-line)";
const SOFT = "var(--plan-ink-soft)";
const MARK = "var(--mark)"; // only the outline of a counted object
const AMBER = "var(--plan-label-short)"; // marks, arrows and checks on the drawing

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <svg className={s.diagram} viewBox="0 0 320 200" role="img" aria-label={label}>
      {children}
    </svg>
  );
}

/** A page of the demand letter, one line highlighted and bracketed. */
export function QuoteDiagram() {
  return (
    <Detail label="A demand letter page with one line highlighted and checked against the document">
      <rect x="70" y="18" width="150" height="168" fill="none" stroke={LINE} strokeWidth="2" />
      {[44, 60, 76].map((y) => (
        <line key={y} x1="86" y1={y} x2={y === 76 ? 170 : 204} y2={y} stroke={SOFT} strokeWidth="3" />
      ))}
      <rect x="82" y="94" width="126" height="18" fill="var(--quote-mark)" />
      <line x1="88" y1="103" x2="198" y2="103" stroke="#1e1d1a" strokeWidth="3" />
      {[128, 144, 160].map((y) => (
        <line key={y} x1="86" y1={y} x2={y === 160 ? 150 : 204} y2={y} stroke={SOFT} strokeWidth="3" />
      ))}
      <path d="M 232 92 h 12 v 22 h -12" fill="none" stroke={AMBER} strokeWidth="3" />
      <circle cx="270" cy="103" r="16" fill="none" stroke={AMBER} strokeWidth="3" />
      <path d="M 262 103 l 6 6 l 11 -12" fill="none" stroke={AMBER} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </Detail>
  );
}

/** A room in plan with its doorway tag, and a clip's path entering past it. */
export function PlaceDiagram() {
  return (
    <Detail label="A room in plan with a printed tag at the doorway; a clip that passes the tag is placed in Bedroom 2">
      <path d="M 40 30 H 280 V 170 H 40 V 110 M 40 74 V 30" fill="none" stroke={LINE} strokeWidth="3" />
      <path d="M 40 74 A 36 36 0 0 1 76 110" fill="none" stroke={SOFT} strokeWidth="1.5" strokeDasharray="4 4" />
      <rect x="47" y="80" width="22" height="22" fill="#f4f8fc" />
      <rect x="51" y="84" width="6" height="6" fill="#1e1d1a" />
      <rect x="61" y="84" width="4" height="4" fill="#1e1d1a" />
      <rect x="51" y="94" width="4" height="4" fill="#1e1d1a" />
      <rect x="59" y="92" width="6" height="6" fill="#1e1d1a" />
      <path d="M 4 92 C 30 92, 60 92, 110 92 S 190 120, 228 136" fill="none" stroke={AMBER} strokeWidth="3" />
      <path d="M 222 128 l 8 9 l -11 3" fill="none" stroke={AMBER} strokeWidth="3" strokeLinejoin="round" />
      <text x="160" y="62" textAnchor="middle" className={s.svgLabel}>
        FLAT 302 · BEDROOM 2
      </text>
    </Detail>
  );
}

/** One window, passed three times by the camera, counted once. */
export function CountDiagram() {
  return (
    <Detail label="One window passed three times by the camera is tracked as one object and counted once">
      <rect x="128" y="40" width="64" height="88" fill="none" stroke={MARK} strokeWidth="3" />
      <line x1="160" y1="40" x2="160" y2="128" stroke={MARK} strokeWidth="2" />
      {[30, 84, 138].map((y, i) => (
        <g key={y}>
          <path d={`M 24 ${y} C 90 ${y}, 230 ${y}, 296 ${y}`} fill="none" stroke={SOFT} strokeWidth="1.5" strokeDasharray="6 6" />
          <text x="20" y={y + 4} textAnchor="end" className={s.svgLabel}>
            {i + 1}
          </text>
        </g>
      ))}
      <text x="160" y="178" textAnchor="middle" className={s.svgLabel}>
        SEEN 3 TIMES · COUNTED 1
      </text>
    </Detail>
  );
}

/** A one-way sweep from the tag, all the way round, never panning back. */
export function SweepDiagram() {
  return (
    <Detail label="A one-way sweep starts at the room tag and pans all the way round the room in one direction, never back">
      <path d="M 50 30 H 270 V 170 H 50 V 116 M 50 84 V 30" fill="none" stroke={LINE} strokeWidth="3" />
      {[90, 160, 230].map((x) => (
        <rect key={x} x={x - 18} y="24" width="36" height="12" fill="none" stroke={LINE} strokeWidth="2" />
      ))}
      <rect x="264" y="82" width="12" height="36" fill="none" stroke={LINE} strokeWidth="2" />
      <rect x="57" y="89" width="20" height="20" fill="#f4f8fc" />
      <path d="M 86 99 C 86 50, 140 64, 160 64 S 236 70, 238 100 S 210 146, 160 146" fill="none" stroke={AMBER} strokeWidth="3" />
      <path d="M 170 139 l -11 7 l 10 8" fill="none" stroke={AMBER} strokeWidth="3" strokeLinejoin="round" />
      <text x="160" y="190" textAnchor="middle" className={s.svgLabel}>
        ONE WAY FROM THE TAG · NO PANNING BACK
      </text>
    </Detail>
  );
}
