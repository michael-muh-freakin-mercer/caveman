"""Scripted test executor: drives the real kernel with scripted models.

Enabled only when ``CAVEMAN_EXECUTOR=scripted`` (refused in production). It
exists so end-to-end tests can exercise the whole product -- durable jobs, the
real Manager tool surface, real Bubblewrap validation, real review and
acceptance gates, real approvals -- without spending provider credits.

Only the *model* is scripted. Every state change still goes through the
orchestration kernel, and every check result comes from trusted execution.
Runs created this way are labelled with executor ``scripted`` everywhere they
are shown.

Scenarios are selected by a tag in the build request:

- default          plan, build and verify two tasks, then finish
- ``#approval``    finish a task, then wait for a human approval before completing
- ``#fail-validation``  first candidate fails its tests; recovery revises it
"""
from __future__ import annotations

import asyncio
import json
import threading
from collections.abc import Callable

from agents.testing import ScriptedModel, assistant_message, function_call
from agents.usage import Usage

from walter import runtime
from walter.models import ApprovalStatus

PROVIDER = "caveman-scripted"
_RAW_USAGE = {"prompt_tokens": 120, "completion_tokens": 40, "total_tokens": 160}
_USAGE = Usage(requests=1, input_tokens=120, output_tokens=40, total_tokens=160)

SPEC_CRITERION = "Product specification accepted after independent review"
CORE_CRITERION = "Booking core implemented with passing sandboxed tests"

BOOKING_MODULE = '''"""Appointment booking core for a small studio."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Slot:
    day: str
    hour: int


class Calendar:
    def __init__(self, open_hour: int = 10, close_hour: int = 18):
        self.open_hour = open_hour
        self.close_hour = close_hour
        self._booked: dict[Slot, str] = {}

    def available(self, day: str) -> list[Slot]:
        return [Slot(day, hour) for hour in range(self.open_hour, self.close_hour)
                if Slot(day, hour) not in self._booked]

    def book(self, slot: Slot, client: str) -> None:
        if not self.open_hour <= slot.hour < self.close_hour:
            raise ValueError("Outside opening hours")
        if slot in self._booked:
            raise ValueError("Slot already booked")
        self._booked[slot] = client
'''

BOOKING_TESTS = '''import pytest

from booking import Calendar, Slot


def test_booking_removes_slot_from_availability():
    calendar = Calendar()
    calendar.book(Slot("mon", 11), "Ada")
    assert Slot("mon", 11) not in calendar.available("mon")
    assert len(calendar.available("mon")) == 7


def test_double_booking_is_refused():
    calendar = Calendar()
    calendar.book(Slot("mon", 12), "Ada")
    with pytest.raises(ValueError):
        calendar.book(Slot("mon", 12), "Grace")
'''

BROKEN_MODULE = BOOKING_MODULE.replace("if slot in self._booked:", "if False:")

_SPEC_PACKET = {
    "task_id": "spec",
    "role": "Product specialist",
    "objective": "Write the product specification for the booking app",
    "deliverable": "A concise specification covering users, booking rules and screens",
    "acceptance_criteria": ["Specification defines booking rules and double-booking behaviour"],
    "stop_condition": "Specification returned or genuinely blocked",
}

_CORE_PACKET = {
    "task_id": "core",
    "role": "Backend specialist",
    "objective": "Implement the booking core with tests",
    "deliverable": "booking.py with a Calendar supporting availability and booking, plus tests",
    "acceptance_criteria": ["Double booking is refused", "Tests cover availability and booking"],
    "stop_condition": "Module and tests written and self-checked, or genuinely blocked",
}


def _tool(name: str, arguments: dict, call_id: str) -> dict:
    return {"output": [function_call(name, arguments, call_id=call_id)], "raw_usage": dict(_RAW_USAGE)}


def _message(text: str) -> dict:
    return {"output": [assistant_message(text)], "raw_usage": dict(_RAW_USAGE)}


def _worker_result(task_id: str, deliverable: str, summary: str) -> dict:
    return _message(json.dumps({
        "task_id": task_id, "status": "completed", "summary": summary, "deliverable": deliverable,
        "evidence": ["Produced inside the assigned lane"],
    }))


def _review(passed: bool, reason: str) -> dict:
    return _message(json.dumps({"passed": passed, "evidence": [reason], "reason": reason}))


