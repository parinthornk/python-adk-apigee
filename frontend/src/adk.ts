/**
 * Thin client for the ADK API server (`adk api_server`).
 *
 * Endpoints used:
 *   GET  /list-apps
 *   POST /apps/{app}/users/{user}/sessions/{session}
 *   POST /run_sse   (Server-Sent Events)
 *
 * Docs: https://adk.dev/runtime/api-server/
 */

// The dev server talks to a separate `adk api_server`; a production build is
// served by serve.py on the same origin, so relative URLs avoid CORS entirely.
const DEFAULT_BASE_URL = import.meta.env.DEV ? "http://localhost:8000" : "";

export const ADK_BASE_URL = (
  import.meta.env.VITE_ADK_BASE_URL ?? DEFAULT_BASE_URL
).replace(/\/+$/, "");

export const ADK_APP_NAME = import.meta.env.VITE_ADK_APP_NAME || "my_agent";

export interface AdkPart {
  text?: string;
  thought?: boolean;
  functionCall?: {
    id?: string;
    name: string;
    args?: Record<string, unknown>;
  };
  functionResponse?: {
    id?: string;
    name: string;
    response?: unknown;
  };
}

export interface AdkEvent {
  id?: string;
  author?: string;
  invocationId?: string;
  partial?: boolean;
  errorCode?: string;
  errorMessage?: string;
  content?: {
    role?: string;
    parts?: AdkPart[];
  };
}

export interface StreamRequest {
  userId: string;
  sessionId: string;
  text: string;
  signal?: AbortSignal;
  onEvent: (event: AdkEvent) => void;
}

function networkHint(): string {
  const target = ADK_BASE_URL || window.location.origin;

  if (!ADK_BASE_URL) {
    return [
      `Cannot reach the agent API at ${target}.`,
      "",
      "This page is served by serve.py; restart it from the project root:",
      "  .\\.venv\\Scripts\\python.exe serve.py",
    ].join("\n");
  }

  return [
    `Cannot reach the ADK API server at ${target}.`,
    "",
    "Start it from the project root, in a second terminal:",
    `  adk api_server --allow_origins ${window.location.origin} --auto_create_session`,
    "",
    "The --allow_origins value must match this page's origin exactly, otherwise the browser blocks the request.",
  ].join("\n");
}

async function readError(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  let detail = body.trim();

  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && "detail" in parsed) {
      const value = (parsed as { detail: unknown }).detail;
      detail = typeof value === "string" ? value : JSON.stringify(value);
    }
  } catch {
    // Not JSON (e.g. an HTML WAF page) — keep the raw body.
  }

  if (detail.length > 600) detail = `${detail.slice(0, 600)}…`;

  const hints: string[] = [];
  if (response.status === 401 || response.status === 403) {
    hints.push("The gateway rejected the request. Check PTP_LLM_API_KEY in my_agent/.env.");
  } else if (response.status === 404) {
    hints.push(
      `Check that the API server is serving "${ADK_APP_NAME}" and that the base URL is correct.`,
    );
  } else if (response.status >= 500) {
    hints.push("Check the adk api_server terminal output for the underlying error.");
  }
  if (/<html|Security Page/i.test(detail)) {
    hints.push("This looks like a WAF/security page — run from the corporate network or VPN.");
  }

  return [
    `HTTP ${response.status} ${response.statusText}`.trim(),
    detail,
    ...hints,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Returns the app names served by the API server. */
export async function listApps(signal?: AbortSignal): Promise<string[]> {
  let response: Response;
  try {
    response = await fetch(`${ADK_BASE_URL}/list-apps`, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(networkHint());
  }

  if (!response.ok) throw new Error(await readError(response));

  const data: unknown = await response.json().catch(() => []);
  return Array.isArray(data) ? data.map(String) : [];
}

/**
 * Creates a session. Safe to call for an existing session: ADK reports
 * "Session already exists", which we treat as success. This means the UI also
 * works without the server's --auto_create_session flag.
 */
export async function createSession(userId: string, sessionId: string): Promise<void> {
  const url = `${ADK_BASE_URL}/apps/${encodeURIComponent(ADK_APP_NAME)}/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error(networkHint());
  }

  if (response.ok) return;

  const body = await response.text().catch(() => "");
  if (body.includes("already exists")) return;
  throw new Error(`Could not create a session.\n${body || response.statusText}`);
}

/**
 * Sends one user message and forwards every SSE event to `onEvent`.
 *
 * `EventSource` cannot POST, so the stream is read from `fetch` manually.
 * Frames are buffered because a chunk may contain a partial line or several
 * frames at once.
 */
export async function streamTurn({
  userId,
  sessionId,
  text,
  signal,
  onEvent,
}: StreamRequest): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${ADK_BASE_URL}/run_sse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        appName: ADK_APP_NAME,
        userId,
        sessionId,
        newMessage: { role: "user", parts: [{ text }] },
        streaming: true,
      }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(networkHint());
  }

  if (!response.ok) throw new Error(await readError(response));
  if (!response.body) throw new Error("The API server returned an empty response body.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatch = (frame: string) => {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();

    if (!data || data === "[DONE]") return;

    try {
      onEvent(JSON.parse(data) as AdkEvent);
    } catch {
      // Ignore a malformed frame rather than tearing down the whole stream.
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        dispatch(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
    }

    // Flush a final frame that arrived without a trailing blank line.
    buffer = (buffer + decoder.decode()).replace(/\r\n/g, "\n");
    if (buffer.trim()) dispatch(buffer);
  } finally {
    reader.cancel().catch(() => {});
  }
}
