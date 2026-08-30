import { NextResponse } from "next/server";

import {
  MCP_BASE_URL,
  TRUEFORGE_AGENT_NAME,
  TRUEFORGE_BASE_URL,
  TRUEFORGE_FALLBACK_AGENT_NAME,
} from "@/lib/config";
import { modelRoutingStatus } from "@/lib/model-router";
import { findAgentByName, findResonanceAgent } from "@/lib/trueforge";

export const runtime = "nodejs";

async function ping(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const [trueforge, filesystemMcp] = await Promise.all([
    ping(`${TRUEFORGE_BASE_URL}/api/v1/capabilities`),
    ping(`${MCP_BASE_URL}/health`),
  ]);

  let agent = false;
  let fallbackAgent = false;
  if (trueforge) {
    const [found, fallback] = await Promise.all([
      findResonanceAgent().catch(() => null),
      findAgentByName(TRUEFORGE_FALLBACK_AGENT_NAME).catch(() => null),
    ]);
    agent = found?.name === TRUEFORGE_AGENT_NAME;
    fallbackAgent = fallback?.name === TRUEFORGE_FALLBACK_AGENT_NAME;
  }

  return NextResponse.json({
    trueforge,
    filesystemMcp,
    agent,
    fallbackAgent,
    agentName: TRUEFORGE_AGENT_NAME,
    modelRouting: modelRoutingStatus(),
  });
}