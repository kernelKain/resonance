import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRUEFORGE = process.env.TRUEFORGE_BASE_URL ?? "http://127.0.0.1:8790";
const AGENT_NAME = process.env.TRUEFORGE_AGENT_NAME ?? "resonance";
const MCP_URL = process.env.MCP_URL ?? "http://127.0.0.1:8792/mcp";
const MODEL_FQN =
  process.env.TRUEFORGE_MODEL ?? "google-gemini/gemini-3-1-pro-preview";

function loadEnvFiles() {
  for (const filename of [".env", ".env.local"]) {
    const fullPath = path.join(ROOT, filename);
    if (!fs.existsSync(fullPath)) continue;
    for (const line of fs.readFileSync(fullPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnvFiles();

async function tf(pathname, init = {}) {
  const response = await fetch(`${TRUEFORGE}${pathname}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const message = body?.error?.message ?? text ?? response.statusText;
    throw new Error(`${init.method ?? "GET"} ${pathname} → ${response.status}: ${message}`);
  }
  return body;
}

function geminiModels() {
  return [
    {
      model_id: "gemini-3.1-pro-preview",
      name: "gemini-3-1-pro-preview",
      properties: { context_length: 1048576, max_output_tokens: 65536 },
    },
    {
      model_id: "gemini-3.6-flash",
      name: "gemini-3-6-flash",
      properties: { context_length: 1048576, max_output_tokens: 65536 },
    },
  ];
}

async function upsertModelProvider() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log(
      "• Skipping Google Gemini provider (no GEMINI_API_KEY). Add it in TrueForge Settings → Models, or put it in .env.local and re-run bootstrap.",
    );
    return;
  }

  await tf("/api/v1/settings/model-providers", {
    method: "PUT",
    body: JSON.stringify({
      manifest: {
        type: "google-gemini",
        auth: { api_key: apiKey },
        models: geminiModels(),
      },
    }),
  });
  console.log("• Model provider google-gemini configured.");
}

async function upsertMcp(manifest) {
  await tf("/api/v1/settings/mcp-servers", {
    method: "PUT",
    body: JSON.stringify({ manifest }),
  });
  console.log(`• MCP connector '${manifest.name}' → ${manifest.url}`);
}

async function upsertAgent() {
  const specPath = path.join(ROOT, "agent.json");
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  spec.model = spec.model ?? {};
  spec.model.name = MODEL_FQN;

  const listed = await tf("/api/v1/agents");
  const existing = (
    Array.isArray(listed.data) ? listed.data : listed.data?.items ?? listed.items ?? []
  ).find((agent) => agent.name === AGENT_NAME);

  if (existing) {
    await tf(`/api/v1/agents/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify({ manifest: spec }),
    });
    console.log(`• Agent '${AGENT_NAME}' updated (${existing.id}).`);
    return existing;
  }

  const created = await tf("/api/v1/agents", {
    method: "POST",
    body: JSON.stringify({ name: AGENT_NAME, manifest: spec }),
  });
  console.log(`• Agent '${AGENT_NAME}' created (${created.data?.id ?? "ok"}).`);
  return created.data;
}

async function main() {
  console.log(`Bootstrapping Resonance against ${TRUEFORGE}\n`);

  try {
    await tf("/api/v1/capabilities");
  } catch (error) {
    console.error(
      `TrueForge is not reachable at ${TRUEFORGE}.\nStart it first:\n\n  npx --yes @truefoundry/trueforge@latest\n\nThen re-run: npm run bootstrap\n`,
    );
    console.error(error.message);
    process.exit(1);
  }

  await upsertModelProvider();
  await upsertMcp({
    type: "remote",
    name: "filesystem",
    url: MCP_URL,
    description:
      "Read uploaded customer review CSVs from the Resonance shared volume (uploads/, analysis/, demo_data/).",
  });
  await upsertMcp({
    type: "remote",
    name: "exa",
    url: "https://mcp.exa.ai/mcp",
    description: "Search the web, fetch page contents, and find similar pages.",
  });
  await upsertAgent();

  console.log(`\nDone. Open TrueForge at ${TRUEFORGE}`);
  console.log(`Saved agent name: ${AGENT_NAME}`);
  console.log(`Model: ${MODEL_FQN}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});