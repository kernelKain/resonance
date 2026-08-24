import { TRUEFORGE_BASE_URL } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 600;

type TurnBody = {
  sessionId?: string;
  message?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as TurnBody;
  if (!body.sessionId || !body.message?.trim()) {
    return Response.json(
      { error: "sessionId and message are required." },
      { status: 400 },
    );
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
        input: [{ type: "user.message", content: body.message }],
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