"""Serve the ADK agent API and the built React UI from a single process.

Usage:
    .\\.venv\\Scripts\\python.exe serve.py                 # http://127.0.0.1:8000
    .\\.venv\\Scripts\\python.exe serve.py --port 9000
    .\\.venv\\Scripts\\python.exe serve.py --allow-origin http://localhost:5173

The React app is served from frontend/dist, so build it first when the
frontend changes:

    cd frontend
    npm.cmd run build

Both the UI and the API share an origin, so no CORS configuration and no
gateway key in the browser are needed. The gateway key stays in
my_agent/.env and is only read by the Python process.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import uvicorn
from dotenv import dotenv_values
from fastapi import FastAPI
from fastapi.responses import FileResponse
from google.adk.cli.fast_api import get_fast_api_app

ROOT_DIR = Path(__file__).resolve().parent
AGENT_DIR = ROOT_DIR / "my_agent"
DIST_DIR = ROOT_DIR / "frontend" / "dist"
INDEX_FILE = DIST_DIR / "index.html"

# Only needed when the UI runs on the Vite dev server against this backend.
DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]


def ensure_api_key() -> None:
    """Fail fast instead of returning opaque 500s from the agent loader."""
    if os.getenv("PTP_LLM_API_KEY"):
        return

    env_file = AGENT_DIR / ".env"
    if env_file.is_file() and dotenv_values(env_file).get("PTP_LLM_API_KEY"):
        return

    raise SystemExit(
        "[error] PTP_LLM_API_KEY is not set.\n"
        f"  Create {env_file} from my_agent/.env.example and add the gateway key."
    )


def ensure_frontend_build() -> None:
    if INDEX_FILE.is_file():
        return

    raise SystemExit(
        "[error] frontend/dist/index.html not found.\n"
        "  Build the UI first:\n"
        "    cd frontend\n"
        "    npm.cmd install\n"
        "    npm.cmd run build"
    )


def create_app(allow_origins: list[str]) -> FastAPI:
    app = get_fast_api_app(
        agents_dir=str(ROOT_DIR),
        web=False,
        auto_create_session=True,
        use_local_storage=True,
        allow_origins=allow_origins,
    )

    dist_root = DIST_DIR.resolve()

    @app.get("/{path:path}", include_in_schema=False)
    async def serve_spa(path: str) -> FileResponse:
        """Serve built files, falling back to index.html for client-side routes."""
        if path:
            candidate = (dist_root / path).resolve()
            if candidate.is_relative_to(dist_root) and candidate.is_file():
                headers = (
                    {"Cache-Control": "public, max-age=31536000, immutable"}
                    if path.startswith("assets/")
                    else None
                )
                return FileResponse(candidate, headers=headers)

        # Unknown paths belong to the SPA router (there are none today, but this
        # keeps deep links working if routes are added later).
        return FileResponse(INDEX_FILE, headers={"Cache-Control": "no-cache"})

    return app


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the ADK agent and the React UI on one port.",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Bind address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port (default: 8000)")
    parser.add_argument(
        "--allow-origin",
        action="append",
        dest="allow_origins",
        metavar="ORIGIN",
        help="Extra CORS origin, e.g. the Vite dev server. Repeatable.",
    )
    args = parser.parse_args()

    ensure_api_key()
    ensure_frontend_build()

    app = create_app([*DEV_ORIGINS, *(args.allow_origins or [])])

    print()
    print(f"  ADK agent + React UI:  http://{args.host}:{args.port}", flush=True)
    print(f"  API docs:              http://{args.host}:{args.port}/docs", flush=True)
    print("  Press Ctrl+C to stop.", flush=True)
    print(flush=True)

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
