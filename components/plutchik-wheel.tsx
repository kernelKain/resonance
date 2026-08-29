"use client";

import { useSyncExternalStore, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResonanceStreamState } from "@/lib/resonance-parse";
import {
  EMOTION_COLORS,
  EMOTION_LABELS,
  dominantEmotion,
  resolveAverageScores,
  toRadarPoints,
} from "@/lib/plutchik";
import { InfoTooltip } from "@/components/info-tooltip";
import type { EmotionKey } from "@/lib/resonance-types";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type TickProps = {
  payload?: { value?: string };
  x?: number;
  y?: number;
  textAnchor?: "start" | "middle" | "end" | "inherit";
  /** Called when user enters/leaves this axis label — enables chart→list hover sync */
  onHoverChange?: (key: EmotionKey | null) => void;
};

// ─── SVG Axis Tick ────────────────────────────────────────────────────────────

/**
 * Custom axis tick for the radar chart.
 * Fires onHoverChange when mouse enters/leaves so list rows sync to chart hover.
 */
function EmotionTick({
  payload,
  x = 0,
  y = 0,
  textAnchor = "middle",
  onHoverChange,
}: TickProps) {
  const label = String(payload?.value ?? "");
  const key = label.toLowerCase() as EmotionKey;
  const color = EMOTION_COLORS[key] ?? "#67e8f9";

  return (
    <text
      x={x}
      y={y}
      textAnchor={textAnchor}
      fill={color}
      fontSize={11}
      fontFamily="var(--font-geist-mono), ui-monospace, monospace"
      letterSpacing="0.08em"
      fontWeight={600}
      style={{ cursor: "default" }}
      onMouseEnter={() => onHoverChange?.(key)}
      onMouseLeave={() => onHoverChange?.(null)}
    >
      {label.toUpperCase()}
    </text>
  );
}

// ─── SSR Guard ────────────────────────────────────────────────────────────────

function subscribe() {
  return () => {};
}

function useIsClient() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

// ─── Custom Radar Tooltip ─────────────────────────────────────────────────────

