const fs = require('fs');

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

function unwrap(parsed) {
  const nested = parsed.data;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const inner = nested;
    if (
      inner.reviews ||
      inner.clusters ||
      inner.archetypes ||
      inner.hidden_asks ||
      inner.items ||
      inner.type === "scored_reviews" ||
      inner.type === "cluster_results" ||
      inner.type === "analysis_result" ||
      inner.type === "approval_request" ||
      inner.type === "action_items"
    ) {
      return { ...inner, type: (inner.type || parsed.type) };
    }
  }
  return parsed;
}

function tryParseObject(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const attempts = [trimmed];
  const firstBrace = trimmed.indexOf("{");
  if (firstBrace >= 0) {
    const balanced = sliceBalancedObject(trimmed, firstBrace);
    if (balanced && balanced !== trimmed) attempts.push(balanced);
  }

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && "type" in parsed) {
        return unwrap(parsed);
      }
    } catch (e) {
      // Partial or malformed JSON — ignore this candidate.
    }
  }
  return null;
}

function extractFencedPayloads(raw) {
  const payloads = [];
  const errors = [];
  const fenceRe = /```resonance-data[^\n]*\r?\n([\s\S]*?)```/g;
  let match;
  let fenceCount = 0;

  while ((match = fenceRe.exec(raw)) !== null) {
    fenceCount += 1;
    const parsed = tryParseObject(match[1] || "");
    if (parsed) {
      payloads.push(parsed);
    } else {
      errors.push(`fence ${fenceCount}: JSON.parse failed`);
    }
  }

  return { payloads, fenceCount, errors };
}

const text = fs.readFileSync("public/demo/stream_fixture.txt", "utf8");
console.log(JSON.stringify(extractFencedPayloads(text), null, 2));
