export const REPLAY_TOOL_CALL_ID = "replay";

export type PendingUserQuestion = {
  threadId: string;
  toolCallId: string;
  question: string;
  options: string[];
};

export type TurnIngest = {
  pending: PendingUserQuestion | null;
  paused: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function parseArgs(raw: unknown): { question: string; options: string[] } {
  let parsed: Record<string, unknown> = {};
  if (typeof raw === "string" && raw.trim()) {
    try {
      parsed = asRecord(JSON.parse(raw));
    } catch {
      parsed = {};
    }
  } else {
    parsed = asRecord(raw);
  }

  const options = asArray(parsed.options).filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );

  return {
    question: str(parsed.question, "Shall I generate product-roadmap recommendations?"),
    options: options.length ? options : ["Approved", "Decline"],
  };
}

function toolCallsFrom(event: Record<string, unknown>): Array<Record<string, unknown>> {
  return asArray(event.tool_calls ?? event.toolCalls).map(asRecord);
}

export function pendingFromResponseRequired(
  event: Record<string, unknown>,
  messages: Map<string, Record<string, unknown>>,
): PendingUserQuestion | null {
  const calls = toolCallsFrom(event);
  const first = calls[0];
  const toolCallId = str(first?.id ?? event.tool_call_id ?? event.toolCallId);
  if (!toolCallId) return null;

  const sourceId = str(first?.source_event_id ?? first?.sourceEventId);
  const source = sourceId ? asRecord(messages.get(sourceId)) : {};
  const sourceCalls = toolCallsFrom(source);
  const matched =
    sourceCalls.find((item) => str(item.id) === toolCallId) ?? sourceCalls[0] ?? {};
  const fn = asRecord(matched.function ?? matched);
  const args = parseArgs(fn.arguments ?? matched.arguments ?? event.arguments);

  return {
    threadId: str(event.thread_id ?? event.threadId, "main"),
    toolCallId,
    question: args.question,
    options: args.options,
  };
}

export function applyTurnEvent(
  event: Record<string, unknown>,
  messages: Map<string, Record<string, unknown>>,
  current: TurnIngest,
): TurnIngest {
  const type = str(event.type);
  const id = str(event.id);
  if (type === "model.message" && id) {
    messages.set(id, event);
  }

  if (type === "tool.response_required") {
    const pending = pendingFromResponseRequired(event, messages);
    return { pending: pending ?? current.pending, paused: true };
  }

  if (type === "turn.done") {
    const state = asRecord(event.state);
    const actions = asArray(state.required_actions ?? state.requiredActions);
    for (const action of actions) {
      const row = asRecord(action);
      if (str(row.type) === "tool.response_required") {
        const pending = pendingFromResponseRequired(row, messages);
        return { pending: pending ?? current.pending, paused: true };
      }
    }
  }

  return current;
}

export function replayPendingQuestion(message: string): PendingUserQuestion {
  return {
    threadId: "main",
    toolCallId: REPLAY_TOOL_CALL_ID,
    question: message,
    options: ["Approved", "Decline"],
  };
}