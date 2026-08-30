import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EMOTIONS = [
  "joy",
  "trust",
  "fear",
  "surprise",
  "sadness",
  "disgust",
  "anger",
  "anticipation",
];
const DISSONANCE = [
  "positive_words_negative_emotions",
  "negative_words_positive_emotions",
  "mixed_signals",
  "none",
];
const MASLOW = ["safety", "belonging", "esteem", "self_actualization"];
const ROADMAP_RE =
  /\b(implement|roadmap|consider adding|you should ship|build a feature|add a feature)\b/i;

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function extractFences(raw) {
  const blocks = [];
  const re = /```resonance-data\s*([\s\S]*?)```/g;
  let match;
  while ((match = re.exec(raw))) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

function parseBlock(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error(text.slice(0, 400));
    fail(`${label}: JSON.parse failed: ${error.message}`);
  }
}

const inputPath = process.argv[2];
if (!inputPath) {
  fail("usage: node scripts/validate-insights.mjs <agent-output.txt>");
}

const raw = fs.readFileSync(inputPath, "utf8");
if (!raw.trim()) {
  fail(
    `${inputPath} is empty. Copy the complete assistant message, including all three closing fences. Do not run scripts/run-insights.mjs after you already have a UI copy — it overwrites this file.`,
  );
}

const fences = extractFences(raw);
if (fences.length < 3) {
  fail(
    `expected 3 resonance-data fences, found ${fences.length}. If you only copied cluster_results, also copy scored_reviews and analysis_result. You can stitch from analysis/scored_reviews.json + analysis/cluster_results.json + analysis/full_analysis.json.`,
  );
}

const parsed = fences.map((text, index) => parseBlock(text, `fence[${index}]`));
if (parsed.some((item) => item.type === "approval_request" || item.type === "action_items")) {
  fail("found approval_request or action_items — those belong after the approval gate, not in this step");
}

const scored = parsed.find((item) => item.type === "scored_reviews");
const clustered = parsed.find((item) => item.type === "cluster_results");
const analysis = parsed.find((item) => item.type === "analysis_result");
if (!scored) fail("no fence with type scored_reviews");
if (!clustered) fail("no fence with type cluster_results");
if (!analysis) fail("no fence with type analysis_result");

const errors = [];

if (!Array.isArray(scored.reviews) || scored.reviews.length !== scored.total_reviews) {
  errors.push("scored_reviews.reviews length mismatch");
}
if (scored.reviews?.length === 18) {
  errors.push("18 reviews means sample_reviews.csv was used; need scoring_fixture.csv (15)");
}

scored.reviews.forEach((review, index) => {
  const label = `reviews[${index}] id=${review.id}`;
  if (typeof review.id !== "number" || !review.text) errors.push(`${label}: bad id/text`);
  if (typeof review.plutchik !== "object" || review.plutchik === null) {
    errors.push(`${label}: plutchik missing`);
  } else {
    for (const emotion of EMOTIONS) {
      const value = review.plutchik[emotion];
      if (typeof value !== "number" || value < 0 || value > 1) {
        errors.push(`${label}: plutchik.${emotion}=${value}`);
      }
    }
  }
  const dissonance = review.dissonance;
  if (!dissonance || !DISSONANCE.includes(dissonance.type)) {
    errors.push(`${label}: bad dissonance`);
  } else if (dissonance.detected === (dissonance.type === "none")) {
    errors.push(`${label}: detected disagrees with type`);
  }
  if (!MASLOW.includes(review.maslow_need)) errors.push(`${label}: bad maslow`);
});

