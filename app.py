"""Keylytics Web - Standalone typing practice with analytics."""

import random
from pathlib import Path
from statistics import median
from typing import Dict, List, Literal, Optional

from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from Levenshtein import distance as levenshtein_distance

# ============================================================================
# Models
# ============================================================================

class KeyEvent(BaseModel):
    key: str
    kind: Literal["keydown", "keyup"]
    t: float


class SessionLog(BaseModel):
    target_text: str
    final_text: str
    events: List[KeyEvent]


class HesitationSpike(BaseModel):
    index: int
    latency_ms: float
    threshold_ms: float


class BasicMetrics(BaseModel):
    duration_ms: float
    wpm: float  # Net WPM (only correct characters count)
    raw_wpm: float  # Raw WPM (all typed characters)
    accuracy: float
    avg_interkey_latency_ms: Optional[float]


class PerKeyMetrics(BaseModel):
    latency_ms: Dict[str, float]
    error_rate: Dict[str, float]


class NgramMetrics(BaseModel):
    bigram_latency_ms: Dict[str, float]


class HesitationMetrics(BaseModel):
    spikes: List[HesitationSpike]
    spike_rate: float


class CorrectionMetrics(BaseModel):
    backspace_count: int
    backspace_rate: float
    correction_bursts: int


class AnalyticsReport(BaseModel):
    basic: BasicMetrics
    per_key: PerKeyMetrics
    ngrams: NgramMetrics
    hesitation: HesitationMetrics
    corrections: CorrectionMetrics
    insights: List[str]
    wpm_over_time: List[Dict[str, float]]  # For graphing


# ============================================================================
# Analytics Engine (embedded)
# ============================================================================

MODIFIER_KEYS = {
    "Shift", "Control", "Alt", "Meta", "CapsLock", "Tab", "Escape",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "Home", "End", "PageUp", "PageDown", "Insert", "Delete",
    "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
}


def get_keydown_events(events: List[KeyEvent]) -> List[KeyEvent]:
    keydowns = [e for e in events if e.kind == "keydown"]
    return sorted(keydowns, key=lambda e: e.t)


def compute_interkey_latencies(keydowns: List[KeyEvent]) -> List[float]:
    if len(keydowns) < 2:
        return []
    latencies = []
    for i in range(1, len(keydowns)):
        delta = keydowns[i].t - keydowns[i - 1].t
        if 0 < delta <= 5000:
            latencies.append(delta)
    return latencies


def compute_wpm_over_time(keydowns: List[KeyEvent], window_ms: float = 2000) -> List[Dict[str, float]]:
    """Compute rolling WPM over time for graphing."""
    if len(keydowns) < 2:
        return []

    start_time = keydowns[0].t
    results = []
    char_count = 0

    for i, event in enumerate(keydowns):
        if event.key not in MODIFIER_KEYS and event.key != "Backspace":
            char_count += 1

        elapsed = event.t - start_time
        if elapsed > 0:
            words = char_count / 5.0
            minutes = elapsed / 60000.0
            wpm = words / minutes if minutes > 0 else 0
            results.append({
                "time": round(elapsed / 1000, 2),  # seconds
                "wpm": round(wpm, 1)
            })

    return results


