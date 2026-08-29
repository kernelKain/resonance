"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";

import type { ResonancePhase } from "@/lib/resonance-parse";
import type { ResonanceStreamState } from "@/lib/resonance-parse";
import { cn } from "@/lib/utils";

type Stage = {
  key: string;
  label: string;
  /** Short description shown below the active step label so users understand the wait. */
  hint: string;
};

const STAGES: Stage[] = [
  {
    key: "upload",
    label: "Upload",
    hint: "Your CSV is being transferred and validated.",
  },
  {
    key: "scoring",
    label: "Scoring",
    hint: "Each review is being scored on 8 emotional dimensions (Plutchik's wheel).",
  },
  {
    key: "clustering",
    label: "Clustering",
    hint: "Reviews are being grouped into emotional archetypes using k-means in a sandbox.",
  },
  {
    key: "analyzing",
    label: "Analyzing",
    hint: "The AI is naming archetypes and identifying Hidden Asks from the clusters.",
  },
  {
    key: "approval",
    label: "Approval",
    hint: "Analysis is paused — review the findings and approve to generate recommendations.",
  },
  {
    key: "done",
    label: "Done",
    hint: "Analysis complete — recommendations are ready.",
  },
];

function resolveActiveIndex(stream: ResonanceStreamState, phase: ResonancePhase): number {
  if (phase === "done") return 5;
  if (phase === "awaiting_approval" || stream.approval) return 4;
  if (stream.analysis) return 3;
  if (stream.clustered) return 3;
  if (stream.scored) return 2;
  if (phase === "uploading") return 0;
  if (phase === "running") return 1;
  return -1;
}

export function AnalysisProgress({
  stream,
  phase,
}: {
  stream: ResonanceStreamState;
  phase: ResonancePhase;
}) {
  const activeIndex = resolveActiveIndex(stream, phase);
  if (activeIndex < 0) return null;

  const activeStage = STAGES[activeIndex];
  const liveCount = stream.scored?.total_reviews ?? null;

  return (
    <div className="space-y-5">
      {/* Step track */}
      <div className="flex items-start gap-1">
        {STAGES.map((stage, i) => {
          const isComplete = i < activeIndex;
          const isActive = i === activeIndex;
          const isPending = i > activeIndex;

          return (
            <div key={stage.key} className="flex flex-1 items-start gap-1">
              <div className="flex flex-1 flex-col items-center gap-2">
                {/* Step node */}
                <motion.div
                  className={cn(
                    "relative flex size-9 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                    isComplete && "border-cyan-400 bg-cyan-400/20 text-cyan-300",
                    isActive &&
                      "border-cyan-400 bg-cyan-400/30 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.5)]",
                    isPending && "border-zinc-600 bg-zinc-800/50 text-zinc-500",
                  )}
                  initial={false}
                  animate={isActive ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                  transition={
                    isActive ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : {}
                  }
                >
                  {isComplete ? <Check className="size-4" /> : i + 1}
                </motion.div>

                {/* Label */}
                <span
                  className={cn(
                    "text-center text-[10px] font-medium tracking-wider uppercase",
                    isComplete && "text-cyan-300",
                    isActive && "text-cyan-100",
                    isPending && "text-zinc-500",
                  )}
                >
                  {stage.label}
                </span>
              </div>

              {/* Connector bar — skip after last step */}
              {i < STAGES.length - 1 && (
                <div
                  className={cn(
                    "mt-4 h-0.5 flex-1 rounded-full transition-colors duration-500",
                    i < activeIndex ? "bg-cyan-400/60" : "bg-zinc-700/50",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Contextual hint for the active step */}
      {activeStage && (
        <motion.div
          key={activeStage.key}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex items-start gap-3 rounded-lg border border-cyan-400/15 bg-cyan-400/5 px-4 py-3"
        >
          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-cyan-400" />
          <p className="text-sm leading-6 text-cyan-100/80">{activeStage.hint}</p>
          {liveCount !== null && activeIndex >= 2 && (
            <span className="ml-auto shrink-0 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 font-mono text-[11px] tabular-nums text-cyan-300">
              {liveCount} reviews
            </span>
          )}
        </motion.div>
      )}
    </div>
  );
}
