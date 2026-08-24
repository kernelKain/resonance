import { NextResponse } from "next/server";

import { TRUEFORGE_AGENT_NAME } from "@/lib/config";
import { findResonanceAgent, trueforgeFetch } from "@/lib/trueforge";

export const runtime = "nodejs";

export async function POST() {
  try {
    const agent = await findResonanceAgent();
    if (!agent) {
      return NextResponse.json(
        {
          error: `No TrueForge agent named '${TRUEFORGE_AGENT_NAME}'. Start the harness and run npm run bootstrap.`,
        },
        { status: 503 },
      );
    }

    const response = await trueforgeFetch("/api/v1/sessions", {
      method: "POST",
      body: JSON.stringify({ agent: { name: agent.name } }),
    });

    if (!response.ok) {
      const payload = await response.text();
      return NextResponse.json(
        { error: `TrueForge refused the session: ${payload}` },
        { status: response.status },
      );
    }

    const payload = (await response.json()) as { data?: { id: string } };
    if (!payload.data?.id) {
      return NextResponse.json(
        { error: "TrueForge created a session without an id." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      sessionId: payload.data.id,
      agentName: agent.name,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not reach TrueForge. Is it running on port 8790?";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}