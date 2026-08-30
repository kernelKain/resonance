import {
  TRUEFORGE_AGENT_NAME,
  TRUEFORGE_BASE_URL,
  TRUEFORGE_FALLBACK_AGENT_NAME,
} from "@/lib/config";
import {
  isRetryableModelFailure,
  recordPrimaryFailure,
  recordPrimarySuccess,
} from "@/lib/model-router";
import { createTrueforgeSession } from "@/lib/trueforge";
import { buildTurnInput, type TurnRequest } from "@/lib/trueforge-turn";

export const runtime = "nodejs";
export const maxDuration = 600;

function requestTurn(sessionId: string, input: ReturnType<typeof buildTurnInput>) {
  return fetch(`${TRUEFORGE_BASE_URL}/api/v1/sessions/${sessionId}/turns`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
    },
    body: JSON.stringify({ stream: true, input }),
  });
}

function streamResponse(
  upstream: Response,
  sessionId: string,
  provider: "minimax" | "deepseek",
  agentName: string,
) {
  return new Response(upstream.body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-resonance-session-id": sessionId,
      "x-resonance-model-provider": provider,
      "x-resonance-agent-name": agentName,
    },
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as TurnRequest;
  if (!body.sessionId) {
    return Response.json({ error: "sessionId is required." }, { status: 400 });
  }

  let input;
  try {
    input = buildTurnInput(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid turn input.";
    return Response.json({ error: message }, { status: 400 });
  }

  const agentName = body.agentName ?? TRUEFORGE_AGENT_NAME;
  const isPrimary = agentName === TRUEFORGE_AGENT_NAME;
  const upstream = await requestTurn(body.sessionId, input);

  if (upstream.ok && upstream.body) {
    if (isPrimary) recordPrimarySuccess();
    return streamResponse(
      upstream,
      body.sessionId,
      isPrimary ? "minimax" : "deepseek",
      agentName,
    );
  }

  const text = await upstream.text();
  const retryable = isRetryableModelFailure(upstream.status, text);
  if (isPrimary && retryable) {
    recordPrimaryFailure(text || `HTTP ${upstream.status}`);
    // A fresh user-message turn has no conversation state yet, so it can be
    // safely replayed on the fallback agent. Tool responses remain pinned.
    if (body.message) {
      try {
        const fallbackSessionId = await createTrueforgeSession(TRUEFORGE_FALLBACK_AGENT_NAME);
        const fallback = await requestTurn(fallbackSessionId, input);
        if (fallback.ok && fallback.body) {
          return streamResponse(
            fallback,
            fallbackSessionId,
            "deepseek",
            TRUEFORGE_FALLBACK_AGENT_NAME,
          );
        }
        const fallbackText = await fallback.text();
        return Response.json(
          { error: fallbackText || "Both analysis models are temporarily unavailable." },
          { status: fallback.status || 503 },
        );
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "The fallback analysis model could not be started.",
          },
          { status: 503 },
        );
      }
    }
  } else if (isPrimary) {
    recordPrimarySuccess();
  }

  return Response.json(
    { error: text || `TrueForge turn failed (${upstream.status}).`, retryable },
    { status: upstream.status || 502 },
  );
}