import { useEffect, useRef } from "react";
import { ADK_APP_NAME, ADK_BASE_URL } from "../adk";

interface ComposerProps {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
}

export default function Composer({ value, busy, onChange, onSubmit, onStop }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  return (
    <div className="composer">
      <div className="composer-box">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          placeholder="Ask about the time in a city…"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />

        {busy ? (
          <button
            type="button"
            className="send"
            onClick={onStop}
            title="Stop generating"
            aria-label="Stop generating"
          >
            <span className="stop-square" />
          </button>
        ) : (
          <button
            type="button"
            className="send"
            onClick={onSubmit}
            disabled={!value.trim()}
            title="Send (Enter)"
            aria-label="Send message"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 12h15M13 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      <div className="hint">
        <span>Enter to send · Shift+Enter for a new line</span>
        <span className="hint-config">
          {ADK_APP_NAME} · {ADK_BASE_URL.replace(/^https?:\/\//, "") || "same origin"}
        </span>
      </div>
    </div>
  );
}
