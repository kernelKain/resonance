import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

const TRUEFORGE = process.env.TRUEFORGE_BASE_URL ?? "http://127.0.0.1:8790";
const AGENT_NAME = process.env.TRUEFORGE_AGENT_NAME ?? "resonance";
const OUT = path.join(ROOT, "analysis", "sandbox_last_run.txt");

const MESSAGE = `SANDBOX SMOKE TEST. Do not score reviews. Do not research Linear. Do not name archetypes.

1. Filesystem MCP read_file on scored_reviews.json.
2. Filesystem MCP read_file on cluster.py (filename cluster.py, not scripts/cluster.py).
3. Provision the TrueForge sandbox. Write scored_reviews.json and cluster.py into it.
4. python3 -c "import sklearn, pandas, numpy" — if that fails, pip install pandas numpy scikit-learn.
5. python3 cluster.py --input scored_reviews.json --output cluster_results.json
6. Emit exactly one resonance-data block of type cluster_results from that file.
Name the harness capabilities out loud.`;

async function tf(pathname, init = {}) {
  const response = await fetch(`${TRUEFORGE}${pathname}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${pathname} → ${response.status}: ${text}`);
  }
  return body;
}

function eventText(event) {
  if (!event || typeof event !== "object") return "";
  if (event.type === "model.message.delta") return event.content ?? event.text ?? "";
  if (event.type === "model.message") return event.content ?? event.text ?? "";
  if (typeof event.content === "string") return event.content;
  return "";
}

async function main() {
  const sessionBody = await tf("/api/v1/sessions", {
    method: "POST",
    body: JSON.stringify({ agent: { name: AGENT_NAME } }),
  });
  const session = sessionBody.data ?? sessionBody;
  const sessionId = session.id;
  if (!sessionId) throw new Error(`no session id: ${JSON.stringify(sessionBody)}`);
  console.log(`session ${sessionId}`);

  const response = await fetch(`${TRUEFORGE}/api/v1/sessions/${sessionId}/turns`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify({
      stream: true,
      input: [{ type: "user.message", content: MESSAGE }],
    }),
  });
  if (!response.ok || !response.body) {
    throw new Error(`turn failed ${response.status}: ${await response.text()}`);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const data = part
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");
      if (!data || data === "[DONE]") continue;
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      const event = parsed.data ?? parsed;
      const piece = eventText(event);
      if (piece) {
        output += piece;
        process.stdout.write(piece);
      }
      if (event.type === "sandbox.created" || event.type === "sandbox.provisioned") {
        process.stderr.write("\n[sandbox] provisioned\n");
      }
      if (event.type === "tool.call") {
        process.stderr.write(`\n[tool] ${event.name ?? event.tool ?? JSON.stringify(event)}\n`);
      }
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, output, "utf8");
  console.error(`\n\nWrote ${OUT} (${output.length} chars)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});