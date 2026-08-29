import { CheckCircle2, Radio } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalysisProgress } from "./analysis-progress";
import type { ResonancePhase, ResonanceStreamState } from "@/lib/resonance-parse";

type AgentOutputProps = {
  stream: ResonanceStreamState;
  phase: ResonancePhase;
  assistant: string;
  error: string | null;
  devMode: boolean;
};

export function AgentOutput({ stream, phase, assistant, error, devMode }: AgentOutputProps) {
  return (
    <Card className="noise-texture glass-surface border-cyan-400/15 bg-card/80 ring-1 ring-white/[0.04] ring-inset">
      <CardHeader className="gap-2">
        <CardTitle className="flex items-center gap-2 text-lg tracking-tight">
          <Radio className="size-4 text-cyan-300" />
          Agent output
        </CardTitle>
        <CardDescription className="leading-6">
          Results appear in real-time as the analysis progresses.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {devMode && assistant ? (
          <div className="prose prose-invert max-w-none text-sm leading-7 whitespace-pre-wrap">
            {assistant}
          </div>
        ) : (
          <AnalysisProgress stream={stream} phase={phase} />
        )}
        {stream.parseErrors.length ? (
          <p className="mt-4 text-xs leading-5 text-amber-200">
            Skipped {stream.parseErrors.length} incomplete data section
            {stream.parseErrors.length === 1 ? "" : "s"}.
          </p>
        ) : null}
        {phase === "done" ? (
          <p className="mt-5 flex items-center gap-2 text-xs leading-5 text-cyan-200">
            <CheckCircle2 className="size-3.5" />
            {stream.actionItems
              ? "Analysis complete — recommendations are ready."
              : "Analysis complete."}
          </p>
        ) : null}
        {error ? <p className="mt-4 text-sm leading-6 text-rose-300">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