function RadarTooltipContent({
  payload,
}: {
  payload?: Array<{ payload: { axis: string; key: EmotionKey; value: number; color: string } }>;
}) {
  const item = payload?.[0];
  if (!item) return null;
  const pt = item.payload;
  return (
    <div className="rounded-lg border border-cyan-400/20 bg-slate-900/96 px-3 py-2.5 text-xs shadow-2xl backdrop-blur-md">
      <p
        className="font-mono font-semibold tracking-[0.14em] uppercase"
        style={{ color: pt.color }}
      >
        {pt.axis}
      </p>
      <p className="mt-1 font-mono tabular-nums text-cyan-100">
        {pt.value.toFixed(2)}{" "}
        <span className="text-muted-foreground">/ 1.00</span>
      </p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full"
          style={{ width: `${pt.value * 100}%`, background: pt.color }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PlutchikWheel({ stream }: { stream: ResonanceStreamState }) {
  const isClient = useIsClient();
  const [hoveredKey, setHoveredKey] = useState<EmotionKey | null>(null);

  // Stable callback via ref so Recharts tick re-renders don't lose the function
  const setHoveredKeyRef = useRef(setHoveredKey);
  setHoveredKeyRef.current = setHoveredKey;
  const onHoverChange = useCallback((key: EmotionKey | null) => {
    setHoveredKeyRef.current(key);
  }, []);

  const scores = resolveAverageScores(stream);
  const points = scores ? toRadarPoints(scores) : [];
  const dominant = scores ? dominantEmotion(scores) : null;
  const source = stream.analysis?.emotion_summary?.average_scores
    ? "overall analysis"
    : stream.scored
      ? "review scores"
      : null;

  // Use stronger glow filter when user hovers anything
  const glowId = hoveredKey ? "radarGlowStrong" : "radarGlow";

  return (
    <Card className="border-cyan-400/20 bg-card/80 shadow-[0_0_60px_rgba(8,145,178,0.08)]">
      <CardHeader className="gap-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg tracking-tight">Emotion Profile</CardTitle>
          <InfoTooltip content="Plutchik's Wheel of Emotions maps 8 core emotions. This profile shows the aggregate emotional footprint of your customers' reviews." />
        </div>
        <CardDescription className="leading-6">
          {scores
            ? `Eight-dimension profile from ${source}. Dominant: ${dominant ? EMOTION_LABELS[dominant] : "—"}.`
            : "Emotion profiles will appear here once the analysis begins."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_11.5rem]">

          {/* ── Radar chart ───────────────────────────────────────────────── */}
          <div className="h-[320px] w-full sm:h-[400px]">
            {isClient && scores ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.82 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 180, damping: 22 }}
                className="h-full w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={points} cx="50%" cy="50%" outerRadius="70%">
                    <defs>
                      {/* Primary fill gradient */}
                      <linearGradient id="radarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.55} />
                        <stop offset="100%" stopColor="#0891b2" stopOpacity={0.28} />
                      </linearGradient>
                      {/* Depth halo fill */}
                      <linearGradient id="radarHaloGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#67e8f9" stopOpacity={0.12} />
                        <stop offset="100%" stopColor="#0891b2" stopOpacity={0.06} />
                      </linearGradient>
                      {/* Normal glow */}
                      <filter id="radarGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                      {/* Stronger glow on hover */}
                      <filter id="radarGlowStrong" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="6" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>

                    <PolarGrid stroke="rgba(34,211,238,0.18)" />
                    <PolarAngleAxis
                      dataKey="axis"
                      tick={<EmotionTick onHoverChange={onHoverChange} />}
                      tickLine={false}
                    />
                    <PolarRadiusAxis
                      domain={[0, 1]}
                      tickCount={5}
                      tick={{ fill: "rgba(148,163,184,0.6)", fontSize: 9 }}
                      axisLine={false}
                    />

                    {/* Depth halo — larger, very faint, renders behind main polygon */}
                    <Radar
                      name="Halo"
                      dataKey="value"
                      stroke="none"
                      fill="url(#radarHaloGradient)"
                      fillOpacity={1}
                      isAnimationActive={false}
                      style={{ transform: "scale(1.06)", transformOrigin: "50% 50%" }}
                    />

                    {/* Main polygon with reactive glow filter */}
                    <Radar
                      name="Plutchik"
                      dataKey="value"
                      stroke="#67e8f9"
                      fill="url(#radarGradient)"
                      fillOpacity={0.48}
                      strokeWidth={2.2}
                      filter={`url(#${glowId})`}
                      isAnimationActive
                      animationDuration={700}
                      animationEasing="ease-out"
                    />

                    <Tooltip cursor={false} content={<RadarTooltipContent />} />
                  </RadarChart>
                </ResponsiveContainer>
              </motion.div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-cyan-400/25 bg-background/40">
                <p className="font-mono text-[11px] tracking-[0.22em] text-cyan-200/70 uppercase">
                  Awaiting Plutchik vectors
                </p>
              </div>
            )}

            {/* Screen-reader data table */}
            {scores && (
              <table className="sr-only">
                <caption>Emotion scores from {source}</caption>
                <thead>
                  <tr>
                    <th scope="col">Emotion</th>
                    <th scope="col">Score (0 to 1)</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.axis}>
                      <td>{p.axis}</td>
                      <td>{p.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Emotion list ──────────────────────────────────────────────── */}
          <ul className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {(
              [
                "joy",
                "trust",
                "fear",
                "surprise",
                "sadness",
                "disgust",
                "anger",
                "anticipation",
              ] as EmotionKey[]
            ).map((key, i) => {
              const value = scores?.[key] ?? 0;
              const isHovered = hoveredKey === key;
              const isDominant = dominant === key;
              const color = EMOTION_COLORS[key];

              return (
                <motion.li
                  key={key}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: scores ? i * 0.04 : 0, duration: 0.25 }}
                  onMouseEnter={() => setHoveredKey(key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  className={cn(
                    "cursor-default rounded-lg border px-2.5 py-2 transition-all duration-150",
                    isHovered
                      ? "border-cyan-400/50 bg-cyan-400/10 shadow-[inset_0_0_20px_rgba(34,211,238,0.08)]"
                      : "border-border/70",
                  )}
                >
                  {/* Label row */}
                  <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full transition-all duration-150",
                        isDominant && !hoveredKey && "animate-pulse shadow-[0_0_8px_currentColor]",
                        isHovered && "scale-125 shadow-[0_0_10px_currentColor]",
                      )}
                      style={{ background: color, color }}
                    />
                    {EMOTION_LABELS[key]}
                    {isDominant && (
                      <span className="ml-auto font-mono text-[9px] tracking-widest text-cyan-400/60 uppercase">
                        top
                      </span>
                    )}
                  </p>

                  {/* Score value */}
                  <p className="mt-1 font-mono text-sm tabular-nums text-cyan-100">
                    {scores ? value.toFixed(2) : "—"}
                  </p>

                  {/* Animated mini bar */}
                  {scores && (
                    <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-white/8">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${value * 100}%` }}
                        transition={{ duration: 0.6, delay: i * 0.04, ease: "easeOut" }}
                      />
                    </div>
                  )}
                </motion.li>
              );
            })}
          </ul>

        </div>

        {/* ── Hover detail hint ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {hoveredKey && scores && (
            <motion.div
              key={hoveredKey}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="mt-4 flex items-center gap-2.5 rounded-lg border border-cyan-400/15 bg-cyan-400/5 px-3 py-2"
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: EMOTION_COLORS[hoveredKey] }}
              />
              <p className="font-mono text-[11px] tracking-wide text-cyan-100/80">
                <span className="font-semibold" style={{ color: EMOTION_COLORS[hoveredKey] }}>
                  {EMOTION_LABELS[hoveredKey]}
                </span>
                {" — "}
                score {scores[hoveredKey].toFixed(2)} / 1.00
                {hoveredKey === dominant && (
                  <span className="ml-2 text-cyan-400/70">· dominant emotion</span>
                )}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
