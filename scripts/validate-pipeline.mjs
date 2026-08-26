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

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function sliceBalancedObject(text, start) {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function extractObjectsByType(raw, type) {
  const objects = [];
  const needle = `"type"`;
  let searchFrom = 0;

  while (searchFrom < raw.length) {
    const typeAt = raw.indexOf(`"type"`, searchFrom);
    if (typeAt === -1) break;

    const around = raw.slice(typeAt, typeAt + 80);
    if (!around.includes(`"${type}"`)) {
      searchFrom = typeAt + needle.length;
      continue;
    }

    let start = typeAt;
    while (start >= 0 && raw[start] !== "{") start -= 1;
    if (start < 0) {
      searchFrom = typeAt + needle.length;
      continue;
    }

    const jsonText = sliceBalancedObject(raw, start);
    if (!jsonText) {
      searchFrom = typeAt + needle.length;
      continue;
    }

    try {
      const parsed = JSON.parse(jsonText);
      if (parsed?.type === type) objects.push(parsed);
    } catch {
      // Keep scanning.
    }
    searchFrom = start + jsonText.length;
  }

  return objects;
}

function unwrap(parsed) {
  if (!parsed || typeof parsed !== "object") return parsed;
  const nested = parsed.data;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    if (
      nested.reviews ||
      nested.clusters ||
      nested.assignments ||
      nested.total_reviews != null ||
      nested.type === "scored_reviews" ||
      nested.type === "cluster_results"
    ) {
      return { type: nested.type ?? parsed.type, ...nested };
    }
  }
  return parsed;
}

const inputPath = process.argv[2];
if (!inputPath) {
  fail("usage: node scripts/validate-pipeline.mjs <agent-output.txt>");
}

const raw = fs.readFileSync(inputPath, "utf8");
if (!raw.trim()) {
  fail(`${inputPath} is empty. Copy the complete assistant message, including both closing fences.`);
}

const scoredList = extractObjectsByType(raw, "scored_reviews").map(unwrap);
const clusteredList = extractObjectsByType(raw, "cluster_results").map(unwrap);

if (!scoredList.length) fail("no scored_reviews object found");
if (!clusteredList.length) {
  fail(
    "no cluster_results object found. If the agent summarized clustering, that is a fail. The second fence must be verbatim cluster.py JSON with algorithm and silhouette_score.",
  );
}

const scored = scoredList[scoredList.length - 1];
const clustered = clusteredList[clusteredList.length - 1];
const errors = [];

if (!Array.isArray(scored.reviews)) {
  errors.push("scored_reviews.reviews is not an array");
} else {
  if (scored.reviews.length !== scored.total_reviews) {
    errors.push(
      `scored total_reviews=${scored.total_reviews} but reviews.length=${scored.reviews.length}`,
    );
  }
  if (scored.reviews.length !== 15) {
    errors.push(
      `expected 15 scored reviews from scoring_fixture.csv, got ${scored.reviews.length}. 18 means sample_reviews.csv was used.`,
    );
  }

  scored.reviews.forEach((review, index) => {
    const label = `reviews[${index}] id=${review.id}`;
    if (typeof review.id !== "number") errors.push(`${label}: id must be a number`);
    if (typeof review.text !== "string" || !review.text.trim()) {
      errors.push(`${label}: text missing`);
    }
    if (!(typeof review.rating === "number" || review.rating === null)) {
      errors.push(`${label}: rating must be number or null`);
    }
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
    if (!dissonance || typeof dissonance.detected !== "boolean") {
      errors.push(`${label}: dissonance.detected missing`);
    } else if (!DISSONANCE.includes(dissonance.type)) {
      errors.push(`${label}: bad dissonance.type ${dissonance.type}`);
    } else if (dissonance.detected === (dissonance.type === "none")) {
      errors.push(
        `${label}: detected=${dissonance.detected} disagrees with type=${dissonance.type}`,
      );
    }
    if (!MASLOW.includes(review.maslow_need)) {
      errors.push(`${label}: bad maslow_need ${review.maslow_need}`);
    }
  });
}

const expectedPath = path.join(ROOT, "demo_data/scoring_fixture.expected.json");
if (fs.existsSync(expectedPath) && scored.reviews?.length === 15) {
  const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"));
  const byText = new Map(
    scored.reviews.map((review) => [String(review.text).trim(), review]),
  );
  for (const text of expected.must_flag_dissonance) {
    const review = byText.get(text);
    if (!review) errors.push(`missing scored review text: ${text}`);
    else if (!review.dissonance.detected) errors.push(`should flag dissonance: ${text}`);
  }
  for (const text of expected.must_not_flag_dissonance) {
    const review = byText.get(text);
    if (!review) errors.push(`missing scored review text: ${text}`);
    else if (review.dissonance.detected) {
      errors.push(`should NOT flag rave: ${text} (type=${review.dissonance.type})`);
    }
  }
  for (const [text, need] of Object.entries(expected.must_maslow)) {
    const review = byText.get(text);
    if (!review) errors.push(`missing scored review text: ${text}`);
    else if (review.maslow_need !== need) {
      errors.push(`maslow for "${text}" was ${review.maslow_need}, expected ${need}`);
    }
  }
}

