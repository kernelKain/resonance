import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseCsv, requireReviewTextColumn } from "../lib/csv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEMO = path.join(ROOT, "demo_data/hero_reviews.csv");
const PUBLIC = path.join(ROOT, "public/demo/hero_reviews.csv");
const EXPECTED_ROWS = 54;
const MIN_CHARS = 24;
const MAX_CHARS = 280;

const BUCKETS: { name: string; pattern: RegExp; min: number }[] = [
  {
    name: "frustrated_loyalty",
    pattern:
      /fine|guess|not bad|years|power users|invoice|ignored|defended us|4 stars|roadmap no longer/i,
    min: 8,
  },
  {
    name: "quiet_churn",
    pattern:
      /won't renew|will probably churn|switching costs|cancellation|notion trial|not sure we will be here|justify the renewal|pricing jira/i,
    min: 6,
  },
  {
    name: "safety_anxiety",
    pattern:
      /outage|export nightly|firehose|abandoned in my own backlog|sync glitch|permissions|status page|dropbox|webhook fails|safety problem/i,
    min: 8,
  },
  {
    name: "lonely_onboarding",
    pattern:
      /onboarding was lonely|museum|talking to a wall|unwritten rules|ask for help|no team channel|empty assignee|changelog|shouting into a well/i,
    min: 8,
  },
  {
    name: "genuine_delight",
    pattern:
      /keyboard-first|respects us\. rare|command menu still|look forward to|match how my brain|joy, not a flex|please keep the speed|11 minutes/i,
    min: 6,
  },
  {
    name: "self_actualization",
    pattern:
      /wish it did more|custom workflows|grow with us|blank settings page/i,
    min: 4,
  },
];

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

for (const filePath of [DEMO, PUBLIC]) {
  if (!fs.existsSync(filePath)) fail(`missing ${path.relative(ROOT, filePath)}`);
}

const demoText = fs.readFileSync(DEMO, "utf8");
const publicText = fs.readFileSync(PUBLIC, "utf8");
if (demoText !== publicText) {
  fail("demo_data/hero_reviews.csv and public/demo/hero_reviews.csv differ");
}

const parsed = parseCsv(demoText);
const reviewHeader = requireReviewTextColumn(parsed.headers);
const rows = parsed.rows.filter((row) =>
  Object.values(row).some((value) => value.length > 0),
);

if (rows.length !== EXPECTED_ROWS) {
  fail(`expected ${EXPECTED_ROWS} reviews, got ${rows.length}`);
}

const ids = new Set<string>();
for (const [index, row] of rows.entries()) {
  const text = row[reviewHeader] ?? "";
  const rating = Number(row.rating);
  const author = (row.author ?? "").trim();

  if (text.length < MIN_CHARS) fail(`row ${index + 1} review_text too short`);
  if (text.length > MAX_CHARS) fail(`row ${index + 1} review_text too long (${text.length})`);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    fail(`row ${index + 1} rating must be integer 1–5, got ${row.rating}`);
  }
  if (!author) fail(`row ${index + 1} missing author`);
  if (ids.has(author)) fail(`duplicate author ${author}`);
  ids.add(author);
}

for (const bucket of BUCKETS) {
  const hits = rows.filter((row) => bucket.pattern.test(row[reviewHeader] ?? "")).length;
  if (hits < bucket.min) {
    fail(`${bucket.name} has ${hits} reviews, need at least ${bucket.min}`);
  }
  console.log(`${bucket.name}=${hits}`);
}

const fourStar = rows.filter((row) => row.rating === "4").length;
if (fourStar < 20) fail(`need many 4-star dissonance examples, got ${fourStar}`);

console.log(`rows=${rows.length}`);
console.log(`four_star=${fourStar}`);
console.log("hero_csv=ok");