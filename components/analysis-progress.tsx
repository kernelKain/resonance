"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";

import type { ResonancePhase } from "@/lib/resonance-parse";
import type { ResonanceStreamState } from "@/lib/resonance-parse";
import { cn } from "@/lib/utils";

type Stage = {
  key: string;
  label: string;
};

const STAGES: Stage[] = [
  { key: "upload", label: "Upload" },
  { key: "scoring", label: "Scoring" },
  { key: "clustering", label: "Clustering" },
  { key: "analyzing", label: "Analyzing" },
  { key: "approval", label: "Approval" },
  { key: "done", label: "Done" },
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

  return (
    <div className="flex items-center gap-1">
      {STAGES.map((stage, i) => {
        const isComplete = i < activeIndex;
        const isActive = i === activeIndex;
        const isPending = i > activeIndex;

        return (
          <div key={stage.key} className="flex items-center gap-1 flex-1">
            <div className="flex flex-col items-center gap-1.5 flex-1">
              <motion.div
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                  isComplete && "border-cyan-400 bg-cyan-400/20 text-cyan-300",
                  isActive && "border-cyan-400 bg-cyan-400/30 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.4)]",
                  isPending && "border-zinc-600 bg-zinc-800/50 text-zinc-500",
                )}
                initial={false}
                animate={isActive ? { scale: [1, 1.1, 1] } : { scale: 1 }}
                transition={isActive ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : {}}
              >
                {isComplete ? <Check className="size-3.5" /> : i + 1}
              </motion.div>
              <span
                className={cn(
                  "text-[10px] font-medium tracking-wider uppercase",
                  isComplete && "text-cyan-300",
                  isActive && "text-cyan-100",
                  isPending && "text-zinc-500",
                )}
              >
                {stage.label}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <div
                className={cn(
                  "h-0.5 flex-1 rounded-full transition-colors",
                  i < activeIndex ? "bg-cyan-400/50" : "bg-zinc-700/50",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
