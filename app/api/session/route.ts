import { NextResponse } from "next/server";

import { TRUEFORGE_FALLBACK_AGENT_NAME } from "@/lib/config";
import {
  selectAgentForNewSession,
  releasePrimaryProbe,
  recordPrimaryFailure,
} from "@/lib/model-router";
import { createTrueforgeSession } from "@/lib/trueforge";
import { clientAddress, rateLimitResponse, takeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rateLimit = takeRateLimit(`session:${clientAddress(request)}`, 20, 60_000);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  const body = (await request.json().catch(() => ({}))) as {
    forceFallback?: boolean;
    failure?: string;
  };
  if (body.forceFallback) {
    recordPrimaryFailure(body.failure ?? "Primary model stream failed.");
  }
  const selection = body.forceFallback
    ? {
        agentName: TRUEFORGE_FALLBACK_AGENT_NAME,
        provider: "deepseek" as const,
        probingPrimary: false,
      }
    : selectAgentForNewSession();
  try {
    const sessionId = await createTrueforgeSession(selection.agentName);
    return NextResponse.json({
      sessionId,
      agentName: selection.agentName,
      modelProvider: selection.provider,
      probingPrimary: selection.probingPrimary,
    });
  } catch (error) {
    if (selection.probingPrimary) releasePrimaryProbe();
    const message =
      error instanceof Error
        ? error.message
        : "Could not reach TrueForge. Is it running on port 8790?";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}