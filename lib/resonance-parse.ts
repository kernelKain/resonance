import type {
  AnalysisResultPayload,
  ApprovalRequestPayload,
  ActionItemsPayload,
  ClusterResultsPayload,
  ResonancePayload,
  ScoredReviewsPayload,
} from "@/lib/resonance-types";

export type ResonancePhase =
  | "idle"
  | "uploading"
  | "running"
  | "awaiting_approval"
  | "done"
  | "error";

export type ResonanceStreamState = {
  scored: ScoredReviewsPayload | null;
  clustered: ClusterResultsPayload | null;
  analysis: AnalysisResultPayload | null;
  approval: ApprovalRequestPayload | null;
  actionItems: ActionItemsPayload | null;
  fenceCount: number;
  parseErrors: string[];
};

export function emptyResonanceStream(): ResonanceStreamState {
  return {
    scored: null,
    clustered: null,
    analysis: null,
    approval: null,
    actionItems: null,
    fenceCount: 0,
    parseErrors: [],
  };
}

function sliceBalancedObject(text: string, start: number): string | null {
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

function isUsablePayload(parsed: ResonancePayload): boolean {
  switch (parsed.type) {
    case "scored_reviews":
      return Array.isArray(parsed.reviews) && typeof parsed.total_reviews === "number";
    case "cluster_results":
      return Array.isArray(parsed.clusters) && typeof parsed.num_clusters === "number";
    case "analysis_result":
      return Array.isArray(parsed.archetypes) && Array.isArray(parsed.hidden_asks);
    case "approval_request":
      return typeof parsed.message === "string" && parsed.message.length > 0;
    case "action_items":
      return Array.isArray(parsed.items);
    default:
      return false;
  }
}

function tryParseObject(text: string): ResonancePayload | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const attempts: string[] = [trimmed];
  const firstBrace = trimmed.indexOf("{");
  if (firstBrace >= 0) {
    const balanced = sliceBalancedObject(trimmed, firstBrace);
    if (balanced && balanced !== trimmed) attempts.push(balanced);
  }

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate) as ResonancePayload;
      if (parsed && typeof parsed === "object" && "type" in parsed) {
        const unwrapped = unwrap(parsed);
        if (isUsablePayload(unwrapped)) return unwrapped;
      }
    } catch {
      // Partial or malformed JSON — ignore this candidate.
    }
  }
  return null;
}

function unwrap(parsed: ResonancePayload): ResonancePayload {
  const nested = (parsed as { data?: unknown }).data;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const inner = nested as Record<string, unknown>;
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
      return { ...(inner as object), type: (inner.type ?? parsed.type) } as ResonancePayload;
    }
  }
  return parsed;
}

function extractFencedPayloads(raw: string): {
  payloads: ResonancePayload[];
  fenceCount: number;
  errors: string[];
} {
  const payloads: ResonancePayload[] = [];
  const errors: string[] = [];
  const fenceRe = /```resonance-data[^\n]*\r?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let fenceCount = 0;

  while ((match = fenceRe.exec(raw)) !== null) {
    fenceCount += 1;
    const parsed = tryParseObject(match[1] ?? "");
    if (parsed) {
      payloads.push(parsed);
    } else {
      errors.push(`fence ${fenceCount}: JSON.parse failed or payload failed shape checks`);
    }
  }

  return { payloads, fenceCount, errors };
}

function extractObjectsByType(raw: string, type: ResonancePayload["type"]): ResonancePayload[] {
  const objects: ResonancePayload[] = [];
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
    if (parsed?.type === type) objects.push(parsed);
    searchFrom = start + jsonText.length;
  }

  return objects;
}

function lastOfType<T extends ResonancePayload>(
  payloads: ResonancePayload[],
  type: T["type"],
): T | null {
  const matches = payloads.filter((item) => item.type === type) as T[];
  return matches.length ? matches[matches.length - 1] : null;
}

export function extractResonanceStream(raw: string): ResonanceStreamState {
  const fenced = extractFencedPayloads(raw);
  const payloads = [...fenced.payloads];

  const needed: ResonancePayload["type"][] = [
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
    scored: lastOfType<ScoredReviewsPayload>(payloads, "scored_reviews"),
    clustered: lastOfType<ClusterResultsPayload>(payloads, "cluster_results"),
    analysis: lastOfType<AnalysisResultPayload>(payloads, "analysis_result"),
    approval: lastOfType<ApprovalRequestPayload>(payloads, "approval_request"),
    actionItems: lastOfType<ActionItemsPayload>(payloads, "action_items"),
    fenceCount: fenced.fenceCount,
    parseErrors: fenced.errors,
  };
}

export function statusTextFromStream(
  stream: ResonanceStreamState,
  phase: ResonancePhase,
  error: string | null,
): string {
  if (phase === "uploading") return "Uploading your reviews…";
  if (phase === "error") return error ?? "Something broke.";
  if (stream.actionItems) {
    return `Recommendations ready: ${stream.actionItems.items.length} action items.`;
  }
  if (phase === "awaiting_approval" || (stream.approval && !stream.actionItems)) {
    return (
      stream.approval?.message ??
      "Analysis paused — approve to generate recommendations."
    );
  }
  if (stream.analysis) {
    const segments = stream.analysis.archetypes?.length ?? 0;
    const asks = stream.analysis.hidden_asks?.length ?? 0;
    return `Found ${segments} customer segments and ${asks} unspoken needs.`;
  }
  if (stream.clustered) {
    return `Identified ${stream.clustered.num_clusters} distinct customer segments.`;
  }
  if (stream.scored) {
    return `Scored ${stream.scored.total_reviews} reviews. Grouping into segments…`;
  }
  if (phase === "running") {
    return "Analyzing reviews — this may take a minute…";
  }
  if (phase === "done") {
    return stream.scored
      ? "Analysis complete."
      : "Analysis finished — no structured data was produced.";
  }
  return "Upload a reviews CSV to begin analysis.";
}