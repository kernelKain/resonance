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
const OUT = path.join(ROOT, "analysis", "insights_last_run.txt");
const SSE_OUT = path.join(ROOT, "analysis", "insights_last_run.sse.txt");

const MESSAGE = `Follow the analysis protocol through archetypes and Hidden Asks for product Linear. CSV file is scoring_fixture.csv (exactly 15 reviews — not sample_reviews.csv). Read it with the filesystem MCP (basename only). Research Linear with a subagent. Score every row. Emit scored_reviews. Write scored_reviews.json into analysis/ and /home/trueforge/scored_reviews.json. Read scripts/cluster.py via filesystem MCP. Write it to /home/trueforge/cluster.py. In the sandbox: ls -l /home/trueforge/cluster.py then python3 /home/trueforge/cluster.py --input /home/trueforge/scored_reviews.json --output /home/trueforge/cluster_results.json. Emit cluster_results VERBATIM. Then name one archetype per cluster and write 3–5 Hidden Asks with action_items null. Emit analysis_result. Then STOP. No product-roadmap recommendations. No approval_request.`;

async function tf(pathname, init = {}) {
  const response = await fetch(`${TRUEFORGE}${pathname}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${pathname} → ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

function eventText(event) {
  if (!event || typeof event !== "object") return "";
  if (typeof event.content === "string") return event.content;
  if (typeof event.text === "string") return event.text;
  if (typeof event.delta === "string") return event.delta;
  if (event.message && typeof event.message.content === "string") return event.message.content;
  if (Array.isArray(event.content)) {
    return event.content
      .map((part) => (typeof part === "string" ? part : part?.text ?? part?.content ?? ""))
      .join("");
  }
  return "";
}

async function main() {
  if (fs.existsSync(OUT) && fs.readFileSync(OUT, "utf8").trim().length > 0) {
    throw new Error(
      `${OUT} already has content. Copy from the TrueForge UI instead. Refusing to overwrite. Move or delete it only if you intend to replace it.`,
    );
  }

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
  let sseRaw = "";
  for await (const chunk of response.body) {
    const decoded = decoder.decode(chunk, { stream: true });
    sseRaw += decoded;
    buffer += decoded;
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
  fs.writeFileSync(SSE_OUT, sseRaw, "utf8");
  fs.writeFileSync(OUT, output, "utf8");
  console.error(`\n\nWrote ${OUT} (${output.length} chars)`);
  console.error(`Wrote raw SSE to ${SSE_OUT} (${sseRaw.length} chars)`);
  if (!output.trim()) {
    console.error(
      "TrueForge returned no assistant text. Inspect the SSE file or copy from the TrueForge UI. Do not treat 0 chars as a failed agent run.",
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});