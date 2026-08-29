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

function extractObjectsByType(raw, type) {
  const objects = [];
  const needle = `"type"`;
  let searchFrom = 0;

  while (searchFrom < raw.length) {
    const typeAt = raw.indexOf(needle, searchFrom);
    if (typeAt === -1) break;

    const around = raw.slice(typeAt, typeAt + 80);
    if (!around.includes(`"${type}"`)) {
      searchFrom = typeAt + needle.length;
      continue;
    }

    let start = typeAt;
    while (start >= 0 && raw[start] !== "{") start -= 1;
    if (start < 0) {
      searchFrom = typeAt + needle.length;
      continue;
    }

    const jsonText = sliceBalancedObject(raw, start);
    if (!jsonText) {
      searchFrom = typeAt + needle.length;
      continue;
    }

    const parsed = tryParseObject(jsonText);
    if (parsed && parsed.type === type) objects.push(parsed);
    searchFrom = start + jsonText.length;
  }

  return objects;
}

function lastOfType(payloads, type) {
  const matches = payloads.filter((item) => item.type === type);
  return matches.length ? matches[matches.length - 1] : null;
}

function extractResonanceStream(raw) {
  const fenced = extractFencedPayloads(raw);
  const payloads = [...fenced.payloads];

  const needed = [
    "scored_reviews",
    "cluster_results",
    "analysis_result",
    "approval_request",
    "action_items",
  ];

  for (const type of needed) {
    if (!payloads.some((item) => item.type === type)) {
      payloads.push(...extractObjectsByType(raw, type));
    }
  }

  return {
    scored: lastOfType(payloads, "scored_reviews"),
    clustered: lastOfType(payloads, "cluster_results"),
    analysis: lastOfType(payloads, "analysis_result"),
    approval: lastOfType(payloads, "approval_request"),
    actionItems: lastOfType(payloads, "action_items"),
    fenceCount: fenced.fenceCount,
    parseErrors: fenced.errors,
  };
}

const text = fs.readFileSync("public/demo/stream_fixture.txt", "utf8");
const stream = extractResonanceStream(text);
console.log("scored:", !!stream.scored);
console.log("clustered:", !!stream.clustered);
console.log("analysis:", !!stream.analysis);
