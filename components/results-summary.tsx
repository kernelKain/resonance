"use client";

import { CheckCircle2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResonanceStreamState } from "@/lib/resonance-parse";
import { resolveAverageScores, dominantEmotion, EMOTION_LABELS } from "@/lib/plutchik";

type Props = {
  stream: ResonanceStreamState;
  productName?: string;
};

export function ResultsSummary({ stream, productName = "Product" }: Props) {
  const scores = resolveAverageScores(stream);
  const dominant = scores ? dominantEmotion(scores) : null;
  const findings = stream.actionItems?.items.slice(0, 3) ?? [];

  function handleExportPdf() {
    const prev = document.title;
    document.title = `Resonance — ${productName} Analysis`;
    window.print();
    // Restore original title after a brief delay (print dialog can be async)
    setTimeout(() => { document.title = prev; }, 2000);
  }

  return (
    <Card className="noise-texture glass-surface border-cyan-400/15 bg-card/80 ring-1 ring-white/[0.04] ring-inset">
      <CardHeader className="gap-2">
        <CardTitle className="flex items-center gap-2 text-lg tracking-tight">
          <CheckCircle2 className="size-5 text-cyan-300" />
          Executive Summary
        </CardTitle>
        <CardDescription className="leading-6">
          Analysis complete. Here are the key takeaways from your customer feedback.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ── Synthesis block ─────────────────────────────────────── */}
        <div className="rounded-lg border border-cyan-400/10 bg-cyan-400/5 p-4 space-y-3">
          <p className="text-sm leading-6 text-cyan-100">
            <strong>Synthesis:</strong> The primary emotional driver across{" "}
            {stream.scored?.total_reviews ?? 0} reviews is{" "}
            <span className="font-semibold text-cyan-300">
              {dominant ? EMOTION_LABELS[dominant].toLowerCase() : "neutrality"}
            </span>
            . We identified {stream.analysis?.archetypes?.length ?? 0} distinct customer segments
            and {stream.analysis?.hidden_asks?.length ?? 0} unspoken needs.
          </p>
          {/* Plain-English metric guide */}
          <dl className="grid grid-cols-1 gap-2 border-t border-cyan-400/10 pt-3 sm:grid-cols-3">
            <div>
              <dt className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                Reviews analysed
              </dt>
              <dd className="mt-0.5 font-mono text-sm tabular-nums text-cyan-100">
                {stream.scored?.total_reviews ?? 0}
              </dd>
              <dd className="mt-0.5 text-xs leading-5 text-muted-foreground">
                Total scored rows from your CSV.
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                Customer segments
              </dt>
              <dd className="mt-0.5 font-mono text-sm tabular-nums text-cyan-100">
                {stream.analysis?.archetypes?.length ?? 0}
              </dd>
              <dd className="mt-0.5 text-xs leading-5 text-muted-foreground">
                Groups of reviewers sharing emotional patterns.
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                Unspoken needs
              </dt>
              <dd className="mt-0.5 font-mono text-sm tabular-nums text-cyan-100">
                {stream.analysis?.hidden_asks?.length ?? 0}
              </dd>
              <dd className="mt-0.5 text-xs leading-5 text-muted-foreground">
                Desires felt but never explicitly requested.
              </dd>
            </div>
          </dl>
        </div>

        {/* ── Top recommendations ─────────────────────────────────── */}
        {findings.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Top Recommendations
            </h4>
            <ul className="space-y-2">
              {findings.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-6 text-foreground/90">
                  <span className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-full bg-cyan-400/20 text-[10px] font-bold text-cyan-300">
                    {i + 1}
                  </span>
                  {item.recommendation}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Action buttons ──────────────────────────────────────── */}
        <div className="no-print pt-2">
          {/* PDF Export — triggers browser print dialog with @media print styles */}
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleExportPdf}
            title="Export as PDF using the browser print dialog"
          >
            <Download className="size-4" />
            Export PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
