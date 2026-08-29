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

// ─── Dev-mode structured sections ────────────────────────────────────────────

type DevSection = { label: string; content: string; present: boolean };

/**
 * Splits the raw assistant text into named pipeline sections using the
 * resonance-data fence markers and the stream state produced by the parser.
 * Each section is presented as a collapsible <details> block.
 */
function buildDevSections(assistant: string, stream: ResonanceStreamState): DevSection[] {
  // Extract all resonance-data fence bodies in order of appearance
  const fenceRe = /```resonance-data[^\n]*\r?\n([\s\S]*?)```/g;
  const fences: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(assistant)) !== null) {
    fences.push((match[1] ?? "").trim());
  }

  // Assign fences to pipeline stages by sniffing the "type" field
  function pickFence(type: string): string | null {
    return fences.find((f) => f.includes(`"type":"${type}"`) || f.includes(`"type": "${type}"`)) ?? null;
  }

  const sections: DevSection[] = [
    {
      label: "① Scored Reviews",
      content: pickFence("scored_reviews") ?? (stream.scored ? JSON.stringify(stream.scored, null, 2) : ""),
      present: !!stream.scored,
    },
    {
      label: "② Cluster Results",
      content: pickFence("cluster_results") ?? (stream.clustered ? JSON.stringify(stream.clustered, null, 2) : ""),
      present: !!stream.clustered,
    },
    {
      label: "③ Analysis Result",
      content: pickFence("analysis_result") ?? (stream.analysis ? JSON.stringify(stream.analysis, null, 2) : ""),
      present: !!stream.analysis,
    },
    {
      label: "④ Approval Request",
      content: pickFence("approval_request") ?? (stream.approval ? JSON.stringify(stream.approval, null, 2) : ""),
      present: !!stream.approval,
    },
    {
      label: "⑤ Action Items",
      content: pickFence("action_items") ?? (stream.actionItems ? JSON.stringify(stream.actionItems, null, 2) : ""),
      present: !!stream.actionItems,
    },
  ];

  // Raw remainder — strip all resonance-data fences and show leftover text
  const stripped = assistant.replace(/```resonance-data[\s\S]*?```/g, "").trim();
  if (stripped) {
    sections.push({ label: "⑥ Raw Output", content: stripped, present: true });
  }

  return sections;
}

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

        {/* Dev: structured pipeline sections */}
        {devMode && assistant ? (
          <div className="space-y-2 border-t border-cyan-400/10 pt-4">
            <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase mb-3">
              Pipeline Stages
            </p>
            {buildDevSections(assistant, stream).map((section) => (
              <details
                key={section.label}
                className={cn(
                  "group rounded-lg border text-xs",
                  section.present
                    ? "border-cyan-400/20 bg-cyan-400/5"
                    : "border-border/40 bg-muted/20 opacity-50",
                )}
              >
                <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 font-mono tracking-wide text-cyan-200/80 list-none">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      section.present ? "bg-cyan-400" : "bg-zinc-600",
                    )}
                  />
                  {section.label}
                  {!section.present && (
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">pending</span>
                  )}
                </summary>
                {section.content && (
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words border-t border-cyan-400/10 px-3 py-3 font-mono text-[11px] leading-5 text-slate-300">
                    {section.content}
                  </pre>
                )}
              </details>
            ))}
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
