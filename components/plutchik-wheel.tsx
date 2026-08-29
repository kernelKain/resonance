"use client";

import { useSyncExternalStore, useState } from "react";
import { motion } from "framer-motion";
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

type TickProps = {
  payload?: { value?: string };
  x?: number;
  y?: number;
  textAnchor?: "start" | "middle" | "end" | "inherit";
};

function EmotionTick({ payload, x = 0, y = 0, textAnchor = "middle" }: TickProps) {
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
    >
      {label.toUpperCase()}
    </text>
  );
}

function subscribe() {
  return () => {};
}

function useIsClient() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

export function PlutchikWheel({ stream }: { stream: ResonanceStreamState }) {
  const isClient = useIsClient();
  const [hoveredKey, setHoveredKey] = useState<EmotionKey | null>(null);

  const scores = resolveAverageScores(stream);
  const points = scores ? toRadarPoints(scores) : [];
  const dominant = scores ? dominantEmotion(scores) : null;
  const source = stream.analysis?.emotion_summary?.average_scores
    ? "overall analysis"
    : stream.scored
      ? "review scores"
      : null;

  // The actively highlighted key: what the user is hovering, otherwise nothing
  const activeKey = hoveredKey;

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
          <div className="h-[320px] w-full sm:h-[400px]">
            {isClient && scores ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 20, duration: 0.4 }}
                className="h-full w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={points} cx="50%" cy="50%" outerRadius="72%">
                    <defs>
                      <linearGradient id="radarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#0891b2" stopOpacity={0.3} />
                      </linearGradient>
                      <filter id="radarGlow">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>
                    <PolarGrid stroke="rgba(34,211,238,0.22)" />
                    <PolarAngleAxis dataKey="axis" tick={<EmotionTick />} tickLine={false} />
                    <PolarRadiusAxis
                      domain={[0, 1]}
                      tickCount={5}
                      tick={{ fill: "rgba(148,163,184,0.7)", fontSize: 10 }}
                      axisLine={false}
                    />
                    <Radar
                      name="Plutchik"
                      dataKey="value"
                      stroke="#67e8f9"
                      fill="url(#radarGradient)"
                      fillOpacity={0.45}
                      strokeWidth={2.4}
                      isAnimationActive
                      animationDuration={700}
                    />
                    <Tooltip
                      cursor={false}
                      content={({ payload }) => {
                        const item = payload?.[0];
                        if (!item) return null;
                        const pt = item.payload as { axis: string; key: EmotionKey; value: number; color: string };
                        return (
                          <div className="rounded-lg border border-cyan-400/20 bg-slate-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur-sm">
                            <p
                              className="font-mono tracking-[0.14em] uppercase"
                              style={{ color: pt.color }}
                            >
                              {pt.axis}
                            </p>
                            <p className="mt-1 font-mono tabular-nums text-cyan-100">
                              {pt.value.toFixed(2)} / 1.00
                            </p>
                          </div>
                        );
                      }}
                    />
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

            {/* Screen reader only data table */}
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
            ).map((key) => {
              const value = scores?.[key] ?? 0;
              const isHovered = activeKey === key;
              const isDominant = dominant === key;
              return (
                <li
                  key={key}
                  onMouseEnter={() => setHoveredKey(key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  className={cn(
                    "cursor-default rounded-lg border border-border/70 px-2.5 py-2 transition-all duration-150",
                    isHovered &&
                      "border-cyan-400/50 bg-cyan-400/10 shadow-[inset_0_0_20px_rgba(34,211,238,0.08)]",
                  )}
                >
                  <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                    <span
                      className={cn(
                        "size-2 rounded-full transition-all duration-150",
                        // Pulse only the dominant dot when nothing is hovered
                        isDominant && !hoveredKey && "shadow-[0_0_8px_currentColor] animate-pulse",
                        // Glow on hover
                        isHovered && "shadow-[0_0_10px_currentColor] scale-125",
                      )}
                      style={{ background: EMOTION_COLORS[key], color: EMOTION_COLORS[key] }}
                    />
                    {EMOTION_LABELS[key]}
                    {isDominant && (
                      <span className="ml-auto font-mono text-[9px] tracking-widest text-cyan-400/60 uppercase">
                        top
                      </span>
                    )}
                  </p>
                  <p className="mt-1 font-mono text-sm tabular-nums text-cyan-100">
                    {scores ? value.toFixed(2) : "—"}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}