def analyze(session: SessionLog) -> AnalyticsReport:
    events = session.events
    keydowns = get_keydown_events(events)

    # Basic metrics
    if events:
        timestamps = [e.t for e in events]
        duration_ms = max(timestamps) - min(timestamps)
    else:
        duration_ms = 0.0

    latencies = compute_interkey_latencies(keydowns)
    avg_latency = sum(latencies) / len(latencies) if latencies else None

    # Calculate Raw WPM (all typed characters)
    total_chars = len(session.final_text)
    minutes = duration_ms / 60000.0
    raw_wpm = (total_chars / 5.0) / minutes if minutes > 0 else 0.0

    # Calculate Net WPM (only correct characters)
    correct_chars = 0
    for i, char in enumerate(session.final_text):
        if i < len(session.target_text) and char == session.target_text[i]:
            correct_chars += 1
    net_wpm = (correct_chars / 5.0) / minutes if minutes > 0 else 0.0

    max_len = max(len(session.target_text), len(session.final_text), 1)
    edit_dist = levenshtein_distance(session.target_text, session.final_text)
    accuracy = max(0.0, 1.0 - (edit_dist / max_len))

    basic = BasicMetrics(
        duration_ms=duration_ms,
        wpm=net_wpm,
        raw_wpm=raw_wpm,
        accuracy=accuracy,
        avg_interkey_latency_ms=avg_latency
    )

    # Per-key metrics
    latencies_by_key: Dict[str, List[float]] = {}
    for i in range(1, len(keydowns)):
        key = keydowns[i].key
        if key not in MODIFIER_KEYS:
            delta = keydowns[i].t - keydowns[i - 1].t
            if 0 < delta <= 5000:
                latencies_by_key.setdefault(key, []).append(delta)

    per_key_latency = {k: sum(v)/len(v) for k, v in latencies_by_key.items() if v}
    per_key = PerKeyMetrics(
        latency_ms=per_key_latency,
        error_rate={k: 0.0 for k in per_key_latency}
    )

    # Bigram metrics
    bigram_latencies: Dict[str, List[float]] = {}
    prev_key = None
    prev_time = None
    for event in keydowns:
        key = event.key
        if key in MODIFIER_KEYS or key == "Backspace":
            continue
        normalized = key.lower() if len(key) == 1 else (" " if key == " " else None)
        if normalized and prev_key:
            delta = event.t - prev_time
            if 0 < delta <= 5000:
                bigram = f"{prev_key}{normalized}"
                bigram_latencies.setdefault(bigram, []).append(delta)
        if normalized:
            prev_key = normalized
            prev_time = event.t

    avg_bigrams = {k: sum(v)/len(v) for k, v in bigram_latencies.items() if v}
    sorted_bigrams = sorted(avg_bigrams.items(), key=lambda x: x[1], reverse=True)[:10]
    ngrams = NgramMetrics(bigram_latency_ms=dict(sorted_bigrams))

    # Hesitation
    spikes = []
    if latencies:
        median_latency = median(latencies)
        threshold = max(median_latency * 2, 250)
        for i in range(1, len(keydowns)):
            delta = keydowns[i].t - keydowns[i - 1].t
            if 0 < delta <= 5000:
                if delta > median_latency * 2 and delta > 250:
                    spikes.append(HesitationSpike(index=i, latency_ms=delta, threshold_ms=threshold))

    spike_rate = len(spikes) / len(latencies) if latencies else 0.0
    hesitation = HesitationMetrics(spikes=spikes, spike_rate=spike_rate)

    # Corrections
    backspace_count = sum(1 for e in keydowns if e.key == "Backspace")
    baseline = max(len(session.final_text), 1)
    backspace_rate = (backspace_count / baseline) * 100

    bursts = 0
    streak = 0
    for event in keydowns:
        if event.key == "Backspace":
            streak += 1
        else:
            if streak >= 2:
                bursts += 1
            streak = 0
    if streak >= 2:
        bursts += 1

    corrections = CorrectionMetrics(
        backspace_count=backspace_count,
        backspace_rate=backspace_rate,
        correction_bursts=bursts
    )

    # Insights
    insights = []
    if avg_latency is None or duration_ms == 0:
        insights.append("Not enough timing data to compute reliable speed metrics.")
    else:
        if spike_rate > 0.08:
            insights.append("Frequent hesitation spikes; work on fluent recall in tricky segments.")
        if ngrams.bigram_latency_ms and avg_latency:
            slow = [b for b, l in ngrams.bigram_latency_ms.items() if l > avg_latency * 2][:3]
            if slow:
                insights.append(f"Specific bigram(s) are slowing you down: {', '.join(repr(b) for b in slow)}.")
        if backspace_rate > 5:
            insights.append("High correction rate; slow slightly and prioritize accuracy.")

    # WPM over time for graphs
    wpm_over_time = compute_wpm_over_time(keydowns)

    return AnalyticsReport(
        basic=basic,
        per_key=per_key,
        ngrams=ngrams,
        hesitation=hesitation,
        corrections=corrections,
        insights=insights,
        wpm_over_time=wpm_over_time
    )


# ============================================================================
# Sample Texts
# ============================================================================

# Word pool for generating typing texts (200+ words)
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
    report = analyze(session)
    return report.model_dump()


def main():
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()