if (clustered.algorithm !== "kmeans") {
  errors.push(
    `algorithm is ${JSON.stringify(clustered.algorithm)}. Keys: ${Object.keys(clustered).join(", ")}. This must be verbatim cluster.py output.`,
  );
}
if (
  !Array.isArray(clustered.feature_order) ||
  clustered.feature_order.join(",") !== EMOTIONS.join(",")
) {
  errors.push(`feature_order must be ${EMOTIONS.join(", ")}`);
}
if (clustered.total_reviews !== scored.total_reviews) {
  errors.push(
    `cluster total_reviews=${clustered.total_reviews} != scored ${scored.total_reviews}`,
  );
}
if ((scored.reviews?.length ?? 0) >= 4) {
  if (clustered.num_clusters < 3 || clustered.num_clusters > 5) {
    errors.push(`num_clusters=${clustered.num_clusters} is outside 3–5`);
  }
}
if (typeof clustered.silhouette_score !== "number") {
  errors.push(
    `silhouette_score is not a number. Keys: ${Object.keys(clustered).join(", ")}. The agent summarized instead of returning cluster.py JSON.`,
  );
}
if (!Array.isArray(clustered.clusters) || clustered.clusters.length !== clustered.num_clusters) {
  errors.push("clusters.length must equal num_clusters");
}
if (
  !Array.isArray(clustered.assignments) ||
  clustered.assignments.length !== clustered.total_reviews
) {
  errors.push("assignments.length must equal total_reviews");
}

const scoredIds = new Set((scored.reviews ?? []).map((review) => review.id));
const assigned = new Map();
for (const row of clustered.assignments ?? []) {
  if (typeof row.id !== "number" || typeof row.cluster_id !== "number") {
    errors.push(`bad assignment ${JSON.stringify(row)}`);
    continue;
  }
  if (assigned.has(row.id)) errors.push(`duplicate assignment for id=${row.id}`);
  assigned.set(row.id, row.cluster_id);
  if (!scoredIds.has(row.id)) {
    errors.push(`assignment id=${row.id} was not in scored_reviews`);
  }
}
for (const id of scoredIds) {
  if (!assigned.has(id)) errors.push(`missing cluster assignment for scored id=${id}`);
}

let sizeSum = 0;
for (const cluster of clustered.clusters ?? []) {
  const label = `cluster ${cluster.id}`;
  const memberIds = Array.isArray(cluster.member_ids)
    ? cluster.member_ids
    : (clustered.assignments ?? [])
        .filter((row) => row.cluster_id === cluster.id)
        .map((row) => row.id);
  const size = cluster.size ?? memberIds.length;
  sizeSum += size;
  if (size !== memberIds.length) {
    errors.push(`${label}: size=${size} but member_ids.length=${memberIds.length}`);
  }
  for (const emotion of EMOTIONS) {
    const value = cluster.centroid?.[emotion];
    if (typeof value !== "number" || value < 0 || value > 1) {
      errors.push(`${label}: centroid.${emotion}=${value}`);
    }
  }
  const reps = cluster.representative_review_ids ?? [];
  if (reps.length < 1 || reps.length > 3) {
    errors.push(`${label}: representative_review_ids must have 1–3 ids`);
  }
  for (const id of reps) {
    if (!memberIds.includes(id)) {
      errors.push(`${label}: representative ${id} is not a member`);
    }
  }
  for (const id of memberIds) {
    if (assigned.get(id) !== cluster.id) {
      errors.push(`${label}: member ${id} is assigned to cluster ${assigned.get(id)}`);
    }
  }
}
if (clustered.clusters && sizeSum !== clustered.total_reviews) {
  errors.push(`sum of cluster sizes is ${sizeSum}, expected ${clustered.total_reviews}`);
}

const lower = raw.toLowerCase();
if (lower.includes("frustrated loyalists") || lower.includes("hidden ask")) {
  errors.push("turn named archetypes or Hidden Asks — that is Step 4, not Step 3");
}

if (errors.length) {
  fail(errors.join("\n"));
}

const flagged = scored.reviews.filter((review) => review.dissonance.detected).length;
console.log("PASS");
console.log(
  `scored=${scored.reviews.length} dissonance_flagged=${flagged} k=${clustered.num_clusters} silhouette=${clustered.silhouette_score}`,
);
console.log(`product_name=${scored.product_name}`);