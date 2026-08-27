"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Radio,
  Sparkles,
  UploadCloud,
} from "lucide-react";

import { PlutchikMark } from "@/components/plutchik-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  emptyResonanceStream,
  extractResonanceStream,
  statusTextFromStream,
  type ResonanceStreamState,
} from "@/lib/resonance-parse";
import { cn } from "@/lib/utils";

type Health = {
  trueforge: boolean;
  filesystemMcp: boolean;
  agent: boolean;
  agentName: string;
};

type Phase = "idle" | "uploading" | "running" | "done" | "error";

type TranscriptItem = {
  id: string;
  kind: "user" | "assistant" | "status" | "tool" | "subagent" | "error";
  text: string;
};

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
  if (event.threadId && event.threadId !== "main") return "";
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
          ok ? "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]" : "bg-zinc-600",
        )}
      />
      <span className={ok ? "text-foreground" : undefined}>{label}</span>
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
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [assistant, setAssistant] = useState("");
  const [stream, setStream] = useState<ResonanceStreamState>(emptyResonanceStream);
  const [uploadMeta, setUploadMeta] = useState<{
    filePath: string;
    rowCount: number;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const assistantRef = useRef("");
  const replayCancelRef = useRef(false);

  const canRun = Boolean(productName.trim() && file);

  function resetStream() {
    assistantRef.current = "";
    setAssistant("");
    setStream(emptyResonanceStream());
    setTranscript([]);
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
        text: "Replaying a recorded TrueForge stream. No model call.",
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

      const sessionRes = await fetch("/api/session", { method: "POST" });
      const sessionJson = (await sessionRes.json()) as {
        sessionId?: string;
        error?: string;
      };
      if (!sessionRes.ok || !sessionJson.sessionId) {
        throw new Error(sessionJson.error ?? "Could not open a TrueForge session.");
      }

      const basename =
        uploadJson.filename ?? uploadJson.filePath.split("/").pop() ?? file.name;
      const message = `Follow the Day 3 protocol through archetypes and Hidden Asks for product "${productName.trim()}". CSV file is ${basename} (${uploadJson.rowCount} reviews). Read it with the filesystem MCP (basename only — never a demo_data/ prefix). Spawn a subagent to research the product with Exa. Score every row. Emit the scored_reviews resonance-data fence. Persist scored_reviews.json. Copy scripts/cluster.py into the TrueForge sandbox and run cluster.py there. Emit cluster_results VERBATIM from cluster.py. Then name one archetype per cluster and write 3–5 Hidden Asks with action_items null. Emit analysis_result. Then STOP. No product-roadmap recommendations. No approval_request. No action_items fence.`;

      setTranscript([
        {
          id: crypto.randomUUID(),
          kind: "user",
          text: message,
        },
      ]);
      setPhase("running");

      const turnRes = await fetch("/api/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionJson.sessionId,
          message,
        }),
      });

      if (!turnRes.ok) {
        const failed = (await turnRes.json()) as { error?: string };
        throw new Error(failed.error ?? "TrueForge turn failed.");
      }

      await readSse(turnRes, (event) => {
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

      setPhase("done");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Run failed.";
      setError(message);
      setPhase("error");
    }
  }

  const parsedLabel = stream.analysis
    ? "analysis_result"
    : stream.clustered
      ? "cluster_results"
      : stream.scored
        ? "scored_reviews"
        : "none yet";

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_42%),radial-gradient(circle_at_80%_20%,rgba(251,146,60,0.08),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] [background-size:48px_48px]" />

      <header className="relative z-10 border-b border-cyan-400/10 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <PlutchikMark className="size-10" />
            <div>
              <p className="font-mono text-[11px] tracking-[0.28em] text-cyan-300/80 uppercase">
                Resonance
              </p>
              <h1 className="text-lg font-semibold tracking-tight">
                Customer Emotion Archaeology
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <HealthDot ok={Boolean(health?.trueforge)} label="TrueForge :8790" />
            <HealthDot ok={Boolean(health?.filesystemMcp)} label="Filesystem MCP" />
            <HealthDot ok={Boolean(health?.agent)} label="Agent: resonance" />
            <Badge variant="secondary" className="font-mono text-[10px] tracking-wide uppercase">
              Day 4 parser
            </Badge>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          {phase === "idle" || phase === "uploading" || (phase === "error" && !uploadMeta) ? (
            <Card className="mx-auto max-w-xl border-cyan-400/15 bg-card/80 shadow-[0_0_80px_rgba(8,145,178,0.08)]">
              <CardHeader>
                <CardTitle className="text-2xl tracking-tight">
                  Run a psychological excavation
                </CardTitle>
                <CardDescription>
                  Standard sentiment tools flatten reviews into three buckets. Resonance reads
                  the file through TrueForge MCP, then a subagent researches the product on the
                  live web.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="product">
                    Product / brand
                  </label>
                  <Input
                    id="product"
                    value={productName}
                    onChange={(event) => setProductName(event.target.value)}
                    placeholder="Linear"
                    className="h-10 bg-background/60"
                  />
                </div>

                <div
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
                  className={cn(
                    "rounded-xl border border-dashed px-4 py-10 text-center transition-colors",
                    dragOver
                      ? "border-cyan-300 bg-cyan-400/10"
                      : "border-border bg-background/40",
                  )}
                >
                  <UploadCloud className="mx-auto mb-3 size-8 text-cyan-300" />
                  <p className="text-sm font-medium">Drop a CSV or click to select</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Required column: <code className="font-mono">review_text</code>. Optional:
                    rating, date, author.
                  </p>
                  <input
                    className="mt-4 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-cyan-400 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-950"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                  {file ? (
                    <p className="mt-3 flex items-center justify-center gap-2 text-xs text-cyan-100">
                      <FileSpreadsheet className="size-3.5" />
                      {file.name}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    size="lg"
                    className="flex-1 bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                    disabled={!canRun || phase === "uploading"}
                    onClick={() => void runExcavation()}
                  >
                    {phase === "uploading" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    Run Psychological Excavation
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => void loadScoringFixture()}>
                    Use scoring fixture
                  </Button>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button size="lg" variant="outline" className="flex-1" onClick={() => void loadSample()}>
                    Use 18-row sample CSV
                  </Button>
                  <Button size="lg" variant="outline" className="flex-1" onClick={() => void replayFixture()}>
                    Replay parsed fixture
                  </Button>
                </div>

                {!harnessReady ? (
                  <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-100">
                    Harness is not fully up. Replay parsed fixture works without it. For a live
                    run, start TrueForge on :8790, the filesystem MCP, then run{" "}
                    <code className="font-mono">npm run bootstrap</code>.
                  </p>
                ) : null}

                {error ? (
                  <p className="flex items-start gap-2 text-sm text-rose-300">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    {error}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] tracking-[0.2em] text-cyan-300/80 uppercase">
                    Live excavation
                  </p>
                  <h2 className="text-2xl font-semibold tracking-tight">{productName}</h2>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{statusLine}</p>
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

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  label="Reviews on disk"
                  value={uploadMeta ? String(uploadMeta.rowCount) : "—"}
                />
                <Metric
                  label="Scored in state"
                  value={stream.scored ? String(stream.scored.total_reviews) : "—"}
                />
                <Metric
                  label="Clusters k"
                  value={stream.clustered ? String(stream.clustered.num_clusters) : "—"}
                />
                <Metric
                  label="Latest payload"
                  value={parsedLabel}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Metric
                  label="Archetypes"
                  value={stream.analysis ? String(stream.analysis.archetypes.length) : "—"}
                />
                <Metric
                  label="Hidden Asks"
                  value={stream.analysis ? String(stream.analysis.hidden_asks.length) : "—"}
                />
                <Metric
                  label="Dissonance"
                  value={
                    stream.analysis
                      ? `${stream.analysis.dissonance_stats.percentage}%`
                      : stream.scored
                        ? String(stream.scored.reviews.filter((review) => review.dissonance.detected).length)
                        : "—"
                  }
                />
              </div>

              <Card className="border-cyan-400/10 bg-card/70">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Radio className="size-4 text-cyan-300" />
                    Agent output
                  </CardTitle>
                  <CardDescription>
                    SSE text is parsed into React state as each ```resonance-data fence closes.
                    Charts come in the next step.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {assistant ? (
                    <div className="prose prose-invert max-w-none text-sm leading-7 whitespace-pre-wrap">
                      {assistant}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {["Researching product context", "Reading CSV via filesystem MCP", "Scoring reviews"].map(
                        (line) => (
                          <div key={line} className="h-4 animate-pulse rounded bg-muted/60" />
                        ),
                      )}
                    </div>
                  )}
                  {stream.parseErrors.length ? (
                    <p className="mt-4 text-xs text-amber-200">
                      Parser skipped {stream.parseErrors.length} malformed fence
                      {stream.parseErrors.length === 1 ? "" : "s"} and kept going.
                    </p>
                  ) : null}
                  {phase === "done" ? (
                    <p className="mt-4 flex items-center gap-2 text-xs text-cyan-200">
                      <CheckCircle2 className="size-3.5" />
                      Parser done-when: scored_reviews, cluster_results, and analysis_result are
                      in React state.
                    </p>
                  ) : null}
                  {error ? (
                    <p className="mt-4 text-sm text-rose-300">{error}</p>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          )}
        </section>

        <aside className="min-h-[28rem]">
          <Card className="flex h-full flex-col border-cyan-400/10 bg-card/80">
            <CardHeader className="border-b border-border/60">
              <CardTitle className="text-base">TrueForge transcript</CardTitle>
              <CardDescription>
                This is the harness loop, not a chatbot wrapper. Tool calls and subagents
                show up here.
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 p-0">
              <ScrollArea className="h-[32rem] px-4 py-3">
                <div className="space-y-3">
                  {transcript.length === 0 && !assistant ? (
                    <p className="text-sm text-muted-foreground">
                      Waiting for a run. After you click excavate, session create → turn
                      stream events land here.
                    </p>
                  ) : null}
                  {transcript.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "rounded-lg px-3 py-2 text-xs leading-5",
                        item.kind === "user" && "bg-cyan-400/10 text-cyan-50",
                        item.kind === "status" && "bg-muted/50 text-muted-foreground",
                        item.kind === "tool" && "bg-orange-400/10 text-orange-100",
                        item.kind === "subagent" && "bg-violet-400/10 text-violet-100",
                        item.kind === "error" && "bg-rose-400/10 text-rose-100",
                      )}
                    >
                      <p className="mb-1 font-mono text-[10px] tracking-wide uppercase opacity-70">
                        {item.kind}
                      </p>
                      <p className="whitespace-pre-wrap">{item.text}</p>
                    </div>
                  ))}
                  {assistant ? (
                    <div className="rounded-lg bg-foreground/5 px-3 py-2 text-xs leading-5">
                      <p className="mb-1 font-mono text-[10px] tracking-wide text-cyan-300 uppercase">
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
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-cyan-400/10 bg-card/60 px-4 py-3">
      <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-sm text-cyan-100">{value}</p>
    </div>
  );
}