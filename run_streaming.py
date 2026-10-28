"""Streaming chat with the PTTEP-gateway-backed ADK agent.

Usage:
    python run_streaming.py                  # interactive chat
    python run_streaming.py "your prompt"    # one-shot

Interactive commands:
    exit, quit, /exit, /quit  leave
    /reset, /new, /clear      start a fresh conversation
"""

import asyncio
import sys
import uuid

from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from my_agent.agent import root_agent

APP_NAME = "stream_cli"
USER_ID = "local"
DEFAULT_SESSION_ID = "stream-session"

EXIT_COMMANDS = {"exit", "quit", "/exit", "/quit"}
RESET_COMMANDS = {"/reset", "/new", "/clear"}


def build_runner() -> tuple[Runner, InMemorySessionService]:
    sessions = InMemorySessionService()
    runner = Runner(
        app_name=APP_NAME,
        agent=root_agent,
        session_service=sessions,
    )
    return runner, sessions


async def start_session(
    sessions: InMemorySessionService, session_id: str
) -> None:
    await sessions.create_session(
        app_name=APP_NAME, user_id=USER_ID, session_id=session_id
    )


async def stream_turn(runner: Runner, session_id: str, prompt: str) -> None:
    """Send one user message and print the response as it streams in."""
    printed_text = False
    async for event in runner.run_async(
        user_id=USER_ID,
        session_id=session_id,
        new_message=types.Content(
            role="user", parts=[types.Part(text=prompt)]
        ),
        run_config=RunConfig(streaming_mode=StreamingMode.SSE),
    ):
        if not event.content or not event.content.parts:
            continue
        for part in event.content.parts:
            if not part.text:
                continue
            # ADK emits partial chunks and then a non-partial aggregate with
            # the full text again. Print chunks as they arrive and only use
            # the aggregate when nothing was streamed.
            if event.partial:
                print(part.text, end="", flush=True)
                printed_text = True
            elif event.is_final_response() and not printed_text:
                print(part.text, end="", flush=True)
                printed_text = True

    if not printed_text:
        print("(no text response)", end="")
    print()


def print_help() -> None:
    print(
        "Commands: /reset for a new conversation, exit or quit to leave.\n"
        "Press Ctrl+C at any time to stop."
    )


async def interactive() -> None:
    runner, sessions = build_runner()
    session_id = DEFAULT_SESSION_ID
    await start_session(sessions, session_id)

    print("ADK streaming chat (gemini-3.1-flash-lite via PTTEP gateway).")
    print_help()

    while True:
        try:
            prompt = input("\nYou: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye.")
            return

        if not prompt:
            continue
        if prompt.lower() in EXIT_COMMANDS:
            print("Bye.")
            return
        if prompt.lower() in RESET_COMMANDS:
            session_id = f"stream-{uuid.uuid4().hex[:8]}"
            await start_session(sessions, session_id)
            print("Started a new conversation.")
            continue

        print("Assistant: ", end="", flush=True)
        try:
            await stream_turn(runner, session_id, prompt)
        except Exception as exc:
            # Keep the REPL alive if one turn fails (network, WAF, quota...).
            print(f"\n[error] {type(exc).__name__}: {exc}")


async def one_shot(prompt: str) -> None:
    runner, sessions = build_runner()
    await start_session(sessions, DEFAULT_SESSION_ID)
    print("Assistant: ", end="", flush=True)
    await stream_turn(runner, DEFAULT_SESSION_ID, prompt)


if __name__ == "__main__":
    try:
        user_prompt = " ".join(sys.argv[1:]).strip()
        if user_prompt:
            asyncio.run(one_shot(user_prompt))
        else:
            asyncio.run(interactive())
    except KeyboardInterrupt:
        print("\nBye.")
