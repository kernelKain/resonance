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

function extractJsonObject(text) {
  const marker = text.search(/"type"\s*:\s*"cluster_results"/);
  if (marker === -1) {
    const first = text.indexOf("{");
    if (first === -1) return null;
    return sliceBalancedObject(text, first);
  }
  let start = marker;
  while (start >= 0 && text[start] !== "{") start -= 1;
  if (start < 0) return null;
  return sliceBalancedObject(text, start);
}

function extractPayload(raw) {
  const fenceOpen = raw.match(/```(?:resonance-data|json)[^\n]*\n?/);
  if (fenceOpen) {
    const innerStart = fenceOpen.index + fenceOpen[0].length;
    const rest = raw.slice(innerStart);
    const closeAt = rest.indexOf("```");
    const inner = (closeAt === -1 ? rest : rest.slice(0, closeAt)).trim();
    const fromFence = extractJsonObject(inner) ?? inner;
    return {
      jsonText: fromFence,
      unclosedFence: closeAt === -1,
      truncatedObject: Boolean(inner) && extractJsonObject(inner) === null,
    };
  }

  const naked = extractJsonObject(raw);
  return {
    jsonText: naked ?? raw.trim(),
    unclosedFence: false,
    truncatedObject: naked === null && raw.includes("{"),
  };
}

function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function unwrap(parsed) {
  if (!parsed || typeof parsed !== "object") return parsed;

  const nested = parsed.data;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const nestedLooksLikeResults =
      nested.clusters != null ||
      nested.assignments != null ||
      nested.total_reviews != null ||
      nested.num_clusters != null ||
      nested.type === "cluster_results";

    if (nestedLooksLikeResults) {
      return {
        type: nested.type ?? parsed.type,
        ...nested,
      };
    }
  }

  return parsed;
}

function normalizePayload(payload) {
  const clusters = Array.isArray(payload.clusters) ? payload.clusters : [];
  let assignments = Array.isArray(payload.assignments) ? payload.assignments : [];

  if (assignments.length === 0) {
    for (const cluster of clusters) {
      const members = cluster.member_ids ?? cluster.members ?? cluster.review_ids ?? [];
      for (const id of members) {
        assignments.push({ id, cluster_id: cluster.id });
      }
    }
  }

  assignments = assignments.map((row) => {
    if (typeof row === "number") {
      return { id: row, cluster_id: undefined };
    }
    return {
      id: asNumber(row.id ?? row.review_id),
      cluster_id: asNumber(row.cluster_id ?? row.cluster ?? row.label),
    };
  });

  const sizeSum = clusters.reduce((sum, cluster) => {
    const members = cluster.member_ids ?? cluster.members ?? [];
    return sum + (asNumber(cluster.size) ?? members.length ?? 0);
  }, 0);

  const total =
    asNumber(payload.total_reviews) ??
    asNumber(payload.n_reviews) ??
    asNumber(payload.n) ??
    (assignments.length > 0 ? assignments.length : undefined) ??
    (sizeSum > 0 ? sizeSum : undefined);

  const numClusters =
    asNumber(payload.num_clusters) ??
    asNumber(payload.k) ??
    (clusters.length > 0 ? clusters.length : undefined);

  const silhouette =
    asNumber(payload.silhouette_score) ??
    asNumber(payload.silhouette) ??
    asNumber(payload.k_candidates?.[String(numClusters)]);

  return {
    ...payload,
    type: payload.type,
    algorithm: payload.algorithm ?? "kmeans",
    feature_order:
      Array.isArray(payload.feature_order) && payload.feature_order.length
        ? payload.feature_order
        : [...EMOTIONS],
    total_reviews: total,
    num_clusters: numClusters,
    silhouette_score: silhouette,
    k_candidates: payload.k_candidates ?? {},
    clusters,
    assignments,
  };
}

const inputPath = process.argv[2];
if (!inputPath) {
  fail("usage: node scripts/validate-cluster-output.mjs <cluster-output.json>");
}

const raw = fs.readFileSync(inputPath, "utf8");
if (!raw.trim()) {
  fail(`${inputPath} is empty. Re-copy the full assistant message, including the closing fence.`);
}

const extracted = extractPayload(raw);
const jsonText = extracted.jsonText;

let parsed;
try {
  parsed = unwrap(JSON.parse(jsonText));
} catch (error) {
  console.error("--- extract start ---");
  console.error(jsonText.slice(0, 400));
  console.error("--- extract end ---");
  console.error(jsonText.slice(-400));
  if (extracted.unclosedFence) {
    fail(`JSON.parse failed: ${error.message}. The resonance-data fence never closed.`);
  }
  if (extracted.truncatedObject) {
    fail(`JSON.parse failed: ${error.message}. cluster_results JSON is missing a closing brace.`);
  }
  fail(`JSON.parse failed: ${error.message}`);
}

const expectedPath = path.join(ROOT, "demo_data/cluster.expected.json");
if (!fs.existsSync(expectedPath)) {
  fail(`missing ${expectedPath}`);
}
const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"));
const payload = normalizePayload(parsed);

if (payload.type !== "cluster_results") {
  fail(`type is ${JSON.stringify(payload.type)}, expected "cluster_results"`);
}
if (payload.algorithm !== "kmeans") {
  fail(`algorithm is ${JSON.stringify(payload.algorithm)}`);
}
if (payload.feature_order.join(",") !== EMOTIONS.join(",")) {
  fail(`feature_order must be ${EMOTIONS.join(", ")}`);
}

if (payload.total_reviews == null) {
  fail(
    `total_reviews is missing and could not be inferred. Keys after unwrap: ${Object.keys(parsed).join(", ")}`,
  );
}
if (payload.total_reviews !== expected.total_reviews) {
  fail(`total_reviews=${payload.total_reviews}, expected ${expected.total_reviews}`);
}
if (payload.num_clusters == null) {
  fail(
    `num_clusters is missing and could not be inferred. Keys after unwrap: ${Object.keys(parsed).join(", ")}`,
  );
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
  fail(
    `silhouette_score is not a number. Keys after unwrap: ${Object.keys(parsed).join(", ")}`,
  );
}
if (payload.silhouette_score < expected.min_silhouette) {
  fail(
    `silhouette_score=${payload.silhouette_score} is below ${expected.min_silhouette} — vectors may not be clustered`,
  );
}
if (!Array.isArray(payload.clusters) || payload.clusters.length !== payload.num_clusters) {
  fail(
    `clusters.length must equal num_clusters (got clusters=${payload.clusters.length}, k=${payload.num_clusters}). Keys: ${Object.keys(parsed).join(", ")}`,
  );
}
if (!Array.isArray(payload.assignments) || payload.assignments.length !== payload.total_reviews) {
  fail(
    `assignments.length must equal total_reviews (got ${payload.assignments.length} vs ${payload.total_reviews}). Keys: ${Object.keys(parsed).join(", ")}`,
  );
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
  const memberIds = Array.isArray(cluster.member_ids)
    ? cluster.member_ids
    : payload.assignments
        .filter((row) => row.cluster_id === cluster.id)
        .map((row) => row.id);
  cluster.member_ids = memberIds;

  const size = asNumber(cluster.size) ?? memberIds.length;
  cluster.size = size;
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
  if (
    !Array.isArray(cluster.representative_review_ids) ||
    cluster.representative_review_ids.length < 1 ||
    cluster.representative_review_ids.length > 3
  ) {
    errors.push(`${label}: representative_review_ids must have 1–3 ids`);
  }
  for (const id of cluster.representative_review_ids ?? []) {
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