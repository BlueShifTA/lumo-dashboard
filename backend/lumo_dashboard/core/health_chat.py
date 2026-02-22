"""Token-optimized health chat using Claude Haiku."""

import logging
from datetime import date, timedelta

import anthropic

from lumo_dashboard.core.health_db import get_metrics, get_recent_messages, save_message

log = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are Beluga, a personal health advisor with access to Garmin biometric data.
Be concise, data-driven, personalised. Reference specific numbers. Give actionable advice. No fluff."""

_INTENT_KEYWORDS: dict[str, list[str]] = {
    "sleep": ["sleep", "tired", "rest", "wake", "insomnia", "fatigue"],
    "energy": ["energy", "battery", "hrv", "heart rate", "variability", "ready"],
    "stress": ["stress", "anxious", "tense", "calm", "recover"],
    "activity": ["steps", "walk", "exercise", "activity", "move"],
}

_TOKEN_BUDGET = 1500
_CHARS_PER_TOKEN = 4


def _classify_intent(message: str) -> str:
    lower = message.lower()
    for intent, keywords in _INTENT_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            return intent
    return "general"


def _format_today(metrics: dict, intent: str) -> str:
    if not metrics:
        return "No data for today."
    parts = [f"TODAY ({metrics.get('date', 'N/A')}):"]
    fields = {
        "sleep": ["sleep_score", "resting_hr"],
        "energy": ["hrv_avg", "body_battery_max"],
        "stress": ["stress_avg", "hrv_avg"],
        "activity": ["steps"],
        "general": ["sleep_score", "hrv_avg", "body_battery_max", "stress_avg", "steps"],
    }
    for field in fields.get(intent, fields["general"]):
        val = metrics.get(field)
        if val is not None:
            parts.append(f"  {field}={val}")
    return "\n".join(parts)


def _format_history_line(row: dict) -> str:
    d = row.get("date", "?")
    s = row.get("sleep_score", "--")
    h = row.get("hrv_avg", "--")
    b = row.get("body_battery_max", "--")
    st = row.get("stress_avg", "--")
    steps = row.get("steps", "--")
    return f"{d}: sleep={s} hrv={h} battery={b} stress={st} steps={steps}"


def _build_context(intent: str, today_metrics: dict, history: list[dict]) -> str:
    today_str = _format_today(today_metrics, intent)
    history_lines = [_format_history_line(r) for r in history if r.get("date") != today_metrics.get("date")]

    # Build base context
    context_parts = [f"INTENT: {intent}", today_str, "\nLAST 7 DAYS:"]

    # Calculate remaining budget after base
    base_chars = sum(len(p) for p in context_parts) * _CHARS_PER_TOKEN
    remaining_chars = (_TOKEN_BUDGET * _CHARS_PER_TOKEN) - base_chars

    # Add history lines while under budget
    included_lines = []
    for line in history_lines:
        if len("\n".join(included_lines + [line])) <= remaining_chars:
            included_lines.append(line)
        else:
            break

    context_parts.extend(included_lines)
    return "\n".join(context_parts)


async def chat(user_message: str, session_id: str) -> dict:
    """Send a message and get a health-aware response."""
    intent = _classify_intent(user_message)

    # Fetch health data
    today_str = date.today().isoformat()
    week_start = (date.today() - timedelta(days=7)).isoformat()
    metrics_rows = get_metrics(week_start, today_str)
    today_metrics = next((r for r in metrics_rows if r["date"] == today_str), {})

    context = _build_context(intent, today_metrics, metrics_rows)

    # Build message history
    recent = get_recent_messages(session_id, n=5)
    messages: list[dict] = []
    for msg in recent:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": f"{context}\n\nUSER: {user_message}"})

    # Call Claude
    client = anthropic.Anthropic()
    response = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=512,
        system=_SYSTEM_PROMPT,
        messages=messages,
    )

    assistant_text = response.content[0].text
    tokens_used = response.usage.input_tokens + response.usage.output_tokens

    # Persist to DB
    save_message(session_id, "user", user_message)
    save_message(session_id, "assistant", assistant_text)

    return {
        "response": assistant_text,
        "tokens_used": tokens_used,
        "intent": intent,
    }
