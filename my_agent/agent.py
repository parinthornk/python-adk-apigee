import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from google.adk.agents.llm_agent import Agent
from google.adk.models.google_llm import Gemini
from google.genai import types

# Load my_agent/.env whether we run through the `adk` CLI or a plain import.
load_dotenv(Path(__file__).with_name(".env"))

# PTTEP AI gateway (Apigee) settings.
# The base URL must include the API version and end before /publishers/...
LLM_BASE_URL = os.getenv(
    "PTP_LLM_BASE_URL",
    "https://endpoint-dev.api.pttep.com/shana/poc-ai-gateway/v1",
).rstrip("/")
LLM_API_KEY = os.getenv("PTP_LLM_API_KEY", "")
LLM_MODEL = os.getenv("PTP_LLM_MODEL", "gemini-3.1-flash-lite")

if not LLM_API_KEY:
    raise ValueError(
        "PTP_LLM_API_KEY is not set. Add it to my_agent/.env "
        "(see .env.example)."
    )

# The gateway exposes the Vertex AI "express mode" shape:
#   POST {base_url}/publishers/google/models/{model}:generateContent
# and authenticates with the x-apikey header instead of Google ADC.
#
# `base_url_resource_scope=COLLECTION` tells google-genai that base_url is the
# collection root, so it appends `publishers/google/models/...` verbatim
# instead of prefixing a project/location or a second API version.
llm = Gemini(
    model=LLM_MODEL,
    client_kwargs={
        "vertexai": True,
        "http_options": types.HttpOptions(
            base_url=LLM_BASE_URL,
            base_url_resource_scope=types.ResourceScope.COLLECTION,
            headers={"x-apikey": LLM_API_KEY},
        ),
    },
)

# A few common cities, so the tool works without extra input from the user.
CITY_TIMEZONES = {
    "bangkok": "Asia/Bangkok",
    "tokyo": "Asia/Tokyo",
    "singapore": "Asia/Singapore",
    "sydney": "Australia/Sydney",
    "london": "Europe/London",
    "paris": "Europe/Paris",
    "new york": "America/New_York",
    "san francisco": "America/Los_Angeles",
    "utc": "UTC",
}


def get_current_time(city: str) -> dict:
    """Returns the current time in a specified city.

    Args:
        city: Name of the city, for example "Tokyo" or "New York".

    Returns:
        A dict with the status, the city, and the current local time.
    """
    timezone = CITY_TIMEZONES.get(city.strip().lower())
    if timezone is None:
        return {
            "status": "error",
            "city": city,
            "error_message": f"I don't know the timezone for '{city}'. "
            "Try a major city such as Bangkok, Tokyo, London, or New York.",
        }

    now = datetime.now(ZoneInfo(timezone))
    return {
        "status": "success",
        "city": city,
        "timezone": timezone,
        "time": now.strftime("%Y-%m-%d %H:%M:%S"),
    }


root_agent = Agent(
    model=llm,
    name="root_agent",
    description="A helpful assistant that can tell the current time in major cities.",
    instruction=(
        "You are a friendly, concise assistant. "
        "When the user asks for the current time in a city, "
        "use the 'get_current_time' tool. "
        "If the city is unknown, ask the user for a nearby major city."
    ),
    tools=[get_current_time],
)
