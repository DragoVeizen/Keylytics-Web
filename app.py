"""Keylytics Web - Typing practice frontend that uses the Keylytics Engine API."""

import os
import random
from pathlib import Path
from typing import List, Optional

import httpx
from fastapi import FastAPI, Request, Query, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

# Engine API URL (configurable via environment variable)
ENGINE_API_URL = os.getenv("ENGINE_API_URL", "http://localhost:8000")

# ============================================================================
# Models (for request validation)
# ============================================================================

class KeyEvent(BaseModel):
    key: str
    kind: str
    t: float


class SessionLog(BaseModel):
    target_text: str
    final_text: str
    events: List[KeyEvent]


# ============================================================================
# Word Pool for Text Generation
# ============================================================================

WORD_POOL: List[str] = [
    # Common words
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "I",
    "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
    "this", "but", "his", "by", "from", "they", "we", "say", "her", "she",
    "or", "an", "will", "my", "one", "all", "would", "there", "their", "what",
    "so", "up", "out", "if", "about", "who", "get", "which", "go", "me",
    "when", "make", "can", "like", "time", "no", "just", "him", "know", "take",
    "people", "into", "year", "your", "good", "some", "could", "them", "see", "other",
    "than", "then", "now", "look", "only", "come", "its", "over", "think", "also",
    "back", "after", "use", "two", "how", "our", "work", "first", "well", "way",
    "even", "new", "want", "because", "any", "these", "give", "day", "most", "us",
    # Programming related
    "function", "variable", "const", "return", "class", "object", "array", "string",
    "number", "boolean", "null", "undefined", "import", "export", "default", "async",
    "await", "promise", "callback", "error", "debug", "console", "print", "loop",
    "while", "break", "continue", "switch", "case", "index", "value", "key", "map",
    "filter", "reduce", "forEach", "find", "includes", "push", "pop", "shift", "slice",
    "code", "program", "software", "developer", "engineer", "system", "data", "algorithm",
    "interface", "component", "module", "package", "library", "framework", "server", "client",
    "request", "response", "database", "query", "schema", "model", "view", "controller",
    # Longer words for variety
    "experience", "different", "important", "government", "development", "environment",
    "information", "understand", "performance", "application", "organization", "international",
    "relationship", "technology", "communication", "responsibility", "administration",
    "professional", "opportunity", "community", "significant", "traditional", "individual",
    # Action words
    "create", "build", "write", "read", "update", "delete", "start", "stop", "run",
    "test", "check", "verify", "validate", "submit", "send", "receive", "process",
    "handle", "manage", "control", "monitor", "track", "analyze", "review", "approve",
    # Descriptive words
    "quick", "fast", "slow", "large", "small", "simple", "complex", "easy", "hard",
    "right", "wrong", "true", "false", "valid", "invalid", "active", "inactive",
    "public", "private", "static", "dynamic", "global", "local", "remote", "secure",
    # More common words
    "world", "life", "hand", "part", "child", "eye", "woman", "place", "week", "company",
    "system", "program", "question", "number", "night", "point", "home",
    "water", "room", "mother", "area", "money", "story", "fact", "month", "lot",
    "study", "book", "word", "business", "issue", "side", "kind", "head", "house", "service",
    "friend", "father", "power", "hour", "game", "line", "end", "member", "law", "car",
    "city", "name", "president", "team", "minute", "idea", "kid", "body", "parent", "face",
    "others", "level", "office", "door", "health", "person", "art", "war", "history", "party",
]

QUOTES: List[str] = [
    "The only way to do great work is to love what you do. - Steve Jobs",
    "Innovation distinguishes between a leader and a follower. - Steve Jobs",
    "Stay hungry, stay foolish. - Steve Jobs",
    "Code is like humor. When you have to explain it, it's bad. - Cory House",
    "First, solve the problem. Then, write the code. - John Johnson",
    "Experience is the name everyone gives to their mistakes. - Oscar Wilde",
    "The best error message is the one that never shows up. - Thomas Fuchs",
    "Simplicity is the soul of efficiency. - Austin Freeman",
]


def generate_text(word_count: int) -> str:
    """Generate a random text with the specified number of words."""
    words = random.choices(WORD_POOL, k=word_count)
    if words:
        words[0] = words[0].capitalize()
    return " ".join(words) + "."


# ============================================================================
# FastAPI App
# ============================================================================

BASE_DIR = Path(__file__).parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Keylytics", description="Typing Practice with Analytics")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=TEMPLATES_DIR)


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/health")
async def health():
    return {"status": "ok", "engine_url": ENGINE_API_URL}


@app.get("/api/texts")
async def get_texts():
    """Return sample texts of various lengths."""
    return {
        "texts": {
            15: generate_text(15),
            30: generate_text(30),
            45: generate_text(45),
            60: generate_text(60),
        },
        "quotes": QUOTES
    }


@app.get("/api/text")
async def get_random_text(
    words: Optional[int] = Query(default=None, ge=10, le=200),
    mode: str = "words"
):
    """Return a random text. Use words param for word count, or mode=quote for quotes."""
    if mode == "quote":
        return {"text": random.choice(QUOTES)}
    word_count = words if words else 30
    return {"text": generate_text(word_count)}


@app.post("/api/analyze")
async def analyze_session(session: SessionLog):
    """Proxy analysis request to the Keylytics Engine API."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                f"{ENGINE_API_URL}/api/analyze",
                json=session.model_dump()
            )
            response.raise_for_status()
            return response.json()
        except httpx.ConnectError:
            raise HTTPException(
                status_code=503,
                detail=f"Cannot connect to analytics engine at {ENGINE_API_URL}"
            )
        except httpx.HTTPStatusError as e:
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"Engine API error: {e.response.text}"
            )


def main():
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()
