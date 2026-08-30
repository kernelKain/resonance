import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractResonanceStream, estimateAnalysisMinutes, statusTextFromStream } from "../lib/resonance-parse";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(ROOT, "public/demo/stream_fixture.txt");

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const raw = fs.readFileSync(FIXTURE, "utf8");
if (!raw.includes("```resonance-data")) {
  fail("fixture is missing resonance-data fences");
}

const complete = extractResonanceStream(raw);
if (!complete.scored) fail("full fixture did not yield scored_reviews");
if (!complete.clustered) fail("full fixture did not yield cluster_results");
if (!complete.analysis) fail("full fixture did not yield analysis_result");
if (complete.scored.total_reviews !== 3) fail(`expected 3 scored reviews, got ${complete.scored.total_reviews}`);
if (complete.clustered.num_clusters !== 3) fail("expected k=3");
if (complete.analysis.archetypes.length !== 3) fail("expected 3 archetypes");
if (complete.analysis.hidden_asks.length !== 3) fail("expected 3 hidden asks");
if (complete.fenceCount !== 3) fail(`expected 3 complete fences, got ${complete.fenceCount}`);
if (complete.parseErrors.length) fail(`unexpected parse errors: ${complete.parseErrors.join("; ")}`);

let scoredAt = -1;
let clusteredAt = -1;
let analysisAt = -1;
const chunk = 17;
for (let i = chunk; i <= raw.length; i += chunk) {
  const state = extractResonanceStream(raw.slice(0, i));
  if (state.scored && scoredAt < 0) scoredAt = i;
  if (state.clustered && clusteredAt < 0) clusteredAt = i;
  if (state.analysis && analysisAt < 0) analysisAt = i;
}

if (scoredAt < 0 || clusteredAt < 0 || analysisAt < 0) {
  fail("chunked parse never reached all three payloads");
}
if (!(scoredAt < clusteredAt && clusteredAt < analysisAt)) {
  fail(`payloads appeared out of order: scored@${scoredAt} clustered@${clusteredAt} analysis@${analysisAt}`);
}

const firstFenceClose = raw.indexOf("```", raw.indexOf("```resonance-data") + 3);
if (scoredAt <= firstFenceClose) {
  fail("scored_reviews appeared before the first fence closed — parser is reading partial JSON");
}

const truncated = extractResonanceStream(`${raw}\n\`\`\`resonance-data\n{"type": "scored_reviews"`);
if (!truncated.scored) fail("truncated trailing fence wiped scored_reviews");
if (truncated.scored.total_reviews !== 3) fail("truncated fence replaced a good payload");

const broken = extractResonanceStream("```resonance-data\n{not json}\n```\n");
if (broken.scored) fail("malformed fence should not produce scored_reviews");
if (!broken.parseErrors.length) fail("malformed fence should record a parse error");

const unfenced = extractResonanceStream(
  `prefix {"type":"scored_reviews","product_name":"Linear","product_context":"ctx","total_reviews":1,"reviews":[]} suffix`,
);
if (!unfenced.scored) fail("fallback extractor missed an unfenced scored_reviews object");

const stubAnalysis = extractResonanceStream('```resonance-data\n{"type":"analysis_result"}\n```\n');
if (stubAnalysis.analysis) fail("stub analysis_result must not enter stream state");
if (!stubAnalysis.parseErrors.length) fail("stub analysis_result must record a parse error");
try {
  statusTextFromStream(stubAnalysis, "running", null);
} catch (error) {
  fail(`statusTextFromStream threw on stub analysis: ${error}`);
}

const stubScored = extractResonanceStream(
  '```resonance-data\n{"type":"scored_reviews","total_reviews":2}\n```\n',
);
if (stubScored.scored) fail("scored_reviews without reviews[] must not enter stream state");

if (estimateAnalysisMinutes(15) < 1) fail("ETA for 15 reviews must be at least 1 minute");
if (estimateAnalysisMinutes(50) < estimateAnalysisMinutes(15)) {
  fail("ETA for 50 reviews must be longer than for 15");
}
const fifty = statusTextFromStream(stubAnalysis, "running", null, 50);
if (!fifty.includes("minutes")) fail(`50-review ETA should mention minutes, got: ${fifty}`);

console.log("PASS");
console.log(
  `fences=${complete.fenceCount} scored=${complete.scored.total_reviews} k=${complete.clustered.num_clusters} archetypes=${complete.analysis.archetypes.length} hidden_asks=${complete.analysis.hidden_asks.length}`,
);
console.log(`chunk_order scored@${scoredAt} clustered@${clusteredAt} analysis@${analysisAt}`);