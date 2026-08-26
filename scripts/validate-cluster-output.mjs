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

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function extractPayload(raw) {
  const fence = raw.match(/```(?:resonance-data|json)\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const naked = raw.match(/\{[\s\S]*"type"\s*:\s*"cluster_results"[\s\S]*\}/);
  if (naked) return naked[0];
  return raw.trim();
}

const inputPath = process.argv[2];
if (!inputPath) {
  fail("usage: node scripts/validate-cluster-output.mjs <cluster-output.json>");
}

const raw = fs.readFileSync(inputPath, "utf8");
const jsonText = extractPayload(raw);
let payload;
try {
  payload = JSON.parse(jsonText);
} catch (error) {
  console.error(jsonText.slice(0, 500));
  fail(`JSON.parse failed: ${error.message}`);
}

const expected = JSON.parse(
  fs.readFileSync(path.join(ROOT, "demo_data/day3_cluster.expected.json"), "utf8"),
);

if (payload.type !== "cluster_results") {
  fail(`type is ${JSON.stringify(payload.type)}, expected "cluster_results"`);
}
if (payload.algorithm !== "kmeans") {
  fail(`algorithm is ${JSON.stringify(payload.algorithm)}`);
}
if (!Array.isArray(payload.feature_order) || payload.feature_order.join(",") !== EMOTIONS.join(",")) {
  fail(`feature_order must be ${EMOTIONS.join(", ")}`);
}
if (payload.total_reviews !== expected.total_reviews) {
  fail(`total_reviews=${payload.total_reviews}, expected ${expected.total_reviews}`);
}
if (
  payload.num_clusters < expected.k_min ||
  payload.num_clusters > expected.k_max
) {
  fail(
    `num_clusters=${payload.num_clusters} is outside ${expected.k_min}–${expected.k_max}`,
  );
}
if (typeof payload.silhouette_score !== "number") {
  fail("silhouette_score is not a number");
}
if (payload.silhouette_score < expected.min_silhouette) {
  fail(
    `silhouette_score=${payload.silhouette_score} is below ${expected.min_silhouette} — vectors may not be clustered`,
  );
}
if (!Array.isArray(payload.clusters) || payload.clusters.length !== payload.num_clusters) {
  fail("clusters.length must equal num_clusters");
}
if (!Array.isArray(payload.assignments) || payload.assignments.length !== payload.total_reviews) {
  fail("assignments.length must equal total_reviews");
}

const errors = [];
const assigned = new Map();
for (const row of payload.assignments) {
  if (typeof row.id !== "number" || typeof row.cluster_id !== "number") {
    errors.push(`bad assignment ${JSON.stringify(row)}`);
    continue;
  }
  if (assigned.has(row.id)) errors.push(`duplicate assignment for id=${row.id}`);
  assigned.set(row.id, row.cluster_id);
}

for (const id of expected.review_ids) {
  if (!assigned.has(id)) errors.push(`missing assignment for id=${id}`);
}

let sizeSum = 0;
for (const cluster of payload.clusters) {
  const label = `cluster ${cluster.id}`;
  sizeSum += cluster.size;
  if (cluster.size !== cluster.member_ids.length) {
    errors.push(`${label}: size=${cluster.size} but member_ids.length=${cluster.member_ids.length}`);
  }
  for (const emotion of EMOTIONS) {
    const value = cluster.centroid?.[emotion];
    if (typeof value !== "number" || value < 0 || value > 1) {
      errors.push(`${label}: centroid.${emotion}=${value}`);
    }
  }
  if (
    !Array.isArray(cluster.representative_review_ids) ||
    cluster.representative_review_ids.length < 1 ||
    cluster.representative_review_ids.length > 3
  ) {
    errors.push(`${label}: representative_review_ids must have 1–3 ids`);
  }
  for (const id of cluster.representative_review_ids ?? []) {
    if (!cluster.member_ids.includes(id)) {
      errors.push(`${label}: representative ${id} is not a member`);
    }
  }
  for (const id of cluster.member_ids) {
    if (assigned.get(id) !== cluster.id) {
      errors.push(`${label}: member ${id} is assigned to cluster ${assigned.get(id)}`);
    }
  }
}

if (sizeSum !== payload.total_reviews) {
  errors.push(`sum of cluster sizes is ${sizeSum}, expected ${payload.total_reviews}`);
}

function sameCluster(ids) {
  const clusterIds = ids.map((id) => assigned.get(id));
  return clusterIds.every((value) => value === clusterIds[0]);
}

if (!sameCluster(expected.delight_ids_should_co_cluster)) {
  errors.push(
    `delight reviews ${expected.delight_ids_should_co_cluster.join(", ")} split across clusters`,
  );
}
if (!sameCluster(expected.fear_ids_should_co_cluster)) {
  errors.push(
    `fear reviews ${expected.fear_ids_should_co_cluster.join(", ")} split across clusters`,
  );
}

if (errors.length) {
  fail(errors.join("\n"));
}

console.log("PASS");
console.log(
  `reviews=${payload.total_reviews} k=${payload.num_clusters} silhouette=${payload.silhouette_score}`,
);
console.log(`k_candidates=${JSON.stringify(payload.k_candidates)}`);