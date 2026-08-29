import { CheckCircle2, Download, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResonanceStreamState } from "@/lib/resonance-parse";
import { resolveAverageScores, dominantEmotion, EMOTION_LABELS } from "@/lib/plutchik";

export function ResultsSummary({ stream }: { stream: ResonanceStreamState }) {
  const scores = resolveAverageScores(stream);
  const dominant = scores ? dominantEmotion(scores) : null;

  const findings = stream.actionItems?.items.slice(0, 3) || [];

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
        <div className="rounded-lg border border-cyan-400/10 bg-cyan-400/5 p-4">
          <p className="text-sm leading-6 text-cyan-100">
            <strong>Synthesis:</strong> The primary emotional driver across {stream.scored?.total_reviews || 0} reviews is{" "}
            <span className="font-semibold text-cyan-300">
              {dominant ? EMOTION_LABELS[dominant].toLowerCase() : "neutrality"}
            </span>.
            We identified {stream.analysis?.archetypes?.length ?? 0} distinct customer segments
            and {stream.analysis?.hidden_asks?.length ?? 0} unspoken needs.
          </p>
        </div>

        {findings.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Top Recommendations</h4>
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

        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => alert("Export PDF (Coming Soon)")}>
            <Download className="mr-2 size-4" />
            Export PDF
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => alert("Share (Coming Soon)")}>
            <Share className="mr-2 size-4" />
            Share
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}