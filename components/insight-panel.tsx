"use client";

import { AlertTriangle, Quote, Sparkles, Users, Waypoints } from "lucide-react";
import { motion } from "framer-motion";

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
    <p className="rounded-xl border border-dashed border-cyan-400/20 bg-background/40 px-4 py-10 text-center text-sm leading-6 text-muted-foreground">
      {children}
    </p>
  );
}

function ArchetypeCard({ archetype }: { archetype: ArchetypeCardModel }) {
  return (
    <article className="rounded-xl border border-cyan-400/15 bg-background/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.2em] text-cyan-300/80 uppercase">
            Cluster {archetype.cluster_id}
          </p>
          <h3 className="mt-1.5 text-lg font-semibold tracking-tight">{archetype.name}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MaslowBadge need={archetype.dominant_maslow_need} />
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {archetype.size} · {archetype.percentage.toFixed(1)}%
          </span>
        </div>
      </div>
      <p className="mt-4 text-sm leading-7 text-foreground/85">{archetype.profile}</p>
      <ul className="mt-5 space-y-2.5">
        {archetype.dominant_emotions.map((key) => (
          <li key={key}>
            <div className="mb-1 flex items-center justify-between font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              <span>{EMOTION_LABELS[key]}</span>
              <span className="tabular-nums">
                {archetype.centroid ? archetype.centroid[key].toFixed(2) : "—"}
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
      <details className="mt-5">
        <summary className="cursor-pointer font-mono text-[11px] tracking-[0.14em] text-cyan-200/90 uppercase">
          Representative quotes ({archetype.representative_quotes.length})
        </summary>
        <ul className="mt-3 space-y-2">
          {archetype.representative_quotes.map((quote) => (
            <li
              key={quote}
              className="flex gap-2 rounded-lg bg-foreground/5 px-3 py-2.5 text-sm leading-6 text-foreground/80"
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
    <article className="rounded-xl border border-orange-400/20 bg-orange-400/8 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-lg font-semibold tracking-tight">{ask.title}</h3>
        <div className="flex items-center gap-2">
          <MaslowBadge need={ask.maslow_need} />
          <Badge variant="secondary" className="font-mono text-[10px] uppercase">
            {ask.confidence}
          </Badge>
        </div>
      </div>
      <p className="mt-4 text-sm leading-7 text-foreground/85">{ask.description}</p>
      <p className="mt-4 font-mono text-[11px] tracking-[0.12em] text-orange-200/80 uppercase">
        Evidence: {ask.evidence_archetype}
      </p>
    </article>
  );
}

function DissonanceCard({ alert }: { alert: DissonanceAlert }) {
  return (
    <article className="rounded-xl border border-rose-400/25 bg-rose-400/8 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="size-3.5 text-orange-300" />
        <Badge variant="destructive" className="font-mono text-[10px] tracking-wide uppercase">
          {DISSONANCE_LABELS[alert.type]}
        </Badge>
        {alert.rating != null ? (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {alert.rating}★
          </span>
        ) : null}
        <MaslowBadge need={alert.maslow_need} />
      </div>
      <p className="mt-4 text-sm leading-7 text-foreground">{alert.text}</p>
      <p className="mt-2 text-sm leading-7 text-orange-100/90">{alert.explanation}</p>
      <p className="mt-3 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
        {alert.emotion_summary}
      </p>
    </article>
  );
}

function ActionItemCard({
  hiddenAsk,
  recommendation,
  priority,
  effort,
}: {
  hiddenAsk: string;
  recommendation: string;
  priority: string;
  effort: string;
}) {
  return (
    <article className="rounded-xl border border-cyan-400/25 bg-cyan-400/8 p-5 shadow-[inset_3px_0_0_0_rgba(34,211,238,0.7)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-lg font-semibold tracking-tight">{hiddenAsk}</h3>
        <div className="flex items-center gap-2">
          <Badge className="font-mono text-[10px] uppercase">{priority}</Badge>
          <Badge variant="outline" className="font-mono text-[10px] uppercase">
            effort {effort}
          </Badge>
        </div>
      </div>
      <p className="mt-4 text-sm leading-7 text-foreground/90">{recommendation}</p>
    </article>
  );
}

export function InsightPanel({ stream }: { stream: ResonanceStreamState }) {
  const archetypes = archetypesWithCentroids(stream);
  const asks = hiddenAskCards(stream);
  const alerts = dissonanceAlerts(stream);
  const actions = stream.actionItems?.items ?? [];

  return (
    <Card className="border-cyan-400/20 bg-card/80 shadow-[0_0_60px_rgba(8,145,178,0.08)]">
      <CardHeader className="gap-2">
        <CardTitle className="text-lg tracking-tight">Analysis Results</CardTitle>
        <CardDescription className="leading-6">
          Customer segments and hidden needs discovered from your reviews. Recommendations
          appear after approval.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="archetypes" className="w-full">
          <TabsList variant="line" className="grid h-auto w-full grid-cols-2 gap-x-1 lg:grid-cols-4">
            <TabsTrigger value="archetypes" className="px-2 py-2 text-xs sm:text-sm">
              <Users className="size-3.5" />
              Segments ({archetypes.length})
            </TabsTrigger>
            <TabsTrigger value="asks" className="px-2 py-2 text-xs sm:text-sm">
              <Sparkles className="size-3.5" />
              Unspoken Needs ({asks.length})
            </TabsTrigger>
            <TabsTrigger value="dissonance" className="px-2 py-2 text-xs sm:text-sm">
              <AlertTriangle className="size-3.5" />
              Red Flags ({alerts.length})
            </TabsTrigger>
            <TabsTrigger value="actions" className="px-2 py-2 text-xs sm:text-sm">
              <Waypoints className="size-3.5" />
              Recommendations ({actions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="archetypes">
            <ScrollArea className="h-[28rem] pr-2">
              {archetypes.length ? (
                <div className="space-y-4 py-2">
                  {archetypes.map((archetype, i) => (
                    <motion.div
                      key={archetype.cluster_id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.3 }}
                    >
                      <ArchetypeCard archetype={archetype} />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <EmptyHint>
                  Customer segments will appear here once the analysis identifies emotional patterns.
                </EmptyHint>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="asks">
            <ScrollArea className="h-[28rem] pr-2">
              {asks.length ? (
                <div className="space-y-4 py-2">
                  {asks.map((ask, i) => (
                    <motion.div
                      key={ask.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.3 }}
                    >
                      <HiddenAskCard ask={ask} />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <EmptyHint>
                  Unspoken needs — things customers feel but never explicitly request — will appear here after analysis.
                </EmptyHint>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="dissonance">
            <ScrollArea className="h-[28rem] pr-2">
              {alerts.length ? (
                <div className="space-y-4 py-2">
                  {alerts.map((alert, i) => (
                    <motion.div
                      key={alert.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.3 }}
                    >
                      <DissonanceCard alert={alert} />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <EmptyHint>
                  Reviews where words contradict emotions will appear here after scoring completes.
                </EmptyHint>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="actions">
            <ScrollArea className="h-[28rem] pr-2">
              {actions.length ? (
                <div className="space-y-4 py-2">
                  {actions.map((item, i) => (
                    <motion.div
                      key={`${item.hidden_ask}-${item.priority}`}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.3 }}
                    >
                      <ActionItemCard
                        hiddenAsk={item.hidden_ask}
                        recommendation={item.recommendation}
                        priority={item.priority}
                        effort={item.effort}
                      />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <EmptyHint>
                  Recommendations will appear after you review and approve the findings.
                </EmptyHint>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}