def _write_code(prefix: str, module: str) -> list[dict]:
    return [
        _tool("write_file", {"path": "booking.py", "content": module}, f"{prefix}-module"),
        _tool("write_file", {"path": "test_booking.py", "content": BOOKING_TESTS}, f"{prefix}-tests"),
        _worker_result("core", "Implemented booking.py and test_booking.py.", "Booking core implemented"),
    ]


def scenario_for(objective: str) -> str:
    text = objective.lower()
    if "#approval" in text:
        return "approval"
    if "#fail-validation" in text:
        return "fail-validation"
    return "complete"


class _PacedModel(ScriptedModel):
    """A scripted model that takes a little time per step, like a real provider."""

    def __init__(self, steps, delay: float):
        super().__init__(steps, default_usage=_USAGE)
        self._delay = delay

    async def get_response(self, *args, **kwargs):
        if self._delay:
            await asyncio.sleep(self._delay)
        return await super().get_response(*args, **kwargs)


def _finish(controller_run: Callable, criteria: list[str], task_for: dict[str, str], summary: str):
    def responder(_call):
        run = controller_run()
        evidence = {c: [run.tasks[task_for[c]].artifact_ids[-1]] for c in criteria}
        return _tool("finish_run", {"summary": summary, "criterion_evidence_json": json.dumps(evidence)},
                     "finish")
    return {"responder": responder}


def build_scripts(scenario: str, kind: str, load_run: Callable) -> tuple[list, list]:
    """Return (manager_steps, worker_steps) for one job of a scenario."""
    review_pass = _review(True, "Candidate satisfies every acceptance criterion")
    if scenario == "complete":
        criteria = [SPEC_CRITERION, CORE_CRITERION]
        manager = [
            _tool("set_completion_criteria", {"criteria": criteria}, "criteria"),
            _tool("plan_tasks", {"packets": [_SPEC_PACKET, {**_CORE_PACKET, "dependencies": ["spec"]}],
                                 "capabilities": ["model_only", "developer_sandbox"],
                                 "checks": [["result_schema"], ["compile", "pytest"]]}, "plan"),
            _tool("delegate_task", {"task_id": "spec"}, "delegate-spec"),
            _tool("validate_task", {"task_id": "spec"}, "validate-spec"),
            _tool("review_task", {"task_id": "spec"}, "review-spec"),
            _tool("accept_task", {"task_id": "spec", "reason": "Validated and independently reviewed"},
                  "accept-spec"),
            _tool("delegate_task", {"task_id": "core"}, "delegate-core"),
            _tool("validate_task", {"task_id": "core"}, "validate-core"),
            _tool("review_task", {"task_id": "core"}, "review-core"),
            _tool("accept_task", {"task_id": "core", "reason": "Sandboxed tests passed and review passed"},
                  "accept-core"),
            _finish(load_run, criteria, {SPEC_CRITERION: "spec", CORE_CRITERION: "core"},
                    "Booking core and specification delivered."),
            _message("Build complete. The specification and the tested booking core were accepted."),
        ]
        worker = [
            _worker_result("spec", "Specification: clients pick an open hourly slot between 10:00 and "
                           "18:00; a slot can be booked once; double booking is refused.",
                           "Specification written"),
            review_pass,
            *_write_code("v1", BOOKING_MODULE),
            _tool("read_file", {"path": "booking.py"}, "review-read"),
            review_pass,
        ]
        return manager, worker
    if scenario == "approval":
        criteria = [CORE_CRITERION]
        if kind == "start":
            manager = [
                _tool("set_completion_criteria", {"criteria": criteria}, "criteria"),
                _tool("plan_tasks", {"packets": [_CORE_PACKET], "capabilities": ["developer_sandbox"],
                                     "checks": [["compile", "pytest"]]}, "plan"),
                _tool("delegate_task", {"task_id": "core"}, "delegate-core"),
                _tool("validate_task", {"task_id": "core"}, "validate-core"),
                _tool("review_task", {"task_id": "core"}, "review-core"),
                _tool("accept_task", {"task_id": "core", "reason": "Tests and review passed"}, "accept-core"),
                _tool("request_candidate_approval", {
                    "task_id": "core", "action": "publish_to_main", "target": "main",
                    "reason": "Publish the accepted booking core to the project's main branch."},
                    "request-approval"),
                _message("The booking core is accepted. I need your approval before publishing it to main."),
            ]
            worker = [*_write_code("v1", BOOKING_MODULE),
                      _tool("read_file", {"path": "booking.py"}, "review-read"), review_pass]
            return manager, worker

        def decide(_call):
            run = load_run()
            approval = next(iter(run.approvals.values()))
            if approval.status == ApprovalStatus.APPROVED:
                return _tool("authorize_candidate_action", {
                    "task_id": "core", "approval_id": approval.id, "action": "publish_to_main",
                    "target": "main"}, "authorize")
            return _tool("inspect_run", {}, "inspect-after-rejection")
        manager = [
            {"responder": decide},
            _finish(load_run, criteria, {CORE_CRITERION: "core"},
                    "Booking core delivered; publication decision recorded."),
            _message("Build complete. Your approval decision was recorded."),
        ]
        return manager, []
    if scenario == "fail-validation":
        criteria = [CORE_CRITERION]

        def recover(_call):
            run = load_run()
            artifact = run.artifacts[run.tasks["core"].artifact_ids[-1]]
            failed = [v.check for v in artifact.validations if not v.passed]
            return _tool("recover_task", {
                "task_id": "core", "classification": "BAD_OUTPUT",
                "evidence": "Trusted validation failed: " + ", ".join(failed),
                "reason": "Revise the candidate so double booking is refused"}, "recover")
        manager = [
            _tool("set_completion_criteria", {"criteria": criteria}, "criteria"),
            _tool("plan_tasks", {"packets": [_CORE_PACKET], "capabilities": ["developer_sandbox"],
                                 "checks": [["pytest"]]}, "plan"),
            _tool("delegate_task", {"task_id": "core"}, "delegate-core-1"),
            _tool("validate_task", {"task_id": "core"}, "validate-core-1"),
            {"responder": recover},
            _tool("delegate_task", {"task_id": "core"}, "delegate-core-2"),
            _tool("validate_task", {"task_id": "core"}, "validate-core-2"),
            _tool("review_task", {"task_id": "core"}, "review-core"),
            _tool("accept_task", {"task_id": "core", "reason": "Revised candidate passed tests and review"},
                  "accept-core"),
            _finish(load_run, criteria, {CORE_CRITERION: "core"}, "Booking core delivered after one revision."),
            _message("Build complete after one revision: the first candidate failed its tests and was fixed."),
        ]
        worker = [*_write_code("v1", BROKEN_MODULE), *_write_code("v2", BOOKING_MODULE),
                  _tool("read_file", {"path": "booking.py"}, "review-read"), review_pass]
        return manager, worker
    raise ValueError(f"Unknown scripted scenario {scenario}")


