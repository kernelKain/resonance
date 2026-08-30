"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Moon, Sun, Terminal } from "lucide-react";

import { ApprovalModal } from "./approval-modal";
import { InsightPanel } from "./insight-panel";
import { PlutchikMark } from "@/components/plutchik-mark";
import { PlutchikWheel } from "@/components/plutchik-wheel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { useResonanceState } from "@/hooks/use-resonance-state";
import { useHealthPolling } from "@/hooks/use-health-polling";
import { useTheme } from "@/components/theme-provider";

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
  const { theme, toggleTheme } = useTheme();

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

  const state = useResonanceState();
  const {
    productName,
    setProductName,
    productIdentity,
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
    modelProvider,
    loadSample,
    loadScoringFixture,
    replayFixture,
    replayHitlFixture,
    runExcavation,
    runHitlSmoke,
    decide,
    resetRun,
  } = state;

  const canRun = Boolean(productName.trim() && file);
  const showWorkbench =
    phase === "running" ||
    phase === "awaiting_approval" ||
    phase === "done" ||
    (phase === "error" && Boolean(uploadMeta || assistant));

  const health = useHealthPolling(15_000, devMode || !showWorkbench);
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
    <div className="relative min-h-screen overflow-x-hidden bg-background">
      <div
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-500",
          theme === "light" ? "opacity-40" : "opacity-100",
          "bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_46%),radial-gradient(circle_at_88%_12%,rgba(251,146,60,0.14),transparent_32%)]",
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-500",
          theme === "light" ? "opacity-10" : "opacity-30",
          "[background-image:linear-gradient(rgba(34,211,238,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.07)_1px,transparent_1px)] [background-size:52px_52px]",
        )}
      />

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

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="flex items-center justify-center rounded-md border border-border/50 p-1.5 text-muted-foreground transition-all duration-150 hover:border-cyan-400/30 hover:text-cyan-300"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </button>

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
          <AnimatePresence initial={false}>
          {!showWorkbench ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
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
                <div className="flex min-w-0 items-center gap-3">
                  {productIdentity?.logoUrl ? (
                    // Product favicons are discovered from user-supplied public URLs.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={productIdentity.logoUrl}
                      alt=""
                      className="size-11 shrink-0 rounded-xl border border-border bg-card object-contain p-1.5"
                      referrerPolicy="no-referrer"
                    />
                  ) : null}
                  <div className="min-w-0">
                  <p className="font-mono text-[11px] tracking-[0.24em] text-cyan-300 uppercase">
                    Live Analysis
                  </p>
                  <h2 className="heading-gradient mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                    {productIdentity?.name || productName.trim() || "Analysis"}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground" aria-live="polite">
                    {statusLine}
                  </p>
                  {modelProvider ? (
                    <Badge variant="outline" className="mt-2 font-mono text-[10px] uppercase">
                      {modelProvider === "minimax" ? "MiniMax M3" : "DeepSeek V4 Flash"}
                    </Badge>
                  ) : null}
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={resetRun}
                >
                  New run
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  className="metric-card"
                  style={{ "--card-index": 0 } as React.CSSProperties}
                  label="Total Reviews"
                  value={uploadMeta ? String(uploadMeta.rowCount) : "—"}
                />
                <Metric
                  className="metric-card"
                  style={{ "--card-index": 1 } as React.CSSProperties}
                  label="Reviews Analyzed"
                  value={stream.scored ? String(stream.scored.total_reviews) : "—"}
                />
                <Metric
                  className="metric-card"
                  style={{ "--card-index": 2 } as React.CSSProperties}
                  label="Customer Segments"
                  value={stream.clustered ? String(stream.clustered.num_clusters) : "—"}
                />
                <Metric
                  className="metric-card"
                  style={{ "--card-index": 3 } as React.CSSProperties}
                  label="Current Stage"
                  value={parsedLabel}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Metric
                  className="metric-card"
                  style={{ "--card-index": 4 } as React.CSSProperties}
                  label="Segments"
                  value={stream.analysis ? String(stream.analysis.archetypes?.length ?? 0) : "—"}
                />
                <Metric
                  className="metric-card"
                  style={{ "--card-index": 5 } as React.CSSProperties}
                  label="Unspoken Needs"
                  value={stream.analysis ? String(stream.analysis.hidden_asks?.length ?? 0) : "—"}
                />
                <Metric
                  className="metric-card"
                  style={{ "--card-index": 6 } as React.CSSProperties}
                  label="Recommendations"
                  value={stream.actionItems ? String(stream.actionItems.items.length) : "paused"}
                  accent={Boolean(stream.actionItems)}
                />
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <PlutchikWheel stream={stream} />
                <InsightPanel stream={stream} />
              </div>

              <AgentOutput
                stream={stream}
                phase={phase}
                assistant={assistant}
                error={error}
                devMode={devMode}
                transcript={transcript}
              />
              {phase === "done" ? (
                <ResultsSummary
                  stream={stream}
                  productName={productIdentity?.name || productName}
                  productIdentity={productIdentity}
                  modelProvider={modelProvider}
                />
              ) : null}
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