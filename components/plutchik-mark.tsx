/**
 * PlutchikMark — App logo SVG.
 *
 * Two concentric donut rings of 8 Plutchik emotion slices.
 * The outer ring rotates very slowly (90s via .logo-outer-ring CSS class).
 * The inner ring is offset by 22.5° and rendered at 55% scale.
 * A central "R" glyph in cyan sits at the heart of the wheel.
 */

const EMOTIONS = [
  { name: "Joy",          color: "var(--color-emotion-joy, #f5d76e)" },
  { name: "Trust",        color: "var(--color-emotion-trust, #5ee0a0)" },
  { name: "Fear",         color: "var(--color-emotion-fear, #7dffb3)" },
  { name: "Surprise",     color: "var(--color-emotion-surprise, #67e8f9)" },
  { name: "Sadness",      color: "var(--color-emotion-sadness, #60a5fa)" },
  { name: "Disgust",      color: "var(--color-emotion-disgust, #c084fc)" },
  { name: "Anger",        color: "var(--color-emotion-anger, #fb7185)" },
  { name: "Anticipation", color: "var(--color-emotion-anticipation, #fb923c)" },
] as const;

/** Builds an SVG donut-arc path for one emotion slice. */
function buildArcPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
  gapRad = 0.04,
): string {
  const s = startAngle + gapRad;
  const e = endAngle - gapRad;

  const x1 = cx + outerR * Math.cos(s);
  const y1 = cy + outerR * Math.sin(s);
  const x2 = cx + outerR * Math.cos(e);
  const y2 = cy + outerR * Math.sin(e);

  const ix1 = cx + innerR * Math.cos(e);
  const iy1 = cy + innerR * Math.sin(e);
  const ix2 = cx + innerR * Math.cos(s);
  const iy2 = cy + innerR * Math.sin(s);

  return `M ${x1} ${y1} A ${outerR} ${outerR} 0 0 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 0 0 ${ix2} ${iy2} Z`;
}

export function PlutchikMark({ className }: { className?: string }) {
  const cx = 50;
  const cy = 50;
  const slice = (2 * Math.PI) / 8;

  // Outer ring geometry
  const outerR = 45;
  const outerInner = 30;

  // Inner ring geometry — smaller, offset 22.5° (half slice), 55% scale
  const innerR = 24;
  const innerInner = 14;
  const innerOffset = slice / 2; // 22.5° phase offset for visual contrast

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      aria-label="Resonance logo"
      role="img"
    >
      <defs>
        {/* Subtle drop shadow for the whole logo */}
        <filter id="logoGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Cyan centre glow */}
        <filter id="centreGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── Outer ring (slow rotation via CSS) ─────────────────────────── */}
      <g className="logo-outer-ring" filter="url(#logoGlow)">
        {/* Faint outer boundary circle */}
        <circle
          cx={cx}
          cy={cy}
          r="48"
          fill="none"
          stroke="rgba(34,211,238,0.25)"
          strokeWidth="0.8"
        />
        {EMOTIONS.map((emotion, i) => {
          const start = i * slice - Math.PI / 2;
          const end = start + slice;
          return (
            <path
              key={emotion.name}
              d={buildArcPath(cx, cy, outerR, outerInner, start, end)}
              fill={emotion.color}
              opacity={0.88}
              stroke="rgba(2,6,23,0.6)"
              strokeWidth="0.5"
            />
          );
        })}
      </g>

      {/* ── Inner ring (static, phase-offset for contrast) ──────────────── */}
      <g opacity={0.72}>
        {EMOTIONS.map((emotion, i) => {
          const start = i * slice - Math.PI / 2 + innerOffset;
          const end = start + slice;
          return (
            <path
              key={`inner-${emotion.name}`}
              d={buildArcPath(cx, cy, innerR, innerInner, start, end)}
              fill={emotion.color}
              opacity={0.9}
              stroke="rgba(2,6,23,0.5)"
              strokeWidth="0.5"
            />
          );
        })}
      </g>

      {/* ── Centre glyph ─────────────────────────────────────────────────── */}
      {/* Dark background disc */}
      <circle
        cx={cx}
        cy={cy}
        r="11"
        fill="#020617"
        stroke="rgba(34,211,238,0.7)"
        strokeWidth="1"
        filter="url(#centreGlow)"
      />
      {/* "R" letterform in cyan */}
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fontFamily="var(--font-geist-mono), ui-monospace, monospace"
        fill="rgba(34,211,238,0.95)"
        letterSpacing="-0.5"
      >
        R
      </text>
    </svg>
  );
}
