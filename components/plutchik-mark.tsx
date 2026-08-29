const EMOTIONS = [
  { name: "Joy", color: "var(--color-emotion-joy, #f5d76e)" },
  { name: "Trust", color: "var(--color-emotion-trust, #5ee0a0)" },
  { name: "Fear", color: "var(--color-emotion-fear, #7dffb3)" },
  { name: "Surprise", color: "var(--color-emotion-surprise, #67e8f9)" },
  { name: "Sadness", color: "var(--color-emotion-sadness, #60a5fa)" },
  { name: "Disgust", color: "var(--color-emotion-disgust, #c084fc)" },
  { name: "Anger", color: "var(--color-emotion-anger, #fb7185)" },
  { name: "Anticipation", color: "var(--color-emotion-anticipation, #fb923c)" },
] as const;

export function PlutchikMark({ className }: { className?: string }) {
  const radius = 42;
  const inner = 18;
  const cx = 50;
  const cy = 50;
  const slice = (2 * Math.PI) / EMOTIONS.length;

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <circle
        cx={cx}
        cy={cy}
        r="48"
        fill="none"
        stroke="rgba(34,211,238,0.35)"
        strokeWidth="1.1"
      />
      {EMOTIONS.map((emotion, index) => {
        const start = index * slice - Math.PI / 2;
        const end = start + slice;
        const x1 = cx + radius * Math.cos(start);
        const y1 = cy + radius * Math.sin(start);
        const x2 = cx + radius * Math.cos(end);
        const y2 = cy + radius * Math.sin(end);
        const ix1 = cx + inner * Math.cos(end);
        const iy1 = cy + inner * Math.sin(end);
        const ix2 = cx + inner * Math.cos(start);
        const iy2 = cy + inner * Math.sin(start);
        const d = `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} L ${ix1} ${iy1} A ${inner} ${inner} 0 0 0 ${ix2} ${iy2} Z`;
        return (
          <path
            key={emotion.name}
            d={d}
            fill={emotion.color}
            opacity={0.92}
            stroke="rgba(2,6,23,0.7)"
            strokeWidth="0.7"
          />
        );
      })}
      <circle
        cx={cx}
        cy={cy}
        r="14"
        fill="#020617"
        stroke="rgba(34,211,238,0.75)"
        strokeWidth="1.2"
      />
    </svg>
  );
}