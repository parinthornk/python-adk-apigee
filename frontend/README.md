# PTTEP Agent — React frontend

Vite + React + TypeScript chat UI for the ADK agent in `../my_agent`.

It talks to the ADK API server over REST + Server-Sent Events:

- `GET /list-apps` — connectivity / app check
- `POST /apps/{app}/users/{user}/sessions/{session}` — session setup
- `POST /run_sse` (`streaming: true`) — token streaming, tool calls

## Run

```powershell
# terminal 1 — backend, from the project root
adk api_server --allow_origins http://localhost:5173 --auto_create_session

# terminal 2 — frontend
cd frontend
npm.cmd install
npm.cmd run dev
```

Open http://localhost:5173.

`npm.cmd` is used because PowerShell may block `npm.ps1` under the default
execution policy.

## Configuration

Copy `.env.example` to `.env` and adjust if needed:

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_ADK_BASE_URL` | `http://localhost:8000` | ADK API server base URL |
| `VITE_ADK_APP_NAME` | `my_agent` | Agent folder name served by ADK |

If the dev server picks a different port (5174 when 5173 is busy), pass the new
origin to `--allow_origins`, or the browser will block the request with a CORS
error. The UI shows the exact command to run when it cannot reach the backend.
