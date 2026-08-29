import { CheckCircle2, Radio } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalysisProgress } from "./analysis-progress";
import type { ResonancePhase, ResonanceStreamState } from "@/lib/resonance-parse";
import type { TranscriptItem } from "@/hooks/use-resonance-state";
import { cn } from "@/lib/utils";

type AgentOutputProps = {
  stream: ResonanceStreamState;
  phase: ResonancePhase;
  assistant: string;
  error: string | null;
  devMode: boolean;
  /** Transcript items to show the simplified activity log for non-dev users. */
  transcript: TranscriptItem[];
};

/** Kind labels shown in the simplified activity log for regular users. */
const KIND_LABEL: Record<TranscriptItem["kind"], string | null> = {
  status: "Status",
  tool: "Tool",
  subagent: "Subagent",
  user: null,     // Hide raw user prompts from non-dev view
  assistant: null,
  error: "Error",
};

export function AgentOutput({ stream, phase, assistant, error, devMode, transcript }: AgentOutputProps) {
  // Simplified log: only surface status/tool/subagent/error events to regular users
  const logItems = transcript.filter((t) => KIND_LABEL[t.kind] !== null);

  return (
    <Card className="noise-texture glass-surface border-cyan-400/15 bg-card/80 ring-1 ring-white/[0.04] ring-inset">
      <CardHeader className="gap-2">
        <CardTitle className="flex items-center gap-2 text-lg tracking-tight">
          <Radio className="size-4 text-cyan-300" />
          Live Analysis
        </CardTitle>
        <CardDescription className="leading-6">
          Follow along as the AI processes your reviews in real-time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Progress stepper — always visible */}
        <AnalysisProgress stream={stream} phase={phase} />

        {/* Dev: raw assistant output */}
        {devMode && assistant ? (
          <div className="prose prose-invert max-w-none text-sm leading-7 whitespace-pre-wrap border-t border-cyan-400/10 pt-4">
            {assistant}
          </div>
        ) : logItems.length > 0 ? (
          /* Non-dev: simplified activity log */
          <div className="space-y-1.5 border-t border-cyan-400/10 pt-4">
            <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase mb-2">
              Activity
            </p>
            {logItems.slice(-8).map((item) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-start gap-2.5 rounded-md px-3 py-2 text-xs leading-5",
                  item.kind === "status" && "bg-muted/40 text-muted-foreground",
                  item.kind === "tool" && "bg-orange-400/8 text-orange-100",
                  item.kind === "subagent" && "bg-violet-400/8 text-violet-100",
                  item.kind === "error" && "bg-rose-400/10 text-rose-200",
                )}
              >
                <span className="mt-0.5 shrink-0 font-mono text-[10px] tracking-wide uppercase opacity-60">
                  {KIND_LABEL[item.kind]}
                </span>
                <span className="min-w-0 break-words">{item.text}</span>
              </div>
            ))}
          </div>
        ) : null}

        {stream.parseErrors.length ? (
          <p className="text-xs leading-5 text-amber-200">
            Skipped {stream.parseErrors.length} incomplete data section
            {stream.parseErrors.length === 1 ? "" : "s"}.
          </p>
        ) : null}

        {phase === "done" ? (
          <p className="flex items-center gap-2 text-xs leading-5 text-cyan-200">
            <CheckCircle2 className="size-3.5" />
            {stream.actionItems
              ? "Analysis complete — recommendations are ready."
              : "Analysis complete."}
          </p>
        ) : null}

        {error ? <p className="text-sm leading-6 text-rose-300">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
