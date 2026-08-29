"use client";

import { useState } from "react";
import { CheckCircle2, Download, Share2, Check, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResonanceStreamState } from "@/lib/resonance-parse";
import { resolveAverageScores, dominantEmotion, EMOTION_LABELS } from "@/lib/plutchik";

type Props = {
  stream: ResonanceStreamState;
  productName?: string;
};

/**
 * Serialises a lightweight result summary into a base64-encoded URL hash so
 * the user can share a link that restores the key metrics without any server.
 * Full dataset is not shared — only headline numbers and the dominant emotion.
 */
function buildShareUrl(stream: ResonanceStreamState, productName: string): string {
  const scores = resolveAverageScores(stream);
  const dominant = scores ? dominantEmotion(scores) : null;

  const summary = {
    p: productName,
    r: stream.scored?.total_reviews ?? 0,
    s: stream.analysis?.archetypes?.length ?? 0,
    a: stream.analysis?.hidden_asks?.length ?? 0,
    d: dominant ?? "",
    rec: stream.actionItems?.items.slice(0, 3).map((i) => i.recommendation) ?? [],
  };

  const encoded = btoa(encodeURIComponent(JSON.stringify(summary)));
  const url = `${window.location.origin}${window.location.pathname}#result=${encoded}`;
  return url;
}

export function ResultsSummary({ stream, productName = "Product" }: Props) {
  const scores = resolveAverageScores(stream);
  const dominant = scores ? dominantEmotion(scores) : null;
  const findings = stream.actionItems?.items.slice(0, 3) ?? [];

  // Share button state
  const [copied, setCopied] = useState(false);

  function handleExportPdf() {
    const prev = document.title;
    document.title = `Resonance — ${productName} Analysis`;
    window.print();
    // Restore original title after a brief delay (print dialog can be async)
    setTimeout(() => { document.title = prev; }, 2000);
  }

  async function handleShare() {
    const url = buildShareUrl(stream, productName);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback: create a temporary input and copy from it
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
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
        <div className="rounded-lg border border-cyan-400/10 bg-cyan-400/5 p-4">
          <p className="text-sm leading-6 text-cyan-100">
            <strong>Synthesis:</strong> The primary emotional driver across{" "}
            {stream.scored?.total_reviews ?? 0} reviews is{" "}
            <span className="font-semibold text-cyan-300">
              {dominant ? EMOTION_LABELS[dominant].toLowerCase() : "neutrality"}
            </span>
            . We identified {stream.analysis?.archetypes?.length ?? 0} distinct customer segments
            and {stream.analysis?.hidden_asks?.length ?? 0} unspoken needs.
          </p>
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
        <div className="no-print flex gap-3 pt-2">
          {/* PDF Export — triggers browser print dialog with @media print styles */}
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={handleExportPdf}
            title="Export as PDF using the browser print dialog"
          >
            <Download className="size-4" />
            Export PDF
          </Button>

          {/* Share — encodes a summary into a URL hash and copies to clipboard */}
          <Button
            variant="outline"
            className="flex-1 gap-2 transition-colors"
            onClick={handleShare}
            title="Copy a shareable summary link to clipboard"
          >
            {copied ? (
              <>
                <Check className="size-4 text-cyan-300" />
                <span className="text-cyan-300">Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="size-4" />
                Share
              </>
            )}
          </Button>
        </div>

        {/* Copy confirmation hint */}
        {copied && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link className="size-3" />
            Link copied — it includes top recommendations and key metrics.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
