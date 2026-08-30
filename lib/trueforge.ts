import { TRUEFORGE_AGENT_NAME, TRUEFORGE_BASE_URL } from "@/lib/config";

export function trueforgeUrl(path: string): string {
  return `${TRUEFORGE_BASE_URL}${path}`;
}

export async function trueforgeFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json");
  }

  return fetch(trueforgeUrl(path), {
    ...init,
    headers,
    cache: "no-store",
  });
}

type AgentListResponse = {
  data?: Array<{ id: string; name: string }> | { items?: Array<{ id: string; name: string }> };
  items?: Array<{ id: string; name: string }>;
};

function agentsFrom(payload: AgentListResponse): Array<{ id: string; name: string }> {
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && "items" in payload.data && Array.isArray(payload.data.items)) {
    return payload.data.items;
  }
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

export async function findAgentByName(name: string): Promise<{
  id: string;
  name: string;
} | null> {
  const response = await trueforgeFetch("/api/v1/agents");
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as AgentListResponse;
  const agents = agentsFrom(payload);
  return agents.find((agent) => agent.name === name) ?? null;
}

export function findResonanceAgent() {
  return findAgentByName(TRUEFORGE_AGENT_NAME);
}

export async function createTrueforgeSession(agentName: string): Promise<string> {
  const agent = await findAgentByName(agentName);
  if (!agent) throw new Error(`No TrueForge agent named '${agentName}'. Run npm run bootstrap.`);
  const response = await trueforgeFetch("/api/v1/sessions", {
    method: "POST",
    body: JSON.stringify({ agent: { name: agent.name } }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`TrueForge refused the ${agentName} session: ${text}`);
  }
  const payload = JSON.parse(text) as { data?: { id?: string } };
  if (!payload.data?.id) throw new Error("TrueForge created a session without an id.");
  return payload.data.id;
}