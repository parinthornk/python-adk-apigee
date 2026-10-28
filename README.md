# POC: Google ADK + PTTEP AI Gateway

A minimal [Google Agent Development Kit](https://adk.dev) (ADK) project that
talks to the internal PTTEP Apigee gateway instead of the public Gemini API.
The agent can answer questions and tell the current time in major cities.

## Quick start

The virtual environment and `my_agent/.env` are already configured on this
machine. From the project root:

```powershell
.\.venv\Scripts\python.exe run_streaming.py
```

Then chat:

```
You: What time is it in Bangkok?
Assistant: It is currently 14:30 in Bangkok.
```

For a fresh clone, see [Setup](#setup).

## Requirements

- Python 3.11 or newer (ADK 2.13 requires it)
- Network access to the PTTEP gateway (VPN / corporate network / approved proxy)

## Project structure

```
poc-adk/
├── my_agent/
│   ├── __init__.py     # exposes the agent package
│   ├── agent.py        # gateway client + root_agent + get_current_time tool
│   ├── .env            # gateway URL/key/model (gitignored)
│   └── .env.example    # template for .env
├── frontend/           # React + Vite chat UI (see frontend/README.md)
│   ├── src/            # App, ADK REST/SSE client, chat components
│   ├── .env.example    # UI config template
│   └── package.json
├── .venv/              # virtual environment (gitignored)
├── serve.py            # single-process host: ADK API + built React UI
├── run_streaming.py    # interactive / one-shot SSE streaming chat
├── requirements.txt
├── .gitignore
└── README.md
```

## Setup

Only needed on a fresh clone or a new machine:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item my_agent\.env.example my_agent\.env
```

Then put the real key in `my_agent/.env` (never in the tracked
`.env.example`):

```dotenv
PTP_LLM_BASE_URL="https://endpoint-dev.api.pttep.com/shana/poc-ai-gateway/v1"
PTP_LLM_API_KEY="your-key"
PTP_LLM_MODEL="gemini-3.1-flash-lite"
```

| Variable | Default | Description |
| --- | --- | --- |
| `PTP_LLM_BASE_URL` | Dev gateway URL | Gateway root **including** `/v1`, without `/publishers/...`. |
| `PTP_LLM_API_KEY` | — | Value sent in the `x-apikey` header (required). |
| `PTP_LLM_MODEL` | `gemini-3.1-flash-lite` | Model name used in the URL. |

If PowerShell blocks `Activate.ps1`, either call the executables directly (as
shown above) or run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

## How the gateway connection works

The gateway exposes the Vertex AI "express mode" URL shape:

```
POST https://endpoint-dev.api.pttep.com/shana/poc-ai-gateway/v1/publishers/google/models/gemini-3.1-flash-lite:generateContent
x-apikey: <key>
```

ADK supports it by configuring the underlying `google-genai` client:

```python
from google.adk.models.google_llm import Gemini
from google.genai import types

llm = Gemini(
    model="gemini-3.1-flash-lite",
    client_kwargs={
        "vertexai": True,
        "http_options": types.HttpOptions(
            base_url="https://endpoint-dev.api.pttep.com/shana/poc-ai-gateway/v1",
            base_url_resource_scope=types.ResourceScope.COLLECTION,
            headers={"x-apikey": "<key>"},
        ),
    },
)
```

Why these options:

| Option | Purpose |
| --- | --- |
| `vertexai=True` | Use the Vertex AI request/response format the gateway proxies. |
| `base_url` | Point the SDK at the gateway, including `/v1`. |
| `base_url_resource_scope=COLLECTION` | Treat `base_url` as the collection root so the SDK appends `publishers/google/models/...` verbatim — no `projects/.../locations/...` prefix and no extra `v1beta1`. |
| `headers={"x-apikey": ...}` | Auth expected by the gateway. No Google ADC or Gemini API key is needed. |
| `Gemini(...)` passed to `Agent(model=...)` | Keeps ADK features (tools, sessions, streaming) on top of the custom client. |

ADK merges its own tracking headers with your custom headers, so `x-apikey` is
preserved.

## Ways to run

All commands assume the venv is active; otherwise prefix with
`.\.venv\Scripts\`.

| What you want | Command |
| --- | --- |
| Interactive streaming chat (recommended) | `python run_streaming.py` |
| One-shot streaming question | `python run_streaming.py "What time is it in Tokyo?"` |
| Web UI + API in one process (see [Web frontend](#web-frontend-react)) | `python serve.py` → http://127.0.0.1:8000 |
| ADK terminal chat (non-streaming) | `adk run my_agent` |
| ADK browser UI (streaming) | `adk web --port 8000` → http://localhost:8000 |

### Interactive streaming commands

| Input | Action |
| --- | --- |
| `exit`, `quit`, `/exit`, `/quit` | Leave |
| `/reset`, `/new`, `/clear` | Start a fresh conversation |
| `Ctrl+C` | Stop immediately |

The conversation (including tool calls/results) is kept across turns in memory.
A failed turn (WAF/network/quota) prints an error and keeps the session alive.

## Web frontend (React)

`frontend/` is a React + Vite chat UI. ADK exposes a plain REST + SSE API, so
the frontend framework does not matter — React and Angular both work; this one
uses React.

### Single process (recommended)

`serve.py` runs the ADK agent API *and* serves the built UI on one port. The
browser only talks to that origin, so there is no CORS setup and the gateway
key never leaves the Python process.

```powershell
cd frontend
npm.cmd install
npm.cmd run build          # rerun this after changing the UI

cd ..
.\.venv\Scripts\python.exe serve.py        # http://127.0.0.1:8000
```

Useful flags: `--port`, `--host`, and `--allow-origin` (repeatable).

`npm.cmd` avoids the `npm.ps1` execution-policy error on Windows.

Routes on that one port:

| Path | Served by |
| --- | --- |
| `/` and any unknown path | React `index.html` (SPA fallback) |
| `/assets/*` | hashed JS/CSS from the build (long cache) |
| `/docs` | FastAPI/ADK Swagger UI |
| `/list-apps`, `/apps/...`, `/run_sse` | ADK API server |

`serve.py` checks for `my_agent/.env` and `frontend/dist/index.html` up front,
and exits with the exact command to fix either.

### UI development (hot reload)

Run the backend, then the Vite dev server against it (its origins are allowed
by default):

```powershell
.\.venv\Scripts\python.exe serve.py        # terminal 1, :8000
```

```powershell
cd frontend
npm.cmd run dev                            # terminal 2, :5173
```

Dev builds point `VITE_ADK_BASE_URL` at `http://localhost:8000`; production
builds use same-origin relative URLs. If 5173 is busy Vite uses 5174 — add it
with `serve.py --allow-origin http://localhost:5174`.

What the UI does:

- Streams tokens from `POST /run_sse` (`streaming: true`) and renders the
  `get_current_time` tool call with its JSON result.
- Keeps one ADK session per conversation; **New chat** starts a fresh one.
- Shows a red banner with the command to run when the backend is unreachable,
  and a Connected/Offline pill backed by `GET /list-apps`.

Notes:

- Configuration lives in `frontend/.env` (`VITE_ADK_BASE_URL`,
  `VITE_ADK_APP_NAME`); see `frontend/.env.example`. Both are optional.
- Neither `serve.py` nor `adk api_server` authenticates callers. Put the app
  behind your gateway/SSO before exposing it beyond localhost.
- The built-in `adk web` (Angular) remains the best tool for inspecting agent
  events; use `frontend/` when you want a product UI you control.

## Streaming (`streamGenerateContent`)

The endpoint is selected by the runner's streaming mode, not by the agent
definition:

| Launcher | Streaming mode | Gateway endpoint |
| --- | --- | --- |
| `run_streaming.py` | SSE | `:streamGenerateContent?alt=sse` |
| `adk web` | SSE (default) | `:streamGenerateContent?alt=sse` |
| `adk run` | none | `:generateContent` |

To enable streaming in your own code:

```python
from google.adk.agents.run_config import RunConfig, StreamingMode

await runner.run_async(
    ...,
    run_config=RunConfig(streaming_mode=StreamingMode.SSE),
)
```

`google-genai` always appends `?alt=sse`. That is the standard Vertex AI SSE
parameter; the gateway must forward the query string.

## What the agent does

- `my_agent/agent.py` defines `root_agent` (required by ADK), using `Gemini`
  pointed at the PTTEP gateway.
- It has one function tool, `get_current_time(city)`, supporting Bangkok,
  Tokyo, Singapore, Sydney, London, Paris, New York, San Francisco, and UTC.
- Try: *"What time is it in Tokyo?"*

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| HTML `303` / "Security Page redirect" | WAF blocked the client; run from the corporate network/VPN or use the approved proxy. |
| `401` / `403` | Wrong or expired `x-apikey`. |
| `404` model not found | `PTP_LLM_MODEL` or `PTP_LLM_BASE_URL` doesn't match the gateway route. |
| URL contains `/v1beta1/` or `projects/...` | `base_url_resource_scope=COLLECTION` was removed from the client config. |
| `PTP_LLM_API_KEY is not set` | Missing `my_agent/.env` or empty key. |

## Security notes

- `my_agent/.env` holds the real key and is gitignored. Every gateway call
  happens inside the Python process (`serve.py`, `adk api_server`, or
  `run_streaming.py`); the browser only talks to that process.
- `my_agent/.env.example` is committed and contains placeholders only. Keep it
  that way — a key committed once stays in git history even after deletion.
  Check with `git log -p -- my_agent/.env.example`.
- If a real key ever lands in a tracked file, a chat, a ticket, or a log,
  rotate it at the gateway and replace the value with a placeholder.
- `serve.py` and `adk api_server` expose an unauthenticated API. Bind to
  `127.0.0.1` locally; put real deployments behind the corporate gateway/SSO.
- The browser cannot call the PTTEP gateway directly: the gateway returns no
  CORS headers (the `OPTIONS` preflight gets a `401`), and doing so would
  expose the shared `x-apikey` to anyone loading the page.

## Verified

- Live gateway calls verified through `run_streaming.py` and through
  `serve.py` (agent API + React UI on one port), including a
  `get_current_time` tool round-trip and streamed answer.
- The React UI was also exercised against a mock ADK server: token streaming,
  tool call/result pairing, no duplicated final text, and session reset.
- `serve.py` static hosting checked for `/`, hashed assets, `/docs`,
  `/list-apps`, SPA fallback, and path-traversal attempts.
- Streaming uses `.../gemini-3.1-flash-lite:streamGenerateContent?alt=sse`.

Docs: <https://adk.dev/get-started/python/>
