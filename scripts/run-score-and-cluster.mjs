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
const OUTPUT_PATH = path.join(ROOT, "analysis", "pipeline_last_run.txt");
const RAW_STREAM_PATH = path.join(ROOT, "analysis", "pipeline_last_run.sse.txt");

const MESSAGE = `Follow the Day 3 protocol for product Linear.

CSV file: scoring_fixture.csv
Also valid path: demo_data/scoring_fixture.csv
It must contain exactly 15 reviews. Do not use sample_reviews.csv.

Read the CSV with filesystem MCP.
Research Linear with an Exa subagent.
Score every row.
Emit the scored_reviews resonance-data fence.
write_analysis_file scored_reviews.json.
Copy that JSON into /home/trueforge/scored_reviews.json.
Filesystem read_file scripts/cluster.py.
Copy it into /home/trueforge/cluster.py.
Run: ls -l /home/trueforge/cluster.py /home/trueforge/scored_reviews.json
Stop if either file is missing.
Then in /home/trueforge:
python3 -c "import sklearn, pandas, numpy" || python3 -m pip install pandas numpy scikit-learn
python3 cluster.py --input scored_reviews.json --output cluster_results.json
test -s cluster_results.json
cat cluster_results.json
write_analysis_file cluster_results.json using that exact JSON.
Emit the cluster_results resonance-data fence VERBATIM from cluster.py.
Then STOP.
No archetypes. No Hidden Asks. No product-roadmap recommendations.`;

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
    throw new Error(`${init.method ?? "GET"} ${pathname} → ${response.status}: ${text}`);
  }
  return body;
}

function contentToText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(contentToText).join("");
  if (value && typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (typeof value.content === "string") return value.content;
    if (Array.isArray(value.content)) return contentToText(value.content);
  }
  return "";
}

function extractEventText(parsed) {
  const candidates = [parsed, parsed?.data, parsed?.event, parsed?.data?.event, parsed?.data?.data].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate?.type === "model.message.delta" || candidate?.type === "model.message") {
      const text =
        contentToText(candidate.content) ||
        contentToText(candidate.text) ||
        contentToText(candidate.message);
      if (text) return text;
    }
  }
  return "";
}

function parseSseData(block) {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data || data === "[DONE]") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
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
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
    },
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
  let rawStream = "";
  let output = "";

  for await (const chunk of response.body) {
    const decoded = decoder.decode(chunk, { stream: true });
    rawStream += decoded;
    buffer += decoded;
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const parsed = parseSseData(part);
      if (!parsed) continue;
      const piece = extractEventText(parsed);
      if (piece) {
        output += piece;
        process.stdout.write(piece);
      }
      const event = parsed?.data?.event ?? parsed?.event ?? parsed?.data ?? parsed;
      if (event?.type === "sandbox.created" || event?.type === "sandbox.provisioned") {
        process.stderr.write("\n[sandbox] provisioned\n");
      }
      if (event?.type === "tool.call") {
        process.stderr.write(`\n[tool] ${event.name ?? event.tool ?? "unknown"}\n`);
      }
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(RAW_STREAM_PATH, rawStream, "utf8");
  fs.writeFileSync(OUTPUT_PATH, output, "utf8");
  console.error(`\nWrote ${OUTPUT_PATH} (${output.length} chars)`);
  console.error(`Wrote raw SSE to ${RAW_STREAM_PATH} (${rawStream.length} chars)`);

  if (!output.trim()) {
    throw new Error(
      "TrueForge returned no assistant text. Inspect analysis/pipeline_last_run.sse.txt or use the TrueForge UI.",
    );
  }
  if (!output.includes('"type": "scored_reviews"')) {
    throw new Error("Assistant output is missing scored_reviews.");
  }
  if (!output.includes('"type": "cluster_results"')) {
    throw new Error("Assistant output is missing cluster_results.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});