class ScriptedProvider:
    """Registered with the runtime's provider seam; one model pair per job."""

    def __init__(self, load_run_for: Callable[[str], Callable], delay: float):
        self._load_run_for = load_run_for
        self._delay = delay
        self._pairs: dict[str, tuple] = {}
        self._jobs: dict[str, tuple[str, str]] = {}
        self._lock = threading.Lock()

    def prepare(self, job_key: str, run_id: str, kind: str) -> None:
        with self._lock:
            self._jobs[job_key] = (run_id, kind)

    def release(self, job_key: str) -> None:
        with self._lock:
            self._jobs.pop(job_key, None)
            self._pairs.pop(job_key, None)

    def __call__(self, config: runtime.RuntimeConfig) -> tuple:
        job_key = config.api_key
        with self._lock:
            if job_key not in self._pairs:
                run_id, kind = self._jobs[job_key]
                load_run = self._load_run_for(run_id)
                scenario = scenario_for(load_run().objective)
                manager, worker = build_scripts(scenario, kind, load_run)
                self._pairs[job_key] = (_PacedModel(manager, self._delay), _PacedModel(worker, self._delay))
            return self._pairs[job_key]


def scripted_config(job_key: str, budget) -> runtime.RuntimeConfig:
    # The job key rides in api_key (never displayed or recorded); model names stay readable.
    return runtime.RuntimeConfig(provider=PROVIDER, api_key=job_key,
                                 base_url="https://scripted.invalid", manager_model="scripted-manager",
                                 worker_model="scripted-specialist", budget=budget)
