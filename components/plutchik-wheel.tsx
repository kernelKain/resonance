"use client";

import { useEffect, useState } from "react";
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
  textAnchor?: string;
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
      fontSize={12}
      fontFamily="var(--font-geist-sans), ui-sans-serif, system-ui"
      letterSpacing="0.04em"
    >
      {label}
    </text>
  );
}

export function PlutchikWheel({ stream }: { stream: ResonanceStreamState }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const scores = resolveAverageScores(stream);
  const points = scores ? toRadarPoints(scores) : [];
  const dominant = scores ? dominantEmotion(scores) : null;
  const source = stream.analysis?.emotion_summary?.average_scores
    ? "analysis_result averages"
    : stream.scored
      ? "mean of scored_reviews"
      : null;

  return (
    <Card className="border-cyan-400/10 bg-card/70">
      <CardHeader>
        <CardTitle className="text-base tracking-tight">Plutchik emotion wheel</CardTitle>
        <CardDescription>
          {scores
            ? `Eight-dimension profile from ${source}. Dominant: ${dominant ? EMOTION_LABELS[dominant] : "—"}.`
            : "Waiting for the first resonance-data fence. The polygon appears as soon as reviews are scored."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_180px]">
          <div className="h-[360px] w-full sm:h-[420px]">
            {mounted && scores ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={points} cx="50%" cy="50%" outerRadius="72%">
                  <PolarGrid stroke="rgba(103,232,249,0.18)" />
                  <PolarAngleAxis dataKey="axis" tick={<EmotionTick />} tickLine={false} />
                  <PolarRadiusAxis
                    domain={[0, 1]}
                    tickCount={5}
                    tick={{ fill: "rgba(148,163,184,0.75)", fontSize: 10 }}
                    axisLine={false}
                  />
                  <Radar
                    name="Plutchik"
                    dataKey="value"
                    stroke="#67e8f9"
                    fill="#22d3ee"
                    fillOpacity={0.35}
                    strokeWidth={2}
                    isAnimationActive
                    animationDuration={700}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-cyan-400/20 bg-background/30">
                <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
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
                    "rounded-lg border border-border/60 px-2.5 py-2",
                    dominant === key && "border-cyan-400/40 bg-cyan-400/5",
                  )}
                >
                  <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: EMOTION_COLORS[key] }}
                    />
                    {EMOTION_LABELS[key]}
                  </p>
                  <p className="mt-1 font-mono text-sm text-cyan-100">
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