import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractResonanceStream } from "../lib/resonance-parse.ts";
import {
  dominantEmotion,
  meanPlutchik,
  resolveAverageScores,
  toRadarPoints,
} from "../lib/plutchik.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(ROOT, "public/demo/day4_stream_fixture.txt");

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const raw = fs.readFileSync(FIXTURE, "utf8");
const firstClose = raw.indexOf("```", raw.indexOf("```resonance-data") + 3);
if (firstClose < 0) fail("could not find first closing fence");

const scoredOnly = extractResonanceStream(raw.slice(0, firstClose + 3));
const scoredScores = resolveAverageScores(scoredOnly);
if (!scoredScores) fail("scored-only buffer did not produce averages");
if (!scoredOnly.scored) fail("scored-only buffer missing scored_reviews");
if (scoredOnly.analysis) fail("scored-only buffer should not include analysis_result");

const manual = meanPlutchik(scoredOnly.scored.reviews);
for (const key of Object.keys(manual) as Array<keyof typeof manual>) {
  if (manual[key] !== scoredScores[key]) {
    fail(`mean mismatch for ${key}: ${manual[key]} vs ${scoredScores[key]}`);
  }
}

if (Math.abs(scoredScores.trust - 0.42) > 0.001) {
  fail(`expected trust mean 0.42 from 3 fixture reviews, got ${scoredScores.trust}`);
}
if (dominantEmotion(scoredScores) !== "trust") {
  fail(`expected dominant trust from scored reviews, got ${dominantEmotion(scoredScores)}`);
}

const full = extractResonanceStream(raw);
const analysisScores = resolveAverageScores(full);
if (!analysisScores) fail("full fixture produced no averages");
if (!full.analysis) fail("full fixture missing analysis_result");
if (analysisScores.trust !== full.analysis.emotion_summary.average_scores.trust) {
  fail("full stream should prefer analysis_result averages over the scored mean");
}
if (dominantEmotion(analysisScores) !== "trust") {
  fail(`expected dominant trust from analysis, got ${dominantEmotion(analysisScores)}`);
}

const points = toRadarPoints(analysisScores);
if (points.length !== 8) fail(`expected 8 radar points, got ${points.length}`);
if (points[0].axis !== "Joy" || points[0].key !== "joy") fail("radar point order is wrong");
if (points.some((point) => point.value < 0 || point.value > 1)) {
  fail("radar values must be clamped to 0–1");
}

console.log("PASS");
console.log(
  `scored_mean.trust=${scoredScores.trust} analysis.trust=${analysisScores.trust} dominant=${dominantEmotion(analysisScores)} points=${points.length}`,
);