const expectedPath = path.join(ROOT, "demo_data/scoring_fixture.expected.json");
if (fs.existsSync(expectedPath) && scored.reviews.length === 15) {
  const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"));
  const byText = new Map(scored.reviews.map((review) => [String(review.text).trim(), review]));
  for (const text of expected.must_flag_dissonance) {
    const review = byText.get(text);
    if (!review) errors.push(`missing scored review: ${text}`);
    else if (!review.dissonance.detected) errors.push(`should flag dissonance: ${text}`);
  }
  for (const text of expected.must_not_flag_dissonance) {
    const review = byText.get(text);
    if (!review) errors.push(`missing scored review: ${text}`);
    else if (review.dissonance.detected) errors.push(`should NOT flag rave: ${text}`);
  }
  for (const [text, need] of Object.entries(expected.must_maslow)) {
    const review = byText.get(text);
    if (!review) errors.push(`missing scored review: ${text}`);
    else if (review.maslow_need !== need) {
      errors.push(`maslow for "${text}" was ${review.maslow_need}, expected ${need}`);
    }
  }
}

if (clustered.algorithm !== "kmeans") errors.push("cluster algorithm is not kmeans");
if (clustered.total_reviews !== scored.total_reviews) {
  errors.push("cluster total_reviews != scored total_reviews");
}
if (!clustered.feature_order) errors.push("cluster_results missing feature_order (not verbatim)");
if (clustered.k_candidates == null) errors.push("cluster_results missing k_candidates (not verbatim)");
if (scored.reviews.length >= 4) {
  if (clustered.num_clusters < 3 || clustered.num_clusters > 5) {
    errors.push(`num_clusters=${clustered.num_clusters} outside 3–5`);
  }
}

const scoredIds = new Set(scored.reviews.map((review) => review.id));
const assigned = new Map();
for (const row of clustered.assignments ?? []) {
  assigned.set(row.id, row.cluster_id);
}
for (const id of scoredIds) {
  if (!assigned.has(id)) errors.push(`missing assignment for id=${id}`);
}

if (analysis.total_reviews !== scored.total_reviews) {
  errors.push("analysis.total_reviews != scored.total_reviews");
}
if (!analysis.product_name || !analysis.product_context) {
  errors.push("analysis missing product_name or product_context");
}

const averages = analysis.emotion_summary?.average_scores ?? {};
for (const emotion of EMOTIONS) {
  const value = averages[emotion];
  if (typeof value !== "number" || value < 0 || value > 1) {
    errors.push(`emotion_summary.average_scores.${emotion}=${value}`);
  }
}
if (!EMOTIONS.includes(analysis.emotion_summary?.dominant_emotion)) {
  errors.push(`bad dominant_emotion ${analysis.emotion_summary?.dominant_emotion}`);
}

const maslowDist = analysis.maslow_distribution ?? {};
const maslowSum = MASLOW.reduce((sum, key) => sum + Number(maslowDist[key] ?? NaN), 0);
if (maslowSum !== analysis.total_reviews) {
  errors.push(`maslow_distribution sums to ${maslowSum}, expected ${analysis.total_reviews}`);
}

const flagged = scored.reviews.filter((review) => review.dissonance.detected);
if (analysis.dissonance_stats?.count !== flagged.length) {
  errors.push(
    `dissonance_stats.count=${analysis.dissonance_stats?.count} but flagged=${flagged.length}`,
  );
}

if (!Array.isArray(analysis.archetypes)) errors.push("archetypes is not an array");
if ((analysis.archetypes ?? []).length !== clustered.num_clusters) {
  errors.push(
    `archetypes.length=${analysis.archetypes?.length} != num_clusters=${clustered.num_clusters}`,
  );
}

const clusterIds = new Set((clustered.clusters ?? []).map((cluster) => cluster.id));
const archetypeNames = new Set();
const quotesAllowed = new Set(scored.reviews.map((review) => String(review.text).trim()));
let archetypeSizeSum = 0;

