import type { ChatMessage } from "../chat";

function pretty(value: unknown): string {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function inline(value: unknown): string {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="row user">
        <div className="bubble user">{message.text}</div>
      </div>
    );
  }

  const waiting = message.pending && !message.text && message.tools.length === 0;

  return (
    <div className="row assistant">
      <div className="avatar" aria-hidden="true">
        AI
      </div>
      <div className="assistant-col">
        {message.tools.map((tool) => (
          <details className="tool" key={tool.key} open={tool.status === "running"}>
            <summary>
              <span className="badge">tool</span>
              <code>
                {tool.name}({inline(tool.args)})
              </code>
              <span className={`tool-status ${tool.status}`}>{tool.status}</span>
            </summary>
            {tool.result !== undefined && <pre>{pretty(tool.result)}</pre>}
          </details>
        ))}

        {waiting && (
          <div className="bubble assistant typing" aria-label="Assistant is thinking">
            <span />
            <span />
            <span />
          </div>
        )}

        {message.text && <div className="bubble assistant">{message.text}</div>}

        {message.error && <div className="error">{message.error}</div>}
      </div>
    </div>
  );
}
