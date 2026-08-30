import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  archetypesWithCentroids,
  dissonanceAlerts,
  emotionBarWidth,
  hiddenAskCards,
} from "../lib/insight-views";
import { extractResonanceStream } from "../lib/resonance-parse";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(ROOT, "public/demo/stream_fixture.txt");

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const raw = fs.readFileSync(FIXTURE, "utf8");
const firstClose = raw.indexOf("```", raw.indexOf("```resonance-data") + 3);
if (firstClose < 0) fail("could not find first closing fence");

const scoredOnly = extractResonanceStream(raw.slice(0, firstClose + 3));
const earlyAlerts = dissonanceAlerts(scoredOnly);
if (earlyAlerts.length !== 2) {
  fail(`expected 2 dissonance alerts after scored_reviews, got ${earlyAlerts.length}`);
}
if (archetypesWithCentroids(scoredOnly).length !== 0) {
  fail("archetypes should stay empty until analysis_result");
}
if (hiddenAskCards(scoredOnly).length !== 0) {
  fail("hidden asks should stay empty until analysis_result");
}

const full = extractResonanceStream(raw);
const archetypes = archetypesWithCentroids(full);
const asks = hiddenAskCards(full);
const alerts = dissonanceAlerts(full);

if (archetypes.length !== 3) fail(`expected 3 archetypes, got ${archetypes.length}`);
if (asks.length !== 3) fail(`expected 3 hidden asks, got ${asks.length}`);
if (alerts.length !== 2) fail(`expected 2 dissonance alerts, got ${alerts.length}`);

const resigned = archetypes.find((item) => item.name === "Resigned Satisfied");
if (!resigned) fail("missing Resigned Satisfied archetype");
const centroid = resigned.centroid;
if (!centroid) fail("Resigned Satisfied has no cluster centroid");
if (resigned.representative_quotes[0] !== "The product is fine, I guess. It works.") {
  fail("archetype quote was paraphrased or missing");
}
if (emotionBarWidth(centroid, "sadness") !== 45) {
  fail(`sadness bar should be 45% for cluster 0, got ${emotionBarWidth(centroid, "sadness")}`);
}

if (!alerts.some((alert) => alert.text.includes("fine, I guess"))) {
  fail("dissonance list missing the resignation review");
}
if (alerts.some((alert) => alert.type === "none")) {
  fail("aligned reviews must not appear in dissonance alerts");
}
if (asks.some((ask) => ask.action_items !== null)) {
  fail("Hidden Asks must keep action_items null until approval");
}

console.log("PASS");
console.log(
  `archetypes=${archetypes.length} hidden_asks=${asks.length} dissonance=${alerts.length} early_dissonance=${earlyAlerts.length}`,
);