# PTTEP Agent — React frontend

Vite + React + TypeScript chat UI for the ADK agent in `../my_agent`.

It talks to the ADK API server over REST + Server-Sent Events:

- `GET /list-apps` — connectivity / app check
- `POST /apps/{app}/users/{user}/sessions/{session}` — session setup
- `POST /run_sse` (`streaming: true`) — token streaming, tool calls

## Run (single process, recommended)

The UI is served by `../serve.py` together with the agent API, on one origin:

```powershell
npm.cmd install
npm.cmd run build

cd ..
.\.venv\Scripts\python.exe serve.py        # http://127.0.0.1:8000
```

No CORS, and the gateway key stays on the server.

## Run (hot reload)

```powershell
# terminal 1, project root
.\.venv\Scripts\python.exe serve.py        # :8000

# terminal 2, this folder
npm.cmd install
npm.cmd run dev                            # http://localhost:5173
```

`npm.cmd` is used because PowerShell may block `npm.ps1` under the default
execution policy.

With no configuration, dev builds call `http://localhost:8000` and production
builds use relative (same-origin) URLs. `serve.py` already allows the Vite dev
origins; if Vite picks 5174, add `--allow-origin http://localhost:5174`.

## Configuration

Optional — copy `.env.example` to `.env` only when overriding:

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_ADK_BASE_URL` | dev: `http://localhost:8000`, build: same origin | ADK API base URL |
| `VITE_ADK_APP_NAME` | `my_agent` | Agent folder name served by ADK |

Values are baked in at build time, so rebuild after changing `.env`.
