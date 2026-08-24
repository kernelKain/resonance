import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRUEFORGE = process.env.TRUEFORGE_BASE_URL ?? "http://127.0.0.1:8790";

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

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error(
    "GEMINI_API_KEY is empty. Put it in .env.local (no quotes), then re-run:\n  node scripts/register-gemini.mjs",
  );
  process.exit(1);
}

const body = await tf("/api/v1/settings/model-providers", {
  method: "PUT",
  body: JSON.stringify({
    manifest: {
      type: "google-gemini",
      auth: { api_key: apiKey },
      models: [
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
      ],
    },
  }),
});

const name = body.data?.name ?? body.data?.manifest?.type ?? "google-gemini";
console.log(`Gemini provider saved as '${name}'.`);
console.log("Chat model FQN: google-gemini/gemini-3-1-pro-preview");
console.log("Open http://127.0.0.1:8790 → pick that model → send a test message.");