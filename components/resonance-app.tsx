"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Terminal } from "lucide-react";

import { ApprovalModal } from "./approval-modal";
import { InsightPanel } from "./insight-panel";
import { PlutchikMark } from "@/components/plutchik-mark";
import { PlutchikWheel } from "@/components/plutchik-wheel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { useResonanceState } from "@/hooks/use-resonance-state";
import { useHealthPolling } from "@/hooks/use-health-polling";

import { UploadCard } from "./upload-card";
import { TranscriptSidebar } from "./transcript-sidebar";
import { AgentOutput } from "./agent-output";
import { ResultsSummary } from "./results-summary";
import { HealthDot } from "./health-status";
import { Metric } from "./metric-card";
import { statusTextFromStream } from "@/lib/resonance-parse";
import { cn } from "@/lib/utils";

export function ResonanceApp() {
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setDevMode((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const health = useHealthPolling(5000);

  const state = useResonanceState();
  const {
    productName,
    setProductName,
    file,
    setFile,
    phase,
    error,
    transcript,
    assistant,
    stream,
    uploadMeta,
    pendingQuestion,
    decisionBusy,
    replayCancelRef,
    loadSample,
    loadScoringFixture,
    replayFixture,
    replayHitlFixture,
    runExcavation,
    runHitlSmoke,
    decide,
  } = state;

  const canRun = Boolean(productName.trim() && file);
  const showWorkbench =
    phase === "running" ||
    phase === "awaiting_approval" ||
    phase === "done" ||
    (phase === "error" && Boolean(uploadMeta || assistant));

  const harnessReady = Boolean(health?.trueforge && health?.filesystemMcp && health?.agent);

  const statusLine = useMemo(
    () => statusTextFromStream(stream, phase, error),
    [stream, phase, error],
  );

  const parsedLabel = stream.actionItems
    ? "Complete"
    : stream.approval
      ? "Awaiting Approval"
      : stream.analysis
        ? "Analyzing"
        : stream.clustered
          ? "Clustering"
          : stream.scored
            ? "Scoring"
            : "Starting…";

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_46%),radial-gradient(circle_at_88%_12%,rgba(251,146,60,0.14),transparent_32%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(34,211,238,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.07)_1px,transparent_1px)] [background-size:52px_52px]" />

      <header className="relative z-10 border-b border-cyan-400/15 bg-background/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3.5">
            <PlutchikMark className="size-11 drop-shadow-[0_0_16px_rgba(34,211,238,0.45)]" />
            <div>
              <p className="font-mono text-[11px] tracking-[0.32em] text-cyan-300 uppercase">
                Resonance
              </p>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Customer Emotion Archaeology
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {devMode && (
              <>
                <HealthDot ok={Boolean(health?.trueforge)} label="Analysis Engine" />
                <HealthDot ok={Boolean(health?.filesystemMcp)} label="File System" />
                <HealthDot ok={Boolean(health?.agent)} label="Agent" />
              </>
            )}
            <Badge className="font-mono text-[11px] tracking-wide uppercase">v0.1</Badge>
            <button
              onClick={() => setDevMode((prev) => !prev)}
              title="Toggle developer mode (Ctrl+D)"
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[10px] tracking-wider uppercase transition-all duration-150",
                devMode
                  ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.2)]"
                  : "border-border/50 text-muted-foreground hover:border-cyan-400/30 hover:text-cyan-300"
              )}
            >
              <Terminal className="size-3" />
              Dev
            </button>
          </div>
        </div>
      </header>

      <main
        className={cn(
          "relative z-10 mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 sm:py-10",
          devMode ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : "lg:grid-cols-1"
        )}
      >
        <section className="min-w-0" id="main-content">
          <AnimatePresence mode="wait">
          {!showWorkbench ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              <UploadCard
                productName={productName}
                setProductName={setProductName}
                file={file}
                setFile={setFile}
                phase={phase}
                error={error}
                harnessReady={harnessReady}
                devMode={devMode}
                canRun={canRun}
                onRunExcavation={runExcavation}
                onLoadSample={loadSample}
                onLoadScoringFixture={loadScoringFixture}
                onReplayFixture={replayFixture}
                onReplayHitlFixture={replayHitlFixture}
                onRunHitlSmoke={runHitlSmoke}
              />
            </motion.div>
          ) : (
            <motion.div
              key="workbench"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
            <div className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] tracking-[0.24em] text-cyan-300 uppercase">
                    Live analysis
                  </p>
                  <h2 className="heading-gradient mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                    {productName}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {statusLine}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    replayCancelRef.current = true;
                    window.location.reload();
                  }}
                >
                  New run
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Total Reviews" value={uploadMeta ? String(uploadMeta.rowCount) : "—"} />
                <Metric
                  label="Reviews Analyzed"
                  value={stream.scored ? String(stream.scored.total_reviews) : "—"}
                />
                <Metric
                  label="Customer Segments"
                  value={stream.clustered ? String(stream.clustered.num_clusters) : "—"}
                />
                <Metric label="Current Stage" value={parsedLabel} />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Metric
                  label="Segments"
                  value={stream.analysis ? String(stream.analysis.archetypes?.length ?? 0) : "—"}
                />
                <Metric
                  label="Unspoken Needs"
                  value={stream.analysis ? String(stream.analysis.hidden_asks?.length ?? 0) : "—"}
                />
                <Metric
                  label="Recommendations"
                  value={stream.actionItems ? String(stream.actionItems.items.length) : "paused"}
                  accent={Boolean(stream.actionItems)}
                />
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <PlutchikWheel stream={stream} />
                <InsightPanel stream={stream} />
              </div>

              {phase === "done" && !devMode ? (
                <ResultsSummary stream={stream} productName={productName} />
              ) : (
                <AgentOutput
                  stream={stream}
                  phase={phase}
                  assistant={assistant}
                  error={error}
                  devMode={devMode}
                  transcript={transcript}
                />
              )}
            </div>
            </motion.div>
          )}
          </AnimatePresence>
        </section>

        {devMode && (
          <TranscriptSidebar transcript={transcript} assistant={assistant} />
        )}
      </main>

      <ApprovalModal
        open={phase === "awaiting_approval"}
        message={
          pendingQuestion?.question ??
          stream.approval?.message ??
          "Approve generation of product-roadmap recommendations."
        }
        hiddenAskCount={
          stream.approval?.hidden_ask_count ?? stream.analysis?.hidden_asks?.length ?? 0
        }
        hiddenAskTitles={stream.analysis?.hidden_asks?.map((ask) => ask.title) ?? []}
        ready={Boolean(pendingQuestion?.toolCallId)}
        busy={decisionBusy}
        onApprove={() => void decide("Approved")}
        onDecline={() => void decide("Decline")}
      />
    </div>
  );
}