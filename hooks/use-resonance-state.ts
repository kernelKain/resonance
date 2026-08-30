/**
 * @file hooks/use-resonance-state.ts
 *
 * Central state management hook for the Resonance analysis pipeline.
 *
 * Orchestrates:
 * - File upload to `/api/upload`
 * - TrueForge session lifecycle (open → stream turn → HITL approval → done)
 * - RAF-batched streaming of the assistant text to avoid render thrashing
 * - Session persistence via `sessionStorage` so a page refresh restores results
 * - Transcript accumulation for the live activity log
 */

import { useEffect, useRef, useState } from "react";
import {
  emptyResonanceStream,
  extractResonanceStream,
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
import { readSse } from "@/hooks/use-sse-stream";
import { isRetryableModelFailure } from "@/lib/model-router";
import {
  asProductUrl,
  brandNameFrom,
  hostnameLabel,
  type ProductIdentity,
} from "@/lib/product-identity";

/**
 * A single item in the live transcript shown in the sidebar and activity log.
 *
 * `kind` determines the colour and visibility:
 * - `user` / `assistant` — only shown in dev mode
 * - `status` / `tool` / `subagent` / `error` — shown in the simplified activity log
 */
export type TranscriptItem = {
  id: string;
  kind: "user" | "assistant" | "status" | "tool" | "subagent" | "error";
  text: string;
};

const HITL_PAUSE_MARKER = "<!-- HITL_PAUSE -->";

export function cleanProductName(input: string): string {
  const url = asProductUrl(input);
  if (url) return hostnameLabel(url);
  return input.trim();
}

/**
 * Builds the excavation prompt sent to TrueForge.
 * Encodes all necessary parameters (product, file path, row count) inline so
 * the agent can start immediately without additional clarification.
 */
function excavationPrompt(product: ProductIdentity, basename: string, rowCount: number) {
  const source = product.sourceUrl ? ` Product URL: ${product.sourceUrl}.` : "";
  return `Follow the Emotion Archaeology protocol for product "${product.name}".${source} CSV file is ${basename} (${rowCount} reviews). Read it with the filesystem MCP (basename only — never a demo_data/ prefix). Spawn a subagent to research the product with Exa. Score every row. Immediately emit scored_reviews as compact JSON (no pretty-print) in a resonance-data fence in your assistant message — that fence is what the UI reads. Persist with write_analysis_file. Never cat a large JSON file through sandbox exec; that output is truncated and the turn will time out. Copy scripts/cluster.py into the TrueForge sandbox and run cluster.py there. Emit cluster_results VERBATIM from cluster.py in a resonance-data fence. Then name one archetype per cluster and write 3–5 Hidden Asks with action_items null. Emit analysis_result with scored_reviews [] and cluster_results {}. Then emit approval_request and call ask_user_question with options Approved and Decline. Do not emit action_items until the user answers Approved.`;
}

/**
 * Converts a raw TrueForge SSE event into a {@link TranscriptItem} if it is
 * a user-facing event type. Returns `null` for events that should be silent.
 */
function rememberToolCalls(
  event: Record<string, unknown>,
  toolNames: Map<string, string>,
) {
  if (String(event.type ?? "") !== "model.message") return;
  const calls = event.tool_calls ?? event.toolCalls;
  if (!Array.isArray(calls)) return;
  for (const raw of calls) {
    if (!raw || typeof raw !== "object") continue;
    const call = raw as Record<string, unknown>;
    const fn = (call.function ?? call) as Record<string, unknown>;
    const id = String(call.id ?? "");
    const name = String(fn.name ?? call.name ?? "");
    if (id && name) toolNames.set(id, name);
  }
}

function toolLabel(event: Record<string, unknown>, toolNames: Map<string, string>): string {
  const id = String(event.tool_call_id ?? event.toolCallId ?? "");
  return (
    (id && toolNames.get(id)) ||
    String(event.name ?? event.tool ?? event.toolName ?? event.original_tool_name ?? "tool")
  );
}

function mergeResonanceStream(
  current: ResonanceStreamState,
  incoming: ResonanceStreamState,
): ResonanceStreamState {
  return {
    scored: incoming.scored ?? current.scored,
    clustered: incoming.clustered ?? current.clustered,
    analysis: incoming.analysis ?? current.analysis,
    approval: incoming.approval ?? current.approval,
    actionItems: incoming.actionItems ?? current.actionItems,
    fenceCount: current.fenceCount + incoming.fenceCount,
    parseErrors: [...current.parseErrors, ...incoming.parseErrors],
  };
}

function summarizeEvent(
  event: Record<string, unknown>,
  toolNames: Map<string, string>,
): TranscriptItem | null {
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
    const name = toolLabel(event, toolNames);
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

/** Extracts the assistant text delta from a `model.message.delta` event on the main thread. */
function deltaText(event: Record<string, unknown>): string {
  if (event.type !== "model.message.delta") return "";
  const threadId = String(event.thread_id ?? event.threadId ?? "main");
  if (threadId && threadId !== "main") return "";
  const content = event.content;
  if (typeof content === "string") return content;
  return "";
}

function turnFailure(event: Record<string, unknown>): string | null {
  const type = String(event.type ?? "");
  if (["model.error", "turn.error", "turn.failed"].includes(type)) {
    return friendlyModelError(event.message ?? event.error);
  }
  if (type === "turn.done") {
    const state = event.state as
      | { status?: string; error?: unknown; message?: unknown; reason?: unknown }
      | undefined;
    if (state?.status === "failed" || state?.status === "error") {
      return friendlyModelError(state.message ?? state.error);
    }
    if (state?.status === "cancelled") {
      const reason = String(state.reason ?? "");
      if (reason.includes("timeout")) {
        return "The analysis timed out. The model used tools for too long and never streamed scored reviews to the UI. Retry the run.";
      }
      return reason ? `The analysis was cancelled (${reason}).` : "The analysis was cancelled.";
    }
  }
  return null;
}

function friendlyModelError(raw: unknown): string {
  const text = String(raw ?? "").trim() || "The model could not complete the turn.";
  const lower = text.toLowerCase();
  if (
    lower.includes("rate_limit") ||
    lower.includes("rate limit") ||
    /\b429\b/.test(lower)
  ) {
    return "The primary model hit a rate limit (OpenRouter / MiniMax). Retry the analysis — Resonance will use DeepSeek if MiniMax is still limited.";
  }
  return text;
}

/** Promise-based sleep utility used when retrying failed API calls. */
function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

class RunCancelledError extends Error {
  constructor() {
    super("Run cancelled");
    this.name = "RunCancelledError";
  }
}

/**
 * Primary state hook for the Resonance application.
 *
 * Returns a state bag consumed by `resonance-app.tsx` containing all reactive
 * values and action functions needed to drive the analysis pipeline.
 */
export function useResonanceState() {
  const [productName, setProductName] = useState("");
  const [productIdentity, setProductIdentity] = useState<ProductIdentity | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<ResonancePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [assistant, setAssistant] = useState("");
  const [stream, setStream] = useState<ResonanceStreamState>(emptyResonanceStream);
  const [uploadMeta, setUploadMeta] = useState<{
    filePath: string;
    rowCount: number;
    filteredRowCount?: number;
  } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeAgentName, setActiveAgentName] = useState<string | null>(null);
  const [modelProvider, setModelProvider] = useState<"minimax" | "deepseek" | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<PendingUserQuestion | null>(null);
  const [replayTail, setReplayTail] = useState<string>("");
  const [decisionBusy, setDecisionBusy] = useState(false);

  const assistantRef = useRef("");
  const replayCancelRef = useRef(false);
  const flushRafRef = useRef<number | null>(null);
  const runGenerationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  function isCurrentRun(runId: number) {
    return runGenerationRef.current === runId;
  }

  function assertCurrentRun(runId: number) {
    if (!isCurrentRun(runId)) throw new RunCancelledError();
  }

  function cancelActiveWork() {
    runGenerationRef.current += 1;
    replayCancelRef.current = true;
    abortRef.current?.abort();
    abortRef.current = null;
    cancelFlush();
  }

  function beginWork(): { runId: number; signal: AbortSignal } {
    cancelActiveWork();
    replayCancelRef.current = false;
    const controller = new AbortController();
    abortRef.current = controller;
    return { runId: runGenerationRef.current, signal: controller.signal };
  }

  // ── Session persistence ──────────────────────────────────────────────────────
  // On mount: rehydrate state from sessionStorage so a page refresh doesn't
  // erase the analysis results. File objects cannot be serialized so only
  // metadata and the assistant output are restored.
  // State setters are deferred to rAF to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const raw = sessionStorage.getItem("resonance_session");
        if (!raw) return;
        const saved = JSON.parse(raw) as {
          productName?: string;
          phase?: ResonancePhase;
          assistant?: string;
          uploadMeta?: { filePath: string; rowCount: number; filteredRowCount?: number } | null;
          productIdentity?: ProductIdentity | null;
          sessionId?: string | null;
          activeAgentName?: string | null;
          modelProvider?: "minimax" | "deepseek" | null;
          pendingQuestion?: PendingUserQuestion | null;
        };
        if (saved.productName) setProductName(saved.productName);
        if (saved.productIdentity) setProductIdentity(saved.productIdentity);
        if (saved.uploadMeta) setUploadMeta(saved.uploadMeta);
        if (saved.sessionId) setSessionId(saved.sessionId);
        if (saved.activeAgentName) setActiveAgentName(saved.activeAgentName);
        if (saved.modelProvider) setModelProvider(saved.modelProvider);
        if (saved.pendingQuestion) setPendingQuestion(saved.pendingQuestion);
        if (saved.assistant) {
          assistantRef.current = saved.assistant;
          setAssistant(saved.assistant);
          setStream(extractResonanceStream(saved.assistant));
        }
        if (
          saved.phase === "awaiting_approval" &&
          saved.sessionId &&
          saved.pendingQuestion
        ) {
          setPhase("awaiting_approval");
        } else if (saved.phase === "running" || saved.phase === "uploading") {
          setPhase("error");
          setError("The live connection ended during refresh. Start a new run to analyze again.");
        } else if (saved.phase && saved.phase !== "idle") {
          setPhase(saved.phase);
        }
      } catch {
        // Silently ignore malformed session data
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  /** Persist current state snapshot to sessionStorage. */
  function saveSession(
    name: string,
    currentPhase: ResonancePhase,
    assistantText: string,
    meta: { filePath: string; rowCount: number; filteredRowCount?: number } | null,
  ) {
    try {
      sessionStorage.setItem(
        "resonance_session",
        JSON.stringify({
          productName: name,
          productIdentity,
          phase: currentPhase,
          assistant: assistantText,
          uploadMeta: meta,
          sessionId,
          activeAgentName,
          modelProvider,
          pendingQuestion,
        }),
      );
    } catch {
      // Storage quota exceeded or unavailable — fail silently
    }
  }

  useEffect(() => {
    if (phase === "idle") return;
    const timer = window.setTimeout(() => {
      saveSession(cleanProductName(productName), phase, assistant, uploadMeta);
    }, 100);
    return () => window.clearTimeout(timer);
    // saveSession intentionally captures the complete current session state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeAgentName,
    assistant,
    modelProvider,
    pendingQuestion,
    phase,
    productIdentity,
    productName,
    sessionId,
    uploadMeta,
  ]);

  useEffect(() => {
    const url = asProductUrl(productName);
    const name = productName.trim();

    if (!url) {
      setProductIdentity((current) => {
        if (!name) return null;
        if (current?.name === name) return current;
        return { name };
      });
      return;
    }

    const fallback: ProductIdentity = {
      name: hostnameLabel(url),
      sourceUrl: url.toString(),
      fromPage: false,
    };
    setProductIdentity((current) => {
      if (current?.sourceUrl === fallback.sourceUrl) return current;
      return fallback;
    });

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void resolveProductIdentity(productName).then((identity) => {
        if (cancelled) return;
        setProductIdentity((current) => {
          if (asProductUrl(productName)?.toString() !== url.toString()) return current;
          return identity;
        });
      });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // resolveProductIdentity is stable for this effect's purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productName]);
  // ─────────────────────────────────────────────────────────────────────────────

  function cancelFlush() {
    if (flushRafRef.current != null) {
      window.cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = null;
    }
  }

  function flushAssistant(runId = runGenerationRef.current) {
    if (!isCurrentRun(runId)) return;
    cancelFlush();
    setAssistant(assistantRef.current);
    setStream(extractResonanceStream(assistantRef.current));
    // Persist after every flush so a refresh restores the latest state
    saveSession(cleanProductName(productName), phase, assistantRef.current, uploadMeta);
  }

  function resetStream() {
    cancelFlush();
    assistantRef.current = "";
    setAssistant("");
    setStream(emptyResonanceStream());
    setTranscript([]);
    setPendingQuestion(null);
    setReplayTail("");
    setSessionId(null);
    setActiveAgentName(null);
    setModelProvider(null);
    setDecisionBusy(false);
    // Clear saved session on a fresh run
    try { sessionStorage.removeItem("resonance_session"); } catch { /* ignore */ }
  }

  function resetRun() {
    cancelActiveWork();
    resetStream();
    setFile(null);
    setProductName("");
    setProductIdentity(null);
    setUploadMeta(null);
    setError(null);
    setPhase("idle");
  }

  function ingestAssistantChunk(piece: string, runId = runGenerationRef.current) {
    if (!piece || !isCurrentRun(runId)) return;
    assistantRef.current += piece;
    if (flushRafRef.current != null) return;
    flushRafRef.current = window.requestAnimationFrame(() => {
      flushRafRef.current = null;
      if (!isCurrentRun(runId)) return;
      setAssistant(assistantRef.current);
      setStream((current) =>
        mergeResonanceStream(current, extractResonanceStream(assistantRef.current)),
      );
    });
  }

  async function resolveProductIdentity(input: string): Promise<ProductIdentity> {
    const url = asProductUrl(input);
    if (!url) return { name: input.trim() };
    const fallback: ProductIdentity = {
      name: hostnameLabel(url),
      sourceUrl: url.toString(),
      fromPage: false,
    };
    try {
      const response = await fetch("/api/product-metadata", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.toString() }),
      });
      const payload = (await response.json()) as ProductIdentity & { error?: string };
      if (response.ok && payload.name) {
        const name = asProductUrl(payload.name) ? fallback.name : payload.name;
        return {
          ...payload,
          name,
          sourceUrl: payload.sourceUrl ?? url.toString(),
          fromPage: true,
        };
      }
    } catch {
      // Metadata improves display but must not block an analysis.
    }
    return fallback;
  }

  async function loadSample() {
    try {
      const response = await fetch("/demo/hero_reviews.csv", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load hero_reviews.csv");
      const blob = await response.blob();
      setFile(new File([blob], "hero_reviews.csv", { type: "text/csv" }));
      setProductName("Linear");
      setProductIdentity({ name: "Linear", sourceUrl: "https://linear.app", fromPage: true });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not load demo dataset.";
      setError(message);
    }
  }

  async function loadScoringFixture() {
    const response = await fetch("/demo/scoring_fixture.csv");
    const blob = await response.blob();
    setFile(new File([blob], "scoring_fixture.csv", { type: "text/csv" }));
    setProductName("Linear");
    setProductIdentity({ name: "Linear", sourceUrl: "https://linear.app", fromPage: true });
  }

  async function replayFixture() {
    const { runId } = beginWork();
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
      assertCurrentRun(runId);
      if (!response.ok) throw new Error("Could not load stream_fixture.txt");
      const text = await response.text();
      assertCurrentRun(runId);
      const size = 28;
      for (let i = 0; i < text.length; i += size) {
        assertCurrentRun(runId);
        ingestAssistantChunk(text.slice(i, i + size), runId);
        await sleep(12);
      }
      flushAssistant(runId);
      assertCurrentRun(runId);
      setPhase("done");
    } catch (caught) {
      if (caught instanceof RunCancelledError || isAbortError(caught)) return;
      const message = caught instanceof Error ? caught.message : "Replay failed.";
      setError(message);
      setPhase("error");
    }
  }

  async function replayHitlFixture() {
    const { runId } = beginWork();
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
      assertCurrentRun(runId);
      if (!response.ok) throw new Error("Could not load day5_stream_fixture.txt");
      const text = await response.text();
      assertCurrentRun(runId);
      const markerAt = text.indexOf(HITL_PAUSE_MARKER);
      if (markerAt < 0) throw new Error("HITL fixture is missing <!-- HITL_PAUSE -->");
      const before = text.slice(0, markerAt);
      const after = text.slice(markerAt + HITL_PAUSE_MARKER.length);
      const size = 28;
      for (let i = 0; i < before.length; i += size) {
        assertCurrentRun(runId);
        ingestAssistantChunk(before.slice(i, i + size), runId);
        await sleep(12);
      }
      flushAssistant(runId);
      assertCurrentRun(runId);
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
      if (caught instanceof RunCancelledError || isAbortError(caught)) return;
      const message = caught instanceof Error ? caught.message : "HITL replay failed.";
      setError(message);
      setPhase("error");
    }
  }

  async function openSession(
    forceFallback = false,
    failure?: string,
    signal?: AbortSignal,
  ): Promise<{ sessionId: string; agentName: string }> {
    const sessionRes = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ forceFallback, failure }),
      signal,
    });
    const sessionJson = (await sessionRes.json()) as {
      sessionId?: string;
      agentName?: string;
      modelProvider?: "minimax" | "deepseek";
      error?: string;
    };
    if (!sessionRes.ok || !sessionJson.sessionId || !sessionJson.agentName) {
      throw new Error(sessionJson.error ?? "Could not open a TrueForge session.");
    }
    setSessionId(sessionJson.sessionId);
    setActiveAgentName(sessionJson.agentName);
    setModelProvider(sessionJson.modelProvider ?? "minimax");
    return { sessionId: sessionJson.sessionId, agentName: sessionJson.agentName };
  }

  async function streamTurn(
    nextSessionId: string,
    body: Record<string, unknown>,
    turnAgentName = activeAgentName,
    allowFallback = true,
    runId = runGenerationRef.current,
    signal?: AbortSignal,
  ) {
    const turnRes = await fetch("/api/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: nextSessionId, agentName: turnAgentName, ...body }),
      signal,
    });
    assertCurrentRun(runId);

    if (!turnRes.ok) {
      const failed = (await turnRes.json()) as { error?: string };
      throw new Error(failed.error ?? "TrueForge turn failed.");
    }

    const routedSessionId = turnRes.headers.get("x-resonance-session-id");
    const routedAgentName = turnRes.headers.get("x-resonance-agent-name");
    const routedProvider = turnRes.headers.get("x-resonance-model-provider");
    if (routedSessionId) setSessionId(routedSessionId);
    if (routedAgentName) setActiveAgentName(routedAgentName);
    if (routedProvider === "minimax" || routedProvider === "deepseek") {
      setModelProvider(routedProvider);
      if (routedProvider === "deepseek") {
        setTranscript((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            kind: "status",
            text: "MiniMax is temporarily unavailable. Analysis continued with DeepSeek V4 Flash.",
          },
        ]);
      }
    }

    const messages = new Map<string, Record<string, unknown>>();
    const toolNames = new Map<string, string>();
    let ingest: TurnIngest = { pending: pendingQuestion, paused: false };
    let streamFailure: string | null = null;
    let producedAssistantText = false;

    await readSse(
      turnRes,
      (event) => {
        if (!isCurrentRun(runId)) return;
        rememberToolCalls(event, toolNames);
        ingest = applyTurnEvent(event, messages, ingest);
        streamFailure ??= turnFailure(event);
        if (event.type === "tool.response") {
          const content = String(event.content ?? "");
          if (content.includes('"type"')) {
            const fromTool = extractResonanceStream(content);
            if (fromTool.scored || fromTool.clustered || fromTool.analysis) {
              setStream((current) => mergeResonanceStream(current, fromTool));
            }
          }
        }
        const piece = deltaText(event);
        if (piece) {
          producedAssistantText = true;
          ingestAssistantChunk(piece, runId);
          return;
        }
        const item = summarizeEvent(event, toolNames);
        if (item) {
          setTranscript((current) => [...current, item]);
        }
      },
      signal,
    );
    assertCurrentRun(runId);

    const hasAnalysisOutput = assistantRef.current.includes("```resonance-data");
    if (
      streamFailure &&
      allowFallback &&
      body.message &&
      !hasAnalysisOutput &&
      (isRetryableModelFailure(0, streamFailure) || !producedAssistantText)
    ) {
      const fallback = await openSession(true, streamFailure, signal);
      assertCurrentRun(runId);
      setTranscript((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          kind: "status",
          text: "MiniMax could not start the analysis. Retrying with DeepSeek V4 Flash.",
        },
      ]);
      await streamTurn(fallback.sessionId, body, fallback.agentName, false, runId, signal);
      return;
    }

    if (streamFailure) {
      throw new Error(streamFailure);
    }

    flushAssistant(runId);
    extractResonanceStream(assistantRef.current);

    if (ingest.paused) {
      if (ingest.pending?.toolCallId && ingest.pending.toolCallId !== REPLAY_TOOL_CALL_ID) {
        setPendingQuestion(ingest.pending);
        setPhase("awaiting_approval");
        return;
      }
      setPendingQuestion(null);
      setError(
        "TrueForge paused for approval, but the tool call id was missing. Start a new TrueForge conversation, re-run bootstrap, and try again. Do not click Approve.",
      );
      setPhase("error");
      return;
    }

    setPendingQuestion(null);
    setPhase("done");
    saveSession(cleanProductName(productName), "done", assistantRef.current, uploadMeta);
  }

  async function runExcavation() {
    if (!file) return;
    const { runId, signal } = beginWork();
    setError(null);
    resetStream();
    setPhase("uploading");

    try {
      const identityPromise = resolveProductIdentity(productName);
      const form = new FormData();
      form.set("file", file);
      const uploaded = await fetch("/api/upload", { method: "POST", body: form, signal });
      assertCurrentRun(runId);
      const uploadJson = (await uploaded.json()) as {
        success?: boolean;
        error?: string;
        filePath?: string;
        filename?: string;
        rowCount?: number;
        filteredRowCount?: number;
      };
      if (!uploaded.ok || !uploadJson.success || !uploadJson.filePath) {
        throw new Error(uploadJson.error ?? "Upload failed.");
      }

      const effectiveRowCount = uploadJson.filteredRowCount ?? uploadJson.rowCount ?? 0;
      setUploadMeta({
        filePath: uploadJson.filePath,
        rowCount: uploadJson.rowCount ?? 0,
        filteredRowCount: uploadJson.filteredRowCount,
      });

      const nextSession = await openSession(false, undefined, signal);
      assertCurrentRun(runId);
      const basename =
        uploadJson.filename ?? uploadJson.filePath.split("/").pop() ?? file.name;
      const identity = await identityPromise;
      assertCurrentRun(runId);
      const resolvedIdentity = {
        ...identity,
        name: brandNameFrom(identity, productName) || basename,
      };
      setProductIdentity(resolvedIdentity);
      setProductName(resolvedIdentity.name);
      const message = excavationPrompt(resolvedIdentity, basename, effectiveRowCount);

      setTranscript([
        {
          id: crypto.randomUUID(),
          kind: "user",
          text: message,
        },
      ]);
      setPhase("running");
      await streamTurn(nextSession.sessionId, { message }, nextSession.agentName, true, runId, signal);
    } catch (caught) {
      if (caught instanceof RunCancelledError || isAbortError(caught)) return;
      const message = caught instanceof Error ? caught.message : "Run failed.";
      setError(message);
      setPhase("error");
    }
  }

  async function runHitlSmoke() {
    const { runId, signal } = beginWork();
    setError(null);
    resetStream();
    setUploadMeta({ filePath: "HITL_SMOKE", rowCount: 0 });
    const cleanName = cleanProductName(productName);
    setProductName(cleanName);

    try {
      const nextSession = await openSession(false, undefined, signal);
      assertCurrentRun(runId);
      const message = `HITL_SMOKE for ${cleanName}. Pause for approval. Do not read a CSV.`;
      setTranscript([
        {
          id: crypto.randomUUID(),
          kind: "user",
          text: message,
        },
      ]);
      setPhase("running");
      await streamTurn(nextSession.sessionId, { message }, nextSession.agentName, true, runId, signal);
    } catch (caught) {
      if (caught instanceof RunCancelledError || isAbortError(caught)) return;
      const message = caught instanceof Error ? caught.message : "HITL smoke failed.";
      setError(message);
      setPhase("error");
    }
  }

  async function decide(content: "Approved" | "Decline") {
    if (!pendingQuestion?.toolCallId || decisionBusy) return;
    const runId = runGenerationRef.current;
    if (!abortRef.current) abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
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
            assertCurrentRun(runId);
            ingestAssistantChunk(tail.slice(i, i + size), runId);
            await sleep(12);
          }
          flushAssistant(runId);
        }
        assertCurrentRun(runId);
        setPendingQuestion(null);
        setReplayTail("");
        setPhase("done");
        return;
      }

      if (!sessionId) {
        throw new Error("TrueForge session was lost. Start a new run.");
      }

      setPhase("running");
      await streamTurn(
        sessionId,
        {
          toolResponse: {
            threadId: pendingQuestion.threadId,
            toolCallId: pendingQuestion.toolCallId,
            content,
          },
        },
        activeAgentName,
        true,
        runId,
        signal,
      );
    } catch (caught) {
      if (caught instanceof RunCancelledError || isAbortError(caught)) return;
      const message = caught instanceof Error ? caught.message : "Could not resume the turn.";
      setError(message);
      setPhase("error");
    } finally {
      if (isCurrentRun(runId)) setDecisionBusy(false);
    }
  }

  return {
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
    replayCancelRef,
    loadSample,
    loadScoringFixture,
    replayFixture,
    replayHitlFixture,
    runExcavation,
    runHitlSmoke,
    decide,
    resetRun,
  };
}