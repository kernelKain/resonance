import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENT = path.join(ROOT, "agent.json");

const COMPACT = `=== COMPACT OUTPUT (LIVE DEMO) ===
Every resonance-data fence must contain compact JSON: no pretty-print indentation. product_context is at most 400 characters. emotion_summary is at most 6 words. dissonance.explanation is one short sentence. analysis_result.scored_reviews MUST be [] and analysis_result.cluster_results MUST be {}. Do not repeat the full review list in fence 3.`;

const spec = JSON.parse(fs.readFileSync(AGENT, "utf8"));
spec.model = spec.model ?? {};
spec.model.params = spec.model.params ?? {};
spec.model.params.max_tokens = 32768;
spec.config = spec.config ?? {};
spec.config.iteration_limit = 120;

let instructions = String(spec.instructions ?? "");
const before = instructions;

if (!instructions.includes("COMPACT OUTPUT (LIVE DEMO)")) {
  const needle =
    "so a transcript reader can see TrueForge doing the work.\n\n=== PLUTCHIK SCORING ===";
  if (!instructions.includes(needle)) {
    throw new Error(
      "agent.json instructions did not contain the expected PLUTCHIK marker. Do not continue — paste the file contents of agent.json.",
    );
  }
  instructions = instructions.replace(
    needle,
    `so a transcript reader can see TrueForge doing the work.\n\n${COMPACT}\n\n=== PLUTCHIK SCORING ===`,
  );
}

instructions = instructions.replace(
  "To avoid truncation, prefer leaving scored_reviews as [] and cluster_results as {} inside this object.",
  "To avoid truncation, scored_reviews MUST be [] and cluster_results MUST be {} inside this object.",
);

instructions = instructions.replace(
  "4. Emit the scored_reviews payload exactly as specified in OUTPUT CONTRACT (first resonance-data fence).",
  "4. Emit the scored_reviews payload exactly as specified in OUTPUT CONTRACT (first resonance-data fence). Compact JSON only — no pretty-print.",
);

if (instructions === before && !instructions.includes("COMPACT OUTPUT (LIVE DEMO)")) {
  throw new Error("agent.json was not patched.");
}

spec.instructions = instructions;
fs.writeFileSync(AGENT, `${JSON.stringify(spec, null, 2)}\n`);
console.log("agent.json patched: max_tokens=32768 iteration_limit=120 compact_output=yes");