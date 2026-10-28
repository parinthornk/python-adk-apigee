import { useCallback, useEffect, useRef, useState } from "react";
import { ADK_APP_NAME, ADK_BASE_URL, createSession, listApps, streamTurn } from "./adk";
import {
  applyEvent,
  assistantMessage,
  userMessage,
  type ChatMessage,
} from "./chat";
import Composer from "./components/Composer";
import MessageBubble from "./components/MessageBubble";

type Connection = "checking" | "online" | "offline";

const SUGGESTIONS = [
  "What time is it in Bangkok?",
  "What time is it in Tokyo and London?",
  "How many hours ahead is Sydney compared to Paris?",
  "What can you do?",
];

function getUserId(): string {
  try {
    const existing = localStorage.getItem("adk.user-id");
    if (existing) return existing;
    const created = `web-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem("adk.user-id", created);
    return created;
  } catch {
    // Storage can be unavailable (private mode); a per-page id is enough.
    return `web-${crypto.randomUUID().slice(0, 8)}`;
  }
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<Connection>("checking");
  const [connectionDetail, setConnectionDetail] = useState("Checking the ADK API server…");

  const userId = useRef(getUserId());
  const sessionId = useRef(crypto.randomUUID());
  const createdSessions = useRef(new Set<string>());
  const abortRef = useRef<AbortController | null>(null);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const checkBackend = useCallback(async () => {
    try {
      const apps = await listApps();
      if (apps.includes(ADK_APP_NAME)) {
        setConnection("online");
        setConnectionDetail(`Connected to ${ADK_BASE_URL} · app "${ADK_APP_NAME}"`);
      } else {
        setConnection("offline");
        setConnectionDetail(
          `App "${ADK_APP_NAME}" is not served at ${ADK_BASE_URL}. ` +
            `Available apps: ${apps.length > 0 ? apps.join(", ") : "(none)"}.`,
        );
      }
    } catch (error) {
      setConnection("offline");
      setConnectionDetail(error instanceof Error ? error.message : String(error));
    }
  }, []);

  // Connectivity probe on mount. State is only updated after the request
  // settles, so this is external-system synchronisation, not derived state.
  useEffect(() => {
    // oxlint-disable-next-line react-hooks/set-state-in-effect
    void checkBackend();
  }, [checkBackend]);

  const retry = useCallback(() => {
    setConnection("checking");
    setConnectionDetail("Checking the ADK API server…");
    void checkBackend();
  }, [checkBackend]);

  useEffect(() => {
    if (stickToBottom.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;

      setInput("");
      setBusy(true);
      stickToBottom.current = true;

      const user = userMessage(text);
      const assistant = assistantMessage();
      setMessages((prev) => [...prev, user, assistant]);

      const controller = new AbortController();
      abortRef.current = controller;
      const activeSession = sessionId.current;

      try {
        if (!createdSessions.current.has(activeSession)) {
          await createSession(userId.current, activeSession);
          createdSessions.current.add(activeSession);
        }

        await streamTurn({
          userId: userId.current,
          sessionId: activeSession,
          text,
          signal: controller.signal,
          onEvent: (event) => {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistant.id ? applyEvent(message, event) : message,
              ),
            );
          },
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          const detail = error instanceof Error ? error.message : String(error);
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistant.id
                ? { ...message, pending: false, error: detail }
                : message,
            ),
          );
        }
      } finally {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistant.id ? { ...message, pending: false } : message,
          ),
        );
        abortRef.current = null;
        setBusy(false);
      }
    },
    [busy],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    sessionId.current = crypto.randomUUID();
    stickToBottom.current = true;
    setMessages([]);
    setInput("");
    setBusy(false);
  }, []);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
  };

  return (
    <div className="app">
      <header className="header">
        <div className="logo" aria-hidden="true">
          ADK
        </div>
        <div className="titles">
          <h1>PTTEP Agent</h1>
          <span className="subtitle">Gemini via the PTTEP AI gateway</span>
        </div>
        <span className="status" title={connectionDetail}>
          <span className={`dot ${connection}`} />
          {connection === "online" ? "Connected" : connection === "offline" ? "Offline" : "Connecting…"}
        </span>
        <button type="button" className="btn" onClick={newChat}>
          New chat
        </button>
      </header>

      <div className="scroller" ref={scrollerRef} onScroll={onScroll}>
        {messages.length === 0 ? (
          <div className="empty">
            <h2>Ask about the time anywhere</h2>
            <p>
              This agent runs through the PTTEP AI gateway and calls a tool to look up the
              current time in major cities.
            </p>
            <div className="chips">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="chip"
                  disabled={busy}
                  onClick={() => void send(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="messages">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {connection === "offline" && (
        <div className="notice">
          <div className="notice-text">
            <strong>Can’t reach the agent backend.</strong>
            <span>{connectionDetail}</span>
            <code>adk api_server --allow_origins {window.location.origin} --auto_create_session</code>
          </div>
          <button type="button" className="btn" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      <Composer
        value={input}
        busy={busy}
        onChange={setInput}
        onSubmit={() => void send(input)}
        onStop={stop}
      />
    </div>
  );
}
