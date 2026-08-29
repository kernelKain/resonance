"use client";

import { useSyncExternalStore } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
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
  const scores = resolveAverageScores(stream);
  const points = scores ? toRadarPoints(scores) : [];
  const dominant = scores ? dominantEmotion(scores) : null;
  const source = stream.analysis?.emotion_summary?.average_scores
    ? "analysis_result averages"
    : stream.scored
      ? "mean of scored_reviews"
      : null;

  return (
    <Card className="border-cyan-400/20 bg-card/80 shadow-[0_0_60px_rgba(8,145,178,0.08)]">
      <CardHeader className="gap-2">
        <CardTitle className="text-lg tracking-tight">Plutchik emotion wheel</CardTitle>
        <CardDescription className="leading-6">
          {scores
            ? `Eight-dimension profile from ${source}. Dominant: ${dominant ? EMOTION_LABELS[dominant] : "—"}.`
            : "Waiting for the first resonance-data fence. The polygon appears as soon as reviews are scored."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_11.5rem]">
          <div className="h-[320px] w-full sm:h-[400px]">
            {isClient && scores ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={points} cx="50%" cy="50%" outerRadius="72%">
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
                    fill="#22d3ee"
                    fillOpacity={0.32}
                    strokeWidth={2.4}
                    isAnimationActive
                    animationDuration={700}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-cyan-400/25 bg-background/40">
                <p className="font-mono text-[11px] tracking-[0.22em] text-cyan-200/70 uppercase">
                  Awaiting Plutchik vectors
                </p>
              </div>
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
              return (
                <li
                  key={key}
                  className={cn(
                    "rounded-lg border border-border/70 px-2.5 py-2",
                    dominant === key &&
                      "border-cyan-400/50 bg-cyan-400/10 shadow-[inset_0_0_20px_rgba(34,211,238,0.08)]",
                  )}
                >
                  <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: EMOTION_COLORS[key] }}
                    />
                    {EMOTION_LABELS[key]}
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