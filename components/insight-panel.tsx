"use client";

import { AlertTriangle, Quote, Sparkles, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  archetypesWithCentroids,
  DISSONANCE_LABELS,
  dissonanceAlerts,
  emotionBarWidth,
  hiddenAskCards,
  MASLOW_LABELS,
  type ArchetypeCardModel,
  type DissonanceAlert,
} from "@/lib/insight-views";
import { EMOTION_COLORS, EMOTION_LABELS } from "@/lib/plutchik";
import type { ResonanceStreamState } from "@/lib/resonance-parse";
import type { HiddenAsk, MaslowNeed } from "@/lib/resonance-types";

function MaslowBadge({ need }: { need: MaslowNeed }) {
  return (
    <Badge variant="outline" className="font-mono text-[10px] tracking-wide uppercase">
      {MASLOW_LABELS[need]}
    </Badge>
  );
}

function EmptyHint({ children }: { children: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border/70 bg-background/30 px-3 py-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function ArchetypeCard({ archetype }: { archetype: ArchetypeCardModel }) {
  return (
    <article className="rounded-xl border border-cyan-400/10 bg-background/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] tracking-[0.18em] text-cyan-300/80 uppercase">
            Cluster {archetype.cluster_id}
          </p>
          <h3 className="mt-1 text-base font-semibold tracking-tight">{archetype.name}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MaslowBadge need={archetype.dominant_maslow_need} />
          <span className="font-mono text-xs text-muted-foreground">
            {archetype.size} · {archetype.percentage.toFixed(1)}%
          </span>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-foreground/85">{archetype.profile}</p>
      <ul className="mt-4 space-y-2">
        {archetype.dominant_emotions.map((key) => (
          <li key={key}>
            <div className="mb-1 flex items-center justify-between font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              <span>{EMOTION_LABELS[key]}</span>
              <span>
                {archetype.centroid
                  ? archetype.centroid[key].toFixed(2)
                  : "—"}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${emotionBarWidth(archetype.centroid, key)}%`,
                  background: EMOTION_COLORS[key],
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      <details className="mt-4">
        <summary className="cursor-pointer font-mono text-[11px] tracking-[0.14em] text-cyan-200/90 uppercase">
          Representative quotes ({archetype.representative_quotes.length})
        </summary>
        <ul className="mt-2 space-y-2">
          {archetype.representative_quotes.map((quote) => (
            <li
              key={quote}
              className="flex gap-2 rounded-lg bg-foreground/5 px-3 py-2 text-sm leading-6 text-foreground/80"
            >
              <Quote className="mt-1 size-3.5 shrink-0 text-cyan-300" />
              {quote}
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}

function HiddenAskCard({ ask }: { ask: HiddenAsk }) {
  return (
    <article className="rounded-xl border border-orange-400/15 bg-orange-400/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight">{ask.title}</h3>
        <div className="flex items-center gap-2">
          <MaslowBadge need={ask.maslow_need} />
          <Badge variant="secondary" className="font-mono text-[10px] uppercase">
            {ask.confidence}
          </Badge>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-foreground/85">{ask.description}</p>
      <p className="mt-3 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
        Evidence: {ask.evidence_archetype}
      </p>
    </article>
  );
}

function DissonanceCard({ alert }: { alert: DissonanceAlert }) {
  return (
    <article className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="size-3.5 text-orange-300" />
        <Badge variant="destructive" className="font-mono text-[10px] tracking-wide uppercase">
          {DISSONANCE_LABELS[alert.type]}
        </Badge>
        {alert.rating != null ? (
          <span className="font-mono text-xs text-muted-foreground">{alert.rating}★</span>
        ) : null}
        <MaslowBadge need={alert.maslow_need} />
      </div>
      <p className="mt-3 text-sm leading-6 text-foreground">{alert.text}</p>
      <p className="mt-2 text-sm leading-6 text-orange-100/90">{alert.explanation}</p>
      <p className="mt-2 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
        {alert.emotion_summary}
      </p>
    </article>
  );
}

export function InsightPanel({ stream }: { stream: ResonanceStreamState }) {
  const archetypes = archetypesWithCentroids(stream);
  const asks = hiddenAskCards(stream);
  const alerts = dissonanceAlerts(stream);

  return (
    <Card className="border-cyan-400/10 bg-card/70">
      <CardHeader>
        <CardTitle className="text-base tracking-tight">Psychological findings</CardTitle>
        <CardDescription>
          Archetypes and Hidden Asks come from analysis_result. Dissonance alerts light up as
          soon as scored_reviews lands.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="archetypes" className="w-full">
          <TabsList variant="line" className="grid w-full grid-cols-3">
            <TabsTrigger value="archetypes">
              <Users className="size-3.5" />
              Archetypes ({archetypes.length})
            </TabsTrigger>
            <TabsTrigger value="asks">
              <Sparkles className="size-3.5" />
              Hidden Asks ({asks.length})
            </TabsTrigger>
            <TabsTrigger value="dissonance">
              <AlertTriangle className="size-3.5" />
              Dissonance ({alerts.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="archetypes">
            <ScrollArea className="h-[28rem] pr-2">
              {archetypes.length ? (
                <div className="space-y-3 py-1">
                  {archetypes.map((archetype) => (
                    <ArchetypeCard key={archetype.cluster_id} archetype={archetype} />
                  ))}
                </div>
              ) : (
                <EmptyHint>
                  Waiting for analysis_result. Archetype names appear after sandbox clustering
                  and the third resonance-data fence.
                </EmptyHint>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="asks">
            <ScrollArea className="h-[28rem] pr-2">
              {asks.length ? (
                <div className="space-y-3 py-1">
                  {asks.map((ask) => (
                    <HiddenAskCard key={ask.id} ask={ask} />
                  ))}
                </div>
              ) : (
                <EmptyHint>
                  Hidden Asks are implied needs, not feature requests. They arrive with
                  analysis_result; action items stay empty until Day 5 approval.
                </EmptyHint>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="dissonance">
            <ScrollArea className="h-[28rem] pr-2">
              {alerts.length ? (
                <div className="space-y-3 py-1">
                  {alerts.map((alert) => (
                    <DissonanceCard key={alert.id} alert={alert} />
                  ))}
                </div>
              ) : (
                <EmptyHint>
                  No dissonance flags yet. Flagged reviews show here as soon as scoring
                  finishes — including reviews that look positive on the surface.
                </EmptyHint>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}