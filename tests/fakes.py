"""Offline scripted Agents SDK model fakes for Walter's durable-runtime tests.

Wraps the pinned SDK's agents.testing.ScriptedModel so tests drive the full
Runner loop without provider credits. Every scripted step carries a raw
provider-usage payload so UsageRecordingModel persists deterministic records.
"""
from __future__ import annotations

import json
from collections.abc import Callable, Iterable, Mapping
from typing import Any

from agents.testing import ScriptedModel, assistant_message, function_call
from agents.usage import Usage

INPUT_TOKENS = 11
OUTPUT_TOKENS = 7
TOTAL_TOKENS = INPUT_TOKENS + OUTPUT_TOKENS

# Provider-shaped raw usage preserved by UsageRecordingModel (prompt/completion
# aliases exercise the durable normalization path).
RAW_USAGE = {
    "prompt_tokens": INPUT_TOKENS,
    "completion_tokens": OUTPUT_TOKENS,
    "total_tokens": TOTAL_TOKENS,
}

DEFAULT_USAGE = Usage(
    requests=1,
    input_tokens=INPUT_TOKENS,
    output_tokens=OUTPUT_TOKENS,
    total_tokens=TOTAL_TOKENS,
)


def tool_step(name: str, arguments: Mapping[str, Any] | str, *, call_id: str) -> dict:
    """One scripted turn that calls a single function tool."""
    return {
        "output": [function_call(name, arguments, call_id=call_id)],
        "raw_usage": dict(RAW_USAGE),
    }


def message_step(text: str) -> dict:
    """One scripted final assistant-message turn."""
    return {
        "output": [assistant_message(text)],
        "raw_usage": dict(RAW_USAGE),
    }


def responder_step(responder: Callable) -> dict:
    """One scripted turn computed from the live call (may read durable state)."""
    return {"responder": responder}


def plan_item_numbers(review_input) -> list[int]:
    """The numbered plan items a reviewer was asked to rule on."""
    for entry in [review_input] if isinstance(review_input, str) else review_input:
        content = entry if isinstance(entry, str) else entry.get("content")
        if isinstance(content, list):
            content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
        try:
            return [item["item"] for item in json.loads(content)["plan_items"]]
        except (TypeError, ValueError, KeyError):
            continue
    return []


def verdicts(review_input, met: bool = True) -> list[dict]:
    """One verdict for every plan item in a reviewer's input."""
    return [{"item": number, "met": met, "evidence": "Inspected in the candidate"}
            for number in plan_item_numbers(review_input)]


def review_step(result: Mapping[str, Any]) -> dict:
    """A reviewer's final turn that rules on every plan item it was given."""
    def responder(call):
        return message_step(json.dumps({**result, "verdicts": verdicts(call.input, result["passed"])}))
    return responder_step(responder)


def scripted_model(steps: Iterable) -> ScriptedModel:
    """A deterministic offline Model with Walter-compatible usage payloads."""
    return ScriptedModel(steps, default_usage=DEFAULT_USAGE)
