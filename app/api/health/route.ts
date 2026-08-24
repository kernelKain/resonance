import { NextResponse } from "next/server";

import { MCP_BASE_URL, TRUEFORGE_AGENT_NAME, TRUEFORGE_BASE_URL } from "@/lib/config";
import { findResonanceAgent } from "@/lib/trueforge";

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
  if (trueforge) {
    try {
      const found = await findResonanceAgent();
      agent = found?.name === TRUEFORGE_AGENT_NAME;
    } catch {
      agent = false;
    }
  }

  return NextResponse.json({
    trueforge,
    filesystemMcp,
    agent,
    agentName: TRUEFORGE_AGENT_NAME,
  });
}