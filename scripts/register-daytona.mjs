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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const apiKey = process.env.DAYTONA_API_KEY;
if (!apiKey) {
  console.error(
    "DAYTONA_API_KEY is empty. Put it in .env.local (no quotes), then re-run:\n  node scripts/register-daytona.mjs",
  );
  process.exit(1);
}

const execTimeout = Number(process.env.TRUEFORGE_SANDBOX_EXEC_TIMEOUT_MS ?? 300000);

const saved = await tf("/api/v1/settings/sandbox-providers", {
  method: "PUT",
  body: JSON.stringify({
    manifest: {
      type: "daytona",
      auth: { api_key: apiKey },
      exec_timeout_ms: execTimeout,
      auto_stop_interval_in_minutes: 15,
      auto_archive_interval_in_minutes: 60,
      auto_delete_interval_in_minutes: 7200,
    },
  }),
});

console.log(
  `Daytona provider saved. initial_status=${saved.data?.status ?? "unknown"} timeout_ms=${execTimeout}`,
);
console.log("Waiting for snapshot status=ready (first build can take several minutes)…");

let last = saved;
for (let attempt = 1; attempt <= 36; attempt += 1) {
  last = await tf("/api/v1/settings/sandbox-providers");
  const status = last.data?.status ?? "unknown";
  const reason = last.data?.status_reason ?? "";
  console.log(`poll ${attempt} status=${status}${reason ? ` reason=${reason}` : ""}`);
  if (status === "ready") {
    const manifest = last.data?.manifest ?? {};
    const redacted = manifest.auth?.api_key ?? "";
    if (apiKey && redacted.includes(apiKey)) {
      throw new Error("Sandbox provider response leaked the raw Daytona key. Stop and rotate the key.");
    }
    console.log("Sandbox provider is ready.");
    console.log("Open http://127.0.0.1:8790 → Settings → Sandbox providers to confirm Daytona is configured.");
    process.exit(0);
  }
  if (status === "failed") {
    throw new Error(`Daytona snapshot build failed: ${reason || "no status_reason"}`);
  }
  await sleep(10000);
}

throw new Error(
  `Timed out waiting for sandbox status=ready. Last status=${last.data?.status} reason=${last.data?.status_reason ?? ""}`,
);