for (const archetype of analysis.archetypes ?? []) {
  const label = `archetype cluster_id=${archetype.cluster_id} name=${archetype.name}`;
  if (!clusterIds.has(archetype.cluster_id)) {
    errors.push(`${label}: cluster_id not in cluster_results`);
  }
  if (typeof archetype.name !== "string" || /cluster\s*\d/i.test(archetype.name)) {
    errors.push(`${label}: name looks like a generic cluster label`);
  }
  if (typeof archetype.profile !== "string" || archetype.profile.length < 20) {
    errors.push(`${label}: profile too short`);
  }
  const sentences = String(archetype.profile ?? "")
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentences.length < 2) errors.push(`${label}: profile must be two sentences`);
  if (
    !Array.isArray(archetype.dominant_emotions) ||
    archetype.dominant_emotions.length !== 3 ||
    archetype.dominant_emotions.some((emotion) => !EMOTIONS.includes(emotion))
  ) {
    errors.push(`${label}: dominant_emotions must be 3 Plutchik keys`);
  }
  if (!MASLOW.includes(archetype.dominant_maslow_need)) {
    errors.push(`${label}: bad dominant_maslow_need`);
  }
  if (!Array.isArray(archetype.representative_quotes) || archetype.representative_quotes.length < 1) {
    errors.push(`${label}: missing representative_quotes`);
  } else {
    if (archetype.representative_quotes.length > 3) {
      errors.push(`${label}: more than 3 quotes`);
    }
    for (const quote of archetype.representative_quotes) {
      if (!quotesAllowed.has(String(quote).trim())) {
        errors.push(`${label}: quote is not an exact scored review_text: ${quote}`);
      }
    }
  }
  if (typeof archetype.size !== "number" || archetype.size < 1) {
    errors.push(`${label}: bad size`);
  }
  archetypeSizeSum += Number(archetype.size ?? 0);
  archetypeNames.add(archetype.name);
}

if ((analysis.archetypes ?? []).length && archetypeSizeSum !== analysis.total_reviews) {
  errors.push(`archetype sizes sum to ${archetypeSizeSum}, expected ${analysis.total_reviews}`);
}

if (!Array.isArray(analysis.hidden_asks)) errors.push("hidden_asks is not an array");
const askCount = analysis.hidden_asks?.length ?? 0;
if (askCount < 3 || askCount > 5) {
  errors.push(`hidden_asks.length=${askCount}, expected 3–5`);
}

for (const ask of analysis.hidden_asks ?? []) {
  const label = `hidden_ask id=${ask.id} title=${ask.title}`;
  if (typeof ask.title !== "string" || ask.title.length < 3) errors.push(`${label}: bad title`);
  if (typeof ask.description !== "string" || ask.description.length < 20) {
    errors.push(`${label}: description too short`);
  }
  if (!archetypeNames.has(ask.evidence_archetype)) {
    errors.push(`${label}: evidence_archetype is not an archetype name`);
  }
  if (!MASLOW.includes(ask.maslow_need)) errors.push(`${label}: bad maslow_need`);
  if (!["high", "medium", "low"].includes(ask.confidence)) {
    errors.push(`${label}: bad confidence`);
  }
  if (ask.action_items !== null) {
    errors.push(`${label}: action_items must be null, got ${JSON.stringify(ask.action_items)}`);
  }
  if (ROADMAP_RE.test(`${ask.title} ${ask.description}`)) {
    errors.push(`${label}: sounds like a roadmap recommendation`);
  }
}

if (Array.isArray(analysis.scored_reviews) && analysis.scored_reviews.length) {
  if (analysis.scored_reviews.length !== scored.reviews.length) {
    errors.push("analysis.scored_reviews length differs from fence 1");
  }
}

if (errors.length) {
  fail(errors.join("\n"));
}

console.log("PASS");
console.log(
  `scored=${scored.reviews.length} k=${clustered.num_clusters} archetypes=${analysis.archetypes.length} hidden_asks=${analysis.hidden_asks.length} dissonance=${analysis.dissonance_stats.count}`,
);
console.log(`product_name=${analysis.product_name}`);
console.log(`archetypes=${analysis.archetypes.map((item) => item.name).join(" | ")}`);