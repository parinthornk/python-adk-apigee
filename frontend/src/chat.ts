import type { AdkEvent } from "./adk";

export interface ToolStep {
  /** Function call/response id, used to pair the result with the call. */
  key: string;
  name: string;
  args?: unknown;
  result?: unknown;
  status: "running" | "done";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: ToolStep[];
  /** True while the agent is still working on this turn. */
  pending?: boolean;
  error?: string;
  /** True once token-level deltas have been received for this turn. */
  sawPartial?: boolean;
}

export function userMessage(text: string): ChatMessage {
  return { id: crypto.randomUUID(), role: "user", text, tools: [] };
}

export function assistantMessage(): ChatMessage {
  return { id: crypto.randomUUID(), role: "assistant", text: "", tools: [], pending: true };
}

/** Adds remediation for the errors the gateway is most likely to return. */
function withHint(raw: string): string {
  if (/401|InvalidApiKey|FailedToResolveAPIKey/i.test(raw)) {
    return `${raw}\n\nCheck PTP_LLM_API_KEY in my_agent/.env.`;
  }
  return raw;
}

/** Folds one ADK event into the assistant message it belongs to. */
export function applyEvent(message: ChatMessage, event: AdkEvent): ChatMessage {
  if (event.errorMessage || event.errorCode) {
    return {
      ...message,
      pending: false,
      error: withHint(event.errorMessage || event.errorCode || ""),
    };
  }

  const parts = event.content?.parts ?? [];
  if (parts.length === 0) return message;

  let text = message.text;
  let sawPartial = message.sawPartial ?? false;
  let tools = message.tools;

  for (const part of parts) {
    if (part.thought) continue;

    if (part.functionCall) {
      const { id, name, args } = part.functionCall;
      const key = id || `${name}-${tools.length}`;
      const index = tools.findIndex((tool) => tool.key === key);

      tools =
        index >= 0
          ? tools.map((tool, i) => (i === index ? { ...tool, args: args ?? tool.args } : tool))
          : [...tools, { key, name, args, status: "running" }];
      continue;
    }

    if (part.functionResponse) {
      const { id, name, response } = part.functionResponse;
      const byKey = id ? tools.findIndex((tool) => tool.key === id) : -1;
      const index = byKey >= 0 ? byKey : tools.map((tool) => tool.name).lastIndexOf(name);

      tools =
        index >= 0
          ? tools.map((tool, i) =>
              i === index ? { ...tool, result: response, status: "done" } : tool,
            )
          : [...tools, { key: id || name, name, result: response, status: "done" }];
      continue;
    }

    if (part.text) {
      // With streaming enabled ADK emits token deltas and then repeats the
      // completed text in a final aggregate event. Use only one of the two,
      // otherwise every answer shows up twice.
      if (event.partial) {
        text += part.text;
        sawPartial = true;
      } else if (!sawPartial) {
        text += part.text;
      }
    }
  }

  return { ...message, text, tools, sawPartial, pending: false };
}
