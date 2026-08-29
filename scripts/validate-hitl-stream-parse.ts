import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractResonanceStream, statusTextFromStream } from "../lib/resonance-parse";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(ROOT, "public/demo/day5_stream_fixture.txt");
const MARKER = "<!-- HITL_PAUSE -->";

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const raw = fs.readFileSync(FIXTURE, "utf8");
if (!raw.includes(MARKER)) fail("day5 fixture missing <!-- HITL_PAUSE -->");

const [before, after] = raw.split(MARKER);
if (!before?.trim() || !after?.trim()) fail("fixture did not split into two parts");

const paused = extractResonanceStream(before);
if (!paused.analysis) fail("pre-pause fixture missing analysis_result");
if (!paused.approval) fail("pre-pause fixture missing approval_request");
if (paused.actionItems) fail("pre-pause fixture must not include action_items");
if (paused.approval.hidden_ask_count !== 3) fail("hidden_ask_count must be 3");
if (paused.fenceCount !== 4) fail(`expected 4 fences before pause, got ${paused.fenceCount}`);

const waiting = statusTextFromStream(paused, "awaiting_approval", null);
if (!waiting.toLowerCase().includes("approve")) {
  fail(`awaiting_approval status should mention approval, got: ${waiting}`);
}

const resumed = extractResonanceStream(`${before}\n${after}`);
if (!resumed.actionItems) fail("post-approve fixture missing action_items");
if (resumed.actionItems.items.length !== 3) {
  fail(`expected 3 action items, got ${resumed.actionItems.items.length}`);
}
if (resumed.fenceCount !== 5) fail(`expected 5 fences after approve, got ${resumed.fenceCount}`);
if (resumed.actionItems.items[0].hidden_ask !== "Acknowledgement of quiet loyalty") {
  fail("first action item must match the first Hidden Ask title");
}

const ready = statusTextFromStream(resumed, "done", null);
if (!ready.includes("3")) fail(`done status should mention 3 recommendations, got: ${ready}`);

console.log("HITL_STREAM_PASS");
console.log(`pre_pause_fences=${paused.fenceCount} post_approve_fences=${resumed.fenceCount}`);
console.log(`action_items=${resumed.actionItems.items.length}`);