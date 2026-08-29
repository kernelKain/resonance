import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function readJson(relPath) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) fail(`missing ${relPath}`);
  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch (error) {
    fail(`${relPath} is not valid JSON: ${error.message}`);
  }
}

const errors = [];
const agent = readJson("agent.json");
const pkg = readJson("package.json");
const approvalExample = readJson("schemas/approval-request.example.json");
const actionExample = readJson("schemas/action-items.example.json");
readJson("schemas/approval-request.schema.json");
readJson("schemas/action-items.schema.json");

const instructions = agent.instructions ?? "";
if (typeof instructions !== "string" || !instructions.trim()) {
  errors.push("agent.json instructions missing");
}

const mustContain = [
  "DAY 5 PROTOCOL",
  "ask_user_question",
  "approval_request",
  "action_items",
  "HITL_SMOKE",
  "Approved",
  "Decline",
  "fourth resonance-data fence",
  "fifth resonance-data fence",
];

for (const needle of mustContain) {
  if (!instructions.includes(needle)) {
    errors.push(`agent.json instructions missing ${JSON.stringify(needle)}`);
  }
}

const mustNotContain = [
  "DAY 3 PROTOCOL",
  "The human-approval gate is a later day",
  "Do not emit type approval_request",
  "Do not emit a fourth resonance-data fence",
];

for (const needle of mustNotContain) {
  if (instructions.includes(needle)) {
    errors.push(`agent.json instructions still contains ${JSON.stringify(needle)}`);
  }
}

if (agent.config?.ask_user_questions?.enabled !== true) {
  errors.push("config.ask_user_questions.enabled must be true");
}

if (agent.config?.sandbox?.enabled !== true) {
  errors.push("config.sandbox.enabled must be true");
}

const filesystem = (agent.mcp_servers ?? []).find((server) => server.name === "filesystem");
if (!filesystem) {
  errors.push("filesystem MCP server missing");
} else if (
  !Array.isArray(filesystem.require_approval_for_tools) ||
  filesystem.require_approval_for_tools.length !== 0
) {
  errors.push(
    "filesystem.require_approval_for_tools must be [] so write_analysis_file does not pause scoring",
  );
}

if (pkg.scripts?.["test:hitl"] !== "node scripts/validate-hitl-protocol.mjs") {
  errors.push("package.json scripts.test:hitl must run scripts/validate-hitl-protocol.mjs");
}

if (approvalExample.type !== "approval_request") {
  errors.push("approval-request.example.json type must be approval_request");
}
if (typeof approvalExample.message !== "string" || !approvalExample.message.trim()) {
  errors.push("approval-request.example.json message missing");
}
if (approvalExample.hidden_ask_count !== 3) {
  errors.push("approval-request.example.json hidden_ask_count must be 3");
}

if (actionExample.type !== "action_items") {
  errors.push("action-items.example.json type must be action_items");
}
if (!Array.isArray(actionExample.items) || actionExample.items.length !== 3) {
  errors.push("action-items.example.json must have exactly 3 items");
}

const allowedPriority = new Set(["high", "medium", "low"]);
const allowedEffort = new Set(["S", "M", "L"]);
const expectedTitles = [
  "Acknowledgement of quiet loyalty",
  "A place to ask naive questions",
  "Recoverability they can trust",
];

(actionExample.items ?? []).forEach((item, index) => {
  const label = `action_items.items[${index}]`;
  if (item.hidden_ask !== expectedTitles[index]) {
    errors.push(`${label}: hidden_ask must be ${JSON.stringify(expectedTitles[index])}`);
  }
  if (typeof item.recommendation !== "string" || item.recommendation.length < 20) {
    errors.push(`${label}: recommendation too short`);
  }
  if (!allowedPriority.has(item.priority)) {
    errors.push(`${label}: bad priority ${item.priority}`);
  }
  if (!allowedEffort.has(item.effort)) {
    errors.push(`${label}: bad effort ${item.effort}`);
  }
});

if (errors.length) {
  fail(errors.join("\n"));
}

console.log("HITL_PROTOCOL_PASS");
console.log("ask_user_questions.enabled=true");
console.log("filesystem.require_approval_for_tools=[]");
console.log("smoke_token=HITL_SMOKE");