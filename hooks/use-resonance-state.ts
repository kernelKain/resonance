import { useRef, useState } from "react";
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

export type TranscriptItem = {
  id: string;
  kind: "user" | "assistant" | "status" | "tool" | "subagent" | "error";
  text: string;
};

const HITL_PAUSE_MARKER = "<!-- HITL_PAUSE -->";

function excavationPrompt(productName: string, basename: string, rowCount: number) {
  return `Follow the Day 5 protocol for product "${productName}". CSV file is ${basename} (${rowCount} reviews). Read it with the filesystem MCP (basename only — never a demo_data/ prefix). Spawn a subagent to research the product with Exa. Score every row. Emit compact JSON (no pretty-print) in every resonance-data fence. Persist scored_reviews.json. Copy scripts/cluster.py into the TrueForge sandbox and run cluster.py there. Emit cluster_results VERBATIM from cluster.py. Then name one archetype per cluster and write 3–5 Hidden Asks with action_items null. Emit analysis_result with scored_reviews [] and cluster_results {}. Then emit approval_request and call ask_user_question with options Approved and Decline. Do not emit action_items until the user answers Approved.`;
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

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function useResonanceState() {
  const [productName, setProductName] = useState("Linear");
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<ResonancePhase>("idle");
  const [error, setError] = useState<string | null>(null);
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

  const assistantRef = useRef("");
  const replayCancelRef = useRef(false);
  const flushRafRef = useRef<number | null>(null);

  function cancelFlush() {
    if (flushRafRef.current != null) {
      window.cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = null;
    }
  }

  function flushAssistant() {
    cancelFlush();
    setAssistant(assistantRef.current);
    setStream(extractResonanceStream(assistantRef.current));
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
    setDecisionBusy(false);
  }

  function ingestAssistantChunk(piece: string) {
    if (!piece) return;
    assistantRef.current += piece;
    if (flushRafRef.current != null) return;
    flushRafRef.current = window.requestAnimationFrame(() => {
      flushRafRef.current = null;
      setAssistant(assistantRef.current);
      setStream(extractResonanceStream(assistantRef.current));
    });
  }

  async function loadSample() {
    try {
      const response = await fetch("/demo/hero_reviews.csv", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load hero_reviews.csv");
      const blob = await response.blob();
      setFile(new File([blob], "hero_reviews.csv", { type: "text/csv" }));
      setProductName("Linear");
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
      flushAssistant();
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
      flushAssistant();
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

    flushAssistant();
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
          flushAssistant();
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

  return {
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
  };
}