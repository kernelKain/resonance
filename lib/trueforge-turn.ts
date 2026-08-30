export type ToolResponseInput = {
  threadId: string;
  toolCallId: string;
  content: string;
};

export type TurnRequest = {
  sessionId?: string;
  agentName?: string;
  message?: string;
  toolResponse?: ToolResponseInput;
};

export type TrueForgeTurnInput =
  | { type: "user.message"; content: string }
  | {
      type: "user.tool_response";
      thread_id: string;
      tool_call_id: string;
      content: string;
    };

export function buildTurnInput(body: TurnRequest): TrueForgeTurnInput[] {
  const message = body.message?.trim() ?? "";
  const toolResponse = body.toolResponse;
  const hasTool =
    Boolean(toolResponse?.toolCallId?.trim()) &&
    Boolean(toolResponse?.content?.trim());

  if (message && hasTool) {
    throw new Error("Cannot mix user.message with user.tool_response in one turn.");
  }

  if (hasTool && toolResponse) {
    return [
      {
        type: "user.tool_response",
        thread_id: toolResponse.threadId.trim() || "main",
        tool_call_id: toolResponse.toolCallId.trim(),
        content: toolResponse.content.trim(),
      },
    ];
  }

  if (!message) {
    throw new Error("message or toolResponse is required.");
  }

  return [{ type: "user.message", content: message }];
}