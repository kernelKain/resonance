"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Radio,
  Sparkles,
  UploadCloud,
} from "lucide-react";

import { AnalysisProgress } from "./analysis-progress";
import { ApprovalModal } from "./approval-modal";
import { CountUp } from "./count-up";
import { InsightPanel } from "./insight-panel";
import { PlutchikMark } from "@/components/plutchik-mark";
import { PlutchikWheel } from "@/components/plutchik-wheel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  emptyResonanceStream,
  extractResonanceStream,
  statusTextFromStream,
  type ResonancePhase,
  type ResonanceStreamState,
} from "@/lib/resonance-parse";
import {
  applyTurnEvent,
  REPLAY_TOOL_CALL_ID,
  replayPendingQuestion,
  type PendingUserQuestion,
  type TurnIngest,
} from "@/lib/trueforge-events";
import { cn } from "@/lib/utils";

type Health = {
  trueforge: boolean;
  filesystemMcp: boolean;
  agent: boolean;
  agentName: string;
};

type TranscriptItem = {
  id: string;
  kind: "user" | "assistant" | "status" | "tool" | "subagent" | "error";
  text: string;
};

const HITL_PAUSE_MARKER = "<!-- HITL_PAUSE -->";

function excavationPrompt(productName: string, basename: string, rowCount: number) {
  return `Follow the Day 5 protocol for product "${productName}". CSV file is ${basename} (${rowCount} reviews). Read it with the filesystem MCP (basename only — never a demo_data/ prefix). Spawn a subagent to research the product with Exa. Score every row. Emit the scored_reviews resonance-data fence. Persist scored_reviews.json. Copy scripts/cluster.py into the TrueForge sandbox and run cluster.py there. Emit cluster_results VERBATIM from cluster.py. Then name one archetype per cluster and write 3–5 Hidden Asks with action_items null. Emit analysis_result. Then emit approval_request and call ask_user_question with options Approved and Decline. Do not emit action_items until the user answers Approved.`;
}

function summarizeEvent(event: Record<string, unknown>): TranscriptItem | null {
  const type = String(event.type ?? "");
  if (type === "turn.created") {
    return { id: crypto.randomUUID(), kind: "status", text: "TrueForge turn started." };
  }
  if (type === "thread.created") {
    const title = String(event.title ?? event.name ?? "subagent");
    return {
      id: crypto.randomUUID(),
      kind: "subagent",
      text: `Subagent spawned: ${title}`,
    };
  }
  if (type === "mcp.initialize") {
    const name = String(event.name ?? event.server ?? "connector");
    return { id: crypto.randomUUID(), kind: "tool", text: `MCP connected: ${name}` };
  }
  if (type === "tool.response") {
    const name = String(event.name ?? event.tool ?? event.toolName ?? "tool");
    return { id: crypto.randomUUID(), kind: "tool", text: `Tool returned: ${name}` };
  }
  if (type === "sandbox.created") {
    return { id: crypto.randomUUID(), kind: "tool", text: "Sandbox provisioned." };
  }
  if (type === "tool.response_required") {
    return {
      id: crypto.randomUUID(),
      kind: "status",
      text: "TrueForge paused on ask_user_question — waiting for Approved or Decline.",
    };
  }
  if (type === "tool.approval_required") {
    return {
      id: crypto.randomUUID(),
      kind: "status",
      text: "Human approval required — the harness paused before a sensitive action.",
    };
  }
  if (type === "turn.done") {
    const state = event.state as { status?: string } | undefined;
    return {
      id: crypto.randomUUID(),
      kind: "status",
      text: `Turn ${state?.status ?? "done"}.`,
    };
  }
  return null;
}

function deltaText(event: Record<string, unknown>): string {
  if (event.type !== "model.message.delta") return "";
  const threadId = String(event.thread_id ?? event.threadId ?? "main");
  if (threadId && threadId !== "main") return "";
  const content = event.content;
  if (typeof content === "string") return content;
  return "";
}

async function readSse(
  response: Response,
  onEvent: (event: Record<string, unknown>) => void,
) {
  if (!response.body) throw new Error("TrueForge returned an empty stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const data = chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data || data === "[DONE]") continue;
      try {
        onEvent(JSON.parse(data) as Record<string, unknown>);
      } catch {
        // Ignore malformed keep-alives.
      }
    }
  }
}

function HealthDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span
        className={cn(
          "size-1.5 rounded-full",
          ok ? "bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.95)]" : "bg-zinc-600",
        )}
      />
      <span className={ok ? "text-cyan-100" : undefined}>{label}</span>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function ResonanceApp() {
  const [productName, setProductName] = useState("Linear");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<ResonancePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [assistant, setAssistant] = useState("");
  const [stream, setStream] = useState<ResonanceStreamState>(emptyResonanceStream);
  const [uploadMeta, setUploadMeta] = useState<{
    filePath: string;
    rowCount: number;
  } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<PendingUserQuestion | null>(null);
  const [replayTail, setReplayTail] = useState<string>("");
  const [decisionBusy, setDecisionBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const assistantRef = useRef("");
  const replayCancelRef = useRef(false);

  const canRun = Boolean(productName.trim() && file);
  const showWorkbench =
    phase === "running" ||
    phase === "awaiting_approval" ||
    phase === "done" ||
    (phase === "error" && Boolean(uploadMeta || assistant));

  function resetStream() {
    assistantRef.current = "";
    setAssistant("");
    setStream(emptyResonanceStream());
    setTranscript([]);
    setPendingQuestion(null);
    setReplayTail("");
    setSessionId(null);
    setDecisionBusy(false);
  }

  function ingestAssistantChunk(piece: string) {
    if (!piece) return;
    assistantRef.current += piece;
    setAssistant(assistantRef.current);
    setStream(extractResonanceStream(assistantRef.current));
  }

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const json = (await response.json()) as Health;
        if (!cancelled) setHealth(json);
      } catch {
        if (!cancelled) {
          setHealth({
            trueforge: false,
            filesystemMcp: false,
            agent: false,
            agentName: "resonance",
          });
        }
      }
    }

    const timer = window.setInterval(() => {
      void tick();
    }, 5000);
    const immediate = window.setTimeout(() => {
      void tick();
    }, 0);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(immediate);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, assistant]);

  const harnessReady = Boolean(health?.trueforge && health?.filesystemMcp && health?.agent);

  const statusLine = useMemo(
    () => statusTextFromStream(stream, phase, error),
    [stream, phase, error],
  );

  async function loadSample() {
    const response = await fetch("/demo/sample_reviews.csv");
    const blob = await response.blob();
    setFile(new File([blob], "sample_reviews.csv", { type: "text/csv" }));
    setProductName("Linear");
  }

  async function loadScoringFixture() {
    const response = await fetch("/demo/scoring_fixture.csv");
    const blob = await response.blob();
    setFile(new File([blob], "scoring_fixture.csv", { type: "text/csv" }));
    setProductName("Linear");
  }

  async function replayFixture() {
    replayCancelRef.current = false;
    setError(null);
    resetStream();
    setUploadMeta({ filePath: "public/demo/stream_fixture.txt", rowCount: 3 });
    setPhase("running");
    setTranscript([
      {
        id: crypto.randomUUID(),
        kind: "status",
        text: "Replaying a recorded analysis stream.",
      },
    ]);

    try {
      const response = await fetch("/demo/stream_fixture.txt", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load stream_fixture.txt");
      const text = await response.text();
      const size = 28;
      for (let i = 0; i < text.length; i += size) {
        if (replayCancelRef.current) return;
        ingestAssistantChunk(text.slice(i, i + size));
        await sleep(12);
      }
      setPhase("done");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Replay failed.";
      setError(message);
      setPhase("error");
    }
  }

  async function replayHitlFixture() {
    replayCancelRef.current = false;
    setError(null);
    resetStream();
    setUploadMeta({ filePath: "public/demo/day5_stream_fixture.txt", rowCount: 3 });
    setPhase("running");
    setTranscript([
      {
        id: crypto.randomUUID(),
        kind: "status",
        text: "Replaying a recorded analysis with approval checkpoint.",
      },
    ]);

    try {
      const response = await fetch("/demo/day5_stream_fixture.txt", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load day5_stream_fixture.txt");
      const text = await response.text();
      const markerAt = text.indexOf(HITL_PAUSE_MARKER);
      if (markerAt < 0) throw new Error("HITL fixture is missing <!-- HITL_PAUSE -->");
      const before = text.slice(0, markerAt);
      const after = text.slice(markerAt + HITL_PAUSE_MARKER.length);
      const size = 28;
      for (let i = 0; i < before.length; i += size) {
        if (replayCancelRef.current) return;
        ingestAssistantChunk(before.slice(i, i + size));
        await sleep(12);
      }
      const parsed = extractResonanceStream(assistantRef.current);
      setReplayTail(after);
      setPendingQuestion(
        replayPendingQuestion(
          parsed.approval?.message ??
            "I found 3 Hidden Asks. Approve to generate product-roadmap recommendations.",
        ),
      );
      setTranscript((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          kind: "status",
          text: "Analysis paused. Approve to continue with recommendations.",
        },
      ]);
      setPhase("awaiting_approval");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "HITL replay failed.";
      setError(message);
      setPhase("error");
    }
  }

  async function openSession(): Promise<string> {
    const sessionRes = await fetch("/api/session", { method: "POST" });
    const sessionJson = (await sessionRes.json()) as {
      sessionId?: string;
      error?: string;
    };
    if (!sessionRes.ok || !sessionJson.sessionId) {
      throw new Error(sessionJson.error ?? "Could not open a TrueForge session.");
    }
    setSessionId(sessionJson.sessionId);
    return sessionJson.sessionId;
  }

  async function streamTurn(nextSessionId: string, body: Record<string, unknown>) {
    const turnRes = await fetch("/api/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: nextSessionId, ...body }),
    });

    if (!turnRes.ok) {
      const failed = (await turnRes.json()) as { error?: string };
      throw new Error(failed.error ?? "TrueForge turn failed.");
    }

    const messages = new Map<string, Record<string, unknown>>();
    let ingest: TurnIngest = { pending: pendingQuestion, paused: false };

    await readSse(turnRes, (event) => {
      ingest = applyTurnEvent(event, messages, ingest);
      const piece = deltaText(event);
      if (piece) {
        ingestAssistantChunk(piece);
        return;
      }
      const item = summarizeEvent(event);
      if (item) {
        setTranscript((current) => [...current, item]);
      }
    });

    const parsed = extractResonanceStream(assistantRef.current);
    if (ingest.paused) {
      setPendingQuestion(
        ingest.pending ??
          (parsed.approval
            ? replayPendingQuestion(parsed.approval.message)
            : pendingQuestion),
      );
      setPhase("awaiting_approval");
      return;
    }

    setPendingQuestion(null);
    setPhase("done");
  }

  async function runExcavation() {
    if (!file) return;
    replayCancelRef.current = true;
    setError(null);
    resetStream();
    setPhase("uploading");

    try {
      const form = new FormData();
      form.set("file", file);
      const uploaded = await fetch("/api/upload", { method: "POST", body: form });
      const uploadJson = (await uploaded.json()) as {
        success?: boolean;
        error?: string;
        filePath?: string;
        filename?: string;
        rowCount?: number;
      };
      if (!uploaded.ok || !uploadJson.success || !uploadJson.filePath) {
        throw new Error(uploadJson.error ?? "Upload failed.");
      }

      setUploadMeta({
        filePath: uploadJson.filePath,
        rowCount: uploadJson.rowCount ?? 0,
      });

      const nextSessionId = await openSession();
      const basename =
        uploadJson.filename ?? uploadJson.filePath.split("/").pop() ?? file.name;
      const message = excavationPrompt(productName.trim(), basename, uploadJson.rowCount ?? 0);

      setTranscript([
        {
          id: crypto.randomUUID(),
          kind: "user",
          text: message,
        },
      ]);
      setPhase("running");
      await streamTurn(nextSessionId, { message });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Run failed.";
      setError(message);
      setPhase("error");
    }
  }

  async function runHitlSmoke() {
    replayCancelRef.current = true;
    setError(null);
    resetStream();
    setUploadMeta({ filePath: "HITL_SMOKE", rowCount: 0 });
    setProductName("Linear");

    try {
      const nextSessionId = await openSession();
      const message = "HITL_SMOKE. Pause for approval. Do not read a CSV.";
      setTranscript([
        {
          id: crypto.randomUUID(),
          kind: "user",
          text: message,
        },
      ]);
      setPhase("running");
      await streamTurn(nextSessionId, { message });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "HITL smoke failed.";
      setError(message);
      setPhase("error");
    }
  }

  async function decide(content: "Approved" | "Decline") {
    if (!pendingQuestion?.toolCallId || decisionBusy) return;
    setDecisionBusy(true);
    setError(null);

    try {
      setTranscript((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          kind: "user",
          text: content,
        },
      ]);

      if (pendingQuestion.toolCallId === REPLAY_TOOL_CALL_ID) {
        if (content === "Approved") {
          const tail = replayTail;
          const size = 28;
          for (let i = 0; i < tail.length; i += size) {
            ingestAssistantChunk(tail.slice(i, i + size));
            await sleep(12);
          }
        }
        setPendingQuestion(null);
        setReplayTail("");
        setPhase("done");
        return;
      }

      if (!sessionId) {
        throw new Error("TrueForge session was lost. Start a new run.");
      }

      setPhase("running");
      await streamTurn(sessionId, {
        toolResponse: {
          threadId: pendingQuestion.threadId,
          toolCallId: pendingQuestion.toolCallId,
          content,
        },
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not resume the turn.";
      setError(message);
      setPhase("error");
    } finally {
      setDecisionBusy(false);
    }
  }

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
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <HealthDot ok={Boolean(health?.trueforge)} label="Analysis Engine" />
            <HealthDot ok={Boolean(health?.filesystemMcp)} label="File System" />
            <HealthDot ok={Boolean(health?.agent)} label="Agent" />
            <Badge className="font-mono text-[11px] tracking-wide uppercase">v0.1</Badge>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="min-w-0">
          <AnimatePresence mode="wait">
          {!showWorkbench ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
            <Card className="noise-texture glass-surface mx-auto max-w-xl border-cyan-400/20 bg-card/85 shadow-[0_0_90px_rgba(8,145,178,0.12)] ring-1 ring-white/[0.04] ring-inset">
              <CardHeader className="gap-3 px-6 pt-6">
                <CardTitle className="text-3xl tracking-tight">
                  Analyze Customer Reviews
                </CardTitle>
                <CardDescription className="text-[0.95rem] leading-7">
                  Go beyond simple sentiment. Resonance uncovers the emotional subtext, hidden
                  needs, and conflicting feelings in your customer reviews.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 px-6 pb-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="product">
                    Product / brand
                  </label>
                  <Input
                    id="product"
                    value={productName}
                    onChange={(event) => setProductName(event.target.value)}
                    placeholder="Linear"
                    className="h-11 bg-background/60 text-base"
                  />
                </div>

                <motion.div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOver(false);
                    const dropped = event.dataTransfer.files[0];
                    if (dropped) setFile(dropped);
                  }}
                  animate={dragOver ? { scale: 1.02 } : { scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className={cn(
                    "rounded-xl border-2 border-dashed px-4 py-12 text-center transition-all duration-300",
                    dragOver
                      ? "border-cyan-300 bg-cyan-400/10 shadow-[inset_0_0_40px_rgba(34,211,238,0.12),0_0_30px_rgba(34,211,238,0.1)]"
                      : file
                        ? "border-cyan-400/40 bg-cyan-400/5"
                        : "border-cyan-400/25 bg-background/40 hover:border-cyan-400/40 hover:bg-background/60",
                  )}
                >
                  {file ? (
                    <CheckCircle2 className="mx-auto mb-3 size-8 text-cyan-300" />
                  ) : (
                    <UploadCloud className="mx-auto mb-3 size-8 text-cyan-300" />
                  )}
                  <p className="text-sm font-medium">{file ? "File selected" : "Drop a CSV or click to select"}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Required column: <code className="font-mono text-cyan-200">review_text</code>.
                    Optional: rating, date, author.
                  </p>
                  <input
                    className="mt-5 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-cyan-400 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-950"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                  {file ? (
                    <p className="mt-4 flex items-center justify-center gap-2 text-xs text-cyan-100">
                      <FileSpreadsheet className="size-3.5" />
                      {file.name}
                    </p>
                  ) : null}
                </motion.div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    size="lg"
                    className="flex-1"
                    disabled={!canRun || phase === "uploading"}
                    onClick={() => void runExcavation()}
                  >
                    {phase === "uploading" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    Run Analysis
                  </Button>
                  <Button size="lg" variant="outline" className="flex-1" onClick={() => void loadSample()}>
                    Try Sample Data
                  </Button>
                </div>

                <details className="group">
                  <summary className="cursor-pointer font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase transition-colors hover:text-cyan-200">
                    Developer Tools
                  </summary>
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button size="lg" variant="outline" className="flex-1" onClick={() => void loadScoringFixture()}>
                        Use scoring fixture
                      </Button>
                      <Button size="lg" variant="outline" className="flex-1" onClick={() => void replayFixture()}>
                        Replay parsed fixture
                      </Button>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button size="lg" variant="outline" className="flex-1" onClick={() => void replayHitlFixture()}>
                        Replay HITL fixture
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="flex-1"
                        disabled={!harnessReady}
                        onClick={() => void runHitlSmoke()}
                      >
                        HITL smoke (live)
                      </Button>
                    </div>
                  </div>
                </details>

                {!harnessReady ? (
                  <p className="rounded-lg border border-amber-400/25 bg-amber-400/8 px-3.5 py-3 text-xs leading-5 text-amber-100">
                    Analysis engine is not connected. Fixture replays still work. To run live
                    analysis, ensure all services are running and execute{" "}
                    <code className="font-mono text-cyan-200">npm run bootstrap</code>.
                  </p>
                ) : null}

                {error ? (
                  <p className="flex items-start gap-2 text-sm leading-6 text-rose-300">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    {error}
                  </p>
                ) : null}
              </CardContent>
            </Card>
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
                  value={stream.analysis ? String(stream.analysis.archetypes.length) : "—"}
                />
                <Metric
                  label="Unspoken Needs"
                  value={stream.analysis ? String(stream.analysis.hidden_asks.length) : "—"}
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
                  {assistant ? (
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
            </div>
            </motion.div>
          )}
          </AnimatePresence>
        </section>

        <aside className="min-h-[28rem]">
          <Card className="noise-texture glass-surface flex h-full flex-col border-cyan-400/15 bg-card/85 ring-1 ring-white/[0.04] ring-inset">
            <CardHeader className="border-b border-cyan-400/10">
              <CardTitle className="text-lg tracking-tight">Activity Log</CardTitle>
              <CardDescription className="leading-6">
                Live analysis activity — tool calls, approvals, and processing steps.
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 p-0">
              <ScrollArea className="h-[32rem] px-4 py-4">
                <div className="space-y-3">
                  {transcript.length === 0 && !assistant ? (
                    <p className="text-sm leading-6 text-muted-foreground">
                      Waiting for analysis to begin.
                    </p>
                  ) : null}
                  {transcript.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "rounded-lg px-3 py-2.5 text-xs leading-5",
                        item.kind === "user" && "bg-cyan-400/10 text-cyan-50",
                        item.kind === "status" && "bg-muted/50 text-muted-foreground",
                        item.kind === "tool" && "bg-orange-400/12 text-orange-100",
                        item.kind === "subagent" && "bg-violet-400/10 text-violet-100",
                        item.kind === "error" && "bg-rose-400/10 text-rose-100",
                      )}
                    >
                      <p className="mb-1 font-mono text-[11px] tracking-wide uppercase opacity-70">
                        {item.kind}
                      </p>
                      <p className="whitespace-pre-wrap">{item.text}</p>
                    </div>
                  ))}
                  {assistant ? (
                    <div className="rounded-lg bg-foreground/5 px-3 py-2.5 text-xs leading-5">
                      <p className="mb-1 font-mono text-[11px] tracking-wide text-cyan-300 uppercase">
                        assistant
                      </p>
                      <p className="whitespace-pre-wrap text-foreground/90">
                        {assistant.slice(-1200)}
                      </p>
                    </div>
                  ) : null}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </aside>
      </main>

      <ApprovalModal
        open={phase === "awaiting_approval"}
        message={
          pendingQuestion?.question ??
          stream.approval?.message ??
          "Approve generation of product-roadmap recommendations."
        }
        hiddenAskCount={
          stream.approval?.hidden_ask_count ?? stream.analysis?.hidden_asks.length ?? 0
        }
        hiddenAskTitles={stream.analysis?.hidden_asks.map((ask) => ask.title) ?? []}
        ready={Boolean(pendingQuestion?.toolCallId)}
        busy={decisionBusy}
        onApprove={() => void decide("Approved")}
        onDecline={() => void decide("Decline")}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card/70 px-4 py-3.5",
        accent
          ? "border-orange-400/30 shadow-[0_0_24px_rgba(251,146,60,0.12)]"
          : "border-cyan-400/15",
      )}
    >
      <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 truncate font-mono text-sm tabular-nums",
          accent ? "text-orange-100" : "text-cyan-100",
        )}
      >
        {Number.isNaN(Number(value)) || value === "—" ? value : <CountUp value={Number(value)} />}
      </p>
    </div>
  );
}