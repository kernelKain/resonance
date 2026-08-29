import { TRUEFORGE_BASE_URL } from "@/lib/config";
import { buildTurnInput, type TurnRequest } from "@/lib/trueforge-turn";

export const runtime = "nodejs";
export const maxDuration = 600;

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

  const upstream = await fetch(
    `${TRUEFORGE_BASE_URL}/api/v1/sessions/${body.sessionId}/turns`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify({
        stream: true,
        input,
      }),
    },
  );

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    return Response.json(
      { error: text || `TrueForge turn failed (${upstream.status}).` },
      { status: upstream.status || 502 },
    );
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}