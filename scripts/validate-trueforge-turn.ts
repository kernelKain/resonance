import {
  applyTurnEvent,
  pendingFromResponseRequired,
  type TurnIngest,
} from "../lib/trueforge-events";
import { buildTurnInput } from "../lib/trueforge-turn";

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const messageInput = buildTurnInput({
  sessionId: "sess-1",
  message: "HITL_SMOKE. Pause for approval.",
});
if (messageInput.length !== 1 || messageInput[0].type !== "user.message") {
  fail("user.message input was not built");
}

const resumeInput = buildTurnInput({
  sessionId: "sess-1",
  toolResponse: {
    threadId: "main",
    toolCallId: "call_ask_1",
    content: "Approved",
  },
});
if (resumeInput.length !== 1 || resumeInput[0].type !== "user.tool_response") {
  fail("user.tool_response input was not built");
}
if (resumeInput[0].type === "user.tool_response") {
  if (resumeInput[0].thread_id !== "main") fail("thread_id must be snake_case for HTTP");
  if (resumeInput[0].tool_call_id !== "call_ask_1") fail("tool_call_id missing");
  if (resumeInput[0].content !== "Approved") fail("content must be Approved");
}

try {
  buildTurnInput({
    message: "hello",
    toolResponse: { threadId: "main", toolCallId: "x", content: "Approved" },
  });
  fail("mixed message + toolResponse must throw");
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes("Cannot mix")) {
    fail(`wrong mix error: ${String(error)}`);
  }
}

try {
  buildTurnInput({ sessionId: "sess-1" });
  fail("empty turn must throw");
} catch (error) {
  if (!(error instanceof Error)) fail("empty turn must throw an Error");
}

const required = {
  type: "tool.response_required",
  thread_id: "main",
  tool_calls: [{ id: "call_ask_1", source_event_id: "msg-9" }],
};
const messages = new Map<string, Record<string, unknown>>([
  [
    "msg-9",
    {
      type: "model.message",
      id: "msg-9",
      tool_calls: [
        {
          id: "call_ask_1",
          function: {
            name: "ask_user_question",
            arguments: JSON.stringify({
              question: "I found 3 Hidden Asks in this analysis. Shall I generate product-roadmap recommendations?",
              options: ["Approved", "Decline"],
            }),
          },
        },
      ],
    },
  ],
]);

const pending = pendingFromResponseRequired(required, messages);
if (!pending) fail("did not parse tool.response_required");
if (pending.toolCallId !== "call_ask_1") fail("toolCallId wrong");
if (pending.options.join(",") !== "Approved,Decline") fail("options wrong");

const camel = pendingFromResponseRequired(
  {
    type: "tool.response_required",
    threadId: "main",
    toolCalls: [{ id: "call_camel", sourceEventId: "missing" }],
  },
  new Map(),
);
if (!camel || camel.toolCallId !== "call_camel") fail("camelCase toolCalls not accepted");

let ingest: TurnIngest = { pending: null, paused: false };
ingest = applyTurnEvent(required, messages, ingest);
if (!ingest.paused) fail("tool.response_required must pause the turn");
if (ingest.pending?.toolCallId !== "call_ask_1") fail("pending not stored");

ingest = applyTurnEvent(
  {
    type: "turn.done",
    state: {
      status: "done",
      output: null,
      required_actions: [
        {
          type: "tool.response_required",
          thread_id: "main",
          tool_calls: [{ id: "call_from_done" }],
        },
      ],
    },
  },
  new Map(),
  { pending: null, paused: false },
);
if (!ingest.paused || ingest.pending?.toolCallId !== "call_from_done") {
  fail("turn.done.required_actions must pause");
}

console.log("TURN_INPUT_PASS");
console.log("resume_type=user.tool_response");
console.log("resume_content=Approved");