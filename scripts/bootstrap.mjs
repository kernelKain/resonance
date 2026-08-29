import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRUEFORGE = process.env.TRUEFORGE_BASE_URL ?? "http://127.0.0.1:8790";
const AGENT_NAME = process.env.TRUEFORGE_AGENT_NAME ?? "resonance";
const MCP_URL = process.env.MCP_URL ?? "http://127.0.0.1:8792/mcp";
const MODEL_FQN =
  process.env.TRUEFORGE_MODEL ?? "openrouter/nvidia-nemotron-3-ultra-550b-a-55b-free";

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

function openRouterModels() {
  return [
    {
      model_id: "nvidia/nemotron-3-ultra-550b-a55b:free",
      name: "nvidia-nemotron-3-ultra-550b-a-55b-free",
      properties: { context_length: 1000000, max_output_tokens: 65536 },
    },
    {
      model_id: "minimax/minimax-m3:free",
      name: "minimax-minimax-m-3-free",
      properties: { context_length: 1048576, max_output_tokens: 65536 },
    },
  ];
}

async function upsertModelProvider() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === "your_actual_key_here") {
    console.log(
      "• Skipping OpenRouter provider (no valid OPENROUTER_API_KEY). Add it in TrueForge Settings → Models, or put it in .env.local and re-run bootstrap.",
    );
    return;
  }

  await tf("/api/v1/settings/model-providers", {
    method: "PUT",
    body: JSON.stringify({
      manifest: {
        type: "custom",
        name: "openrouter",
        base_url: "https://openrouter.ai/api/v1",
        auth: { api_key: apiKey },
        models: openRouterModels(),
      },
    }),
  });
  console.log("• Model provider openrouter configured.");
}

async function upsertSandboxProvider() {
  const response = await fetch(
    `${TRUEFORGE}/api/v1/settings/sandbox-providers`,
    { headers: { accept: "application/json" } },
  );

  if (response.ok) {
    const existing = await response.json();
    const status = existing.data?.status ?? "unknown";

    if (status === "ready") {
      console.log("• Existing Daytona sandbox provider is ready.");
      return;
    }

    throw new Error(
      `Existing Daytona sandbox provider is not ready: status=${status}, reason=${existing.data?.status_reason ?? "unknown"}`,
    );
  }

  if (response.status !== 404) {
    throw new Error(
      `Could not inspect sandbox provider: ${response.status} ${await response.text()}`,
    );
  }

  const apiKey = process.env.DAYTONA_API_KEY;
  if (!apiKey) {
    throw new Error(
      "No sandbox provider exists and DAYTONA_API_KEY is missing from .env.local.",
    );
  }

  const execTimeout = Number(
    process.env.TRUEFORGE_SANDBOX_EXEC_TIMEOUT_MS ?? 300000,
  );

  await tf("/api/v1/settings/sandbox-providers", {
    method: "PUT",
    body: JSON.stringify({
      manifest: {
        type: "daytona",
        auth: { api_key: apiKey },
        exec_timeout_ms: execTimeout,
        auto_stop_interval_in_minutes: 5,
        auto_archive_interval_in_minutes: 60,
        auto_delete_interval_in_minutes: 7200,
      },
    }),
  });

  console.log("• Daytona sandbox provider created.");
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
  if (!fs.existsSync(specPath)) {
    throw new Error("Missing agent.json in repo root. Create it before bootstrap.");
  }
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
  
  try {
    await upsertSandboxProvider();
  } catch (err) {
    console.error(`• Warning: Sandbox provisioning failed: ${err.message}`);
  }

  await upsertMcp({
    type: "remote",
    name: "filesystem",
    url: MCP_URL,
    description:
      "Read uploaded customer review CSVs and analysis JSON from the Resonance shared volume (uploads/, analysis/, demo_data/, scripts/).",
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