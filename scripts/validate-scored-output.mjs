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

function extractPayload(raw) {
  const fence = raw.match(/```resonance-data\s*([\s\S]*?)```/);
  if (fence) {
    return fence[1].trim();
  }
  const generic = raw.match(/```json\s*([\s\S]*?)```/);
  if (generic) {
    console.warn("WARN: found ```json instead of ```resonance-data");
    return generic[1].trim();
  }
  const naked = raw.match(/\{[\s\S]*"type"\s*:\s*"scored_reviews"[\s\S]*\}/);
  if (naked) {
    console.warn("WARN: no fence; parsed a naked scored_reviews object");
    return naked[0];
  }
  return null;
}

function byText(reviews) {
  const map = new Map();
  for (const review of reviews) {
    map.set(String(review.text).trim(), review);
  }
  return map;
}

const inputPath = process.argv[2];
const expectedPathArg = process.argv[3];
if (!inputPath) {
  fail(
    "usage: node scripts/validate-scored-output.mjs <agent-output.txt> [expected.json]",
  );
}

const raw = fs.readFileSync(inputPath, "utf8");
const jsonText = extractPayload(raw);
if (!jsonText) {
  fail("no resonance-data JSON found in the file");
}

let payload;
try {
  payload = JSON.parse(jsonText);
} catch (error) {
  console.error(jsonText.slice(0, 500));
  fail(`JSON.parse failed: ${error.message}`);
}

if (payload.type !== "scored_reviews") {
  fail(`type is ${JSON.stringify(payload.type)}, expected "scored_reviews"`);
}
if (!Array.isArray(payload.reviews)) {
  fail("reviews is not an array");
}
if (payload.reviews.length !== payload.total_reviews) {
  fail(`total_reviews=${payload.total_reviews} but reviews.length=${payload.reviews.length}`);
}

const errors = [];
payload.reviews.forEach((review, index) => {
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
    errors.push(`${label}: detected=${dissonance.detected} disagrees with type=${dissonance.type}`);
  }
  if (!MASLOW.includes(review.maslow_need)) {
    errors.push(`${label}: bad maslow_need ${review.maslow_need}`);
  }
});

if (errors.length) {
  fail(errors.join("\n"));
}

const expectedPath = expectedPathArg
  ? path.resolve(expectedPathArg)
  : path.join(ROOT, "demo_data/scoring_fixture.expected.json");

if (!fs.existsSync(expectedPath)) {
  fail(`expected file not found: ${expectedPath}`);
}

const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"));

if (payload.reviews.length !== expected.total_reviews) {
  fail(`expected ${expected.total_reviews} reviews, got ${payload.reviews.length}`);
}

const reviews = byText(payload.reviews);
const goldFails = [];

for (const text of expected.must_flag_dissonance) {
  const review = reviews.get(text);
  if (!review) {
    goldFails.push(`missing review text: ${text}`);
    continue;
  }
  if (!review.dissonance.detected) {
    goldFails.push(`should flag dissonance: ${text}`);
  }
}

for (const text of expected.must_not_flag_dissonance) {
  const review = reviews.get(text);
  if (!review) {
    goldFails.push(`missing review text: ${text}`);
    continue;
  }
  if (review.dissonance.detected) {
    goldFails.push(`should NOT flag rave: ${text} (type=${review.dissonance.type})`);
  }
}

for (const [text, need] of Object.entries(expected.must_maslow)) {
  const review = reviews.get(text);
  if (!review) {
    goldFails.push(`missing review text: ${text}`);
    continue;
  }
  if (review.maslow_need !== need) {
    goldFails.push(`maslow for "${text}" was ${review.maslow_need}, expected ${need}`);
  }
}

if (goldFails.length) {
  fail(goldFails.join("\n"));
}

const flagged = payload.reviews.filter((review) => review.dissonance.detected).length;
console.log("PASS");
console.log(`reviews=${payload.reviews.length} dissonance_flagged=${flagged}`);
console.log(`product_name=${payload.product_name}`);