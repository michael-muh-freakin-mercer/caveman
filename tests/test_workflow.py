"""The deterministic workflow driver: plan validation and loop behaviour."""
import asyncio
import json

import pytest

pytest.importorskip("agents")

from caveman.workflow import PlanProposal, WorkflowDriver
from walter.adapter import INITIAL_COMPLETION_CRITERION, DurableController
from walter.models import TaskStatus
from walter.orchestration import GateError, Orchestrator
from walter.store import SQLiteStore


def packet(task_id, dependencies=()):
    return {"task_id": task_id, "role": f"{task_id} specialist", "objective": f"Do {task_id}",
            "deliverable": f"{task_id} deliverable", "acceptance_criteria": ["It is done"],
            "stop_condition": "Done or blocked", "dependencies": list(dependencies)}


def plan(tasks, criteria=("First measurable criterion", "Second measurable criterion")):
    return PlanProposal.model_validate({"criteria": list(criteria), "tasks": tasks})


@pytest.fixture
def driver(tmp_path):
    core = Orchestrator(SQLiteStore(tmp_path / "ops.db"))
    run = core.create_run("Build a thing", [INITIAL_COMPLETION_CRITERION])
    controller = DurableController(core, run.id)
    state = {}
    yield WorkflowDriver(controller, load_state=lambda: state.get("s"),
                         save_state=lambda value: state.__setitem__("s", value)), state
    controller.close()


def test_plan_installs_criteria_tasks_and_coverage(driver):
    workflow, state = driver
    workflow._install_plan(plan([
        {"packet": packet("spec"), "capability": "model_only", "checks": ["result_schema"], "covers": [0]},
        {"packet": packet("code", ["spec"]), "capability": "model_only", "checks": ["result_schema"], "covers": [1]},
    ]))
    run = workflow.controller.inspect()
    assert run.plan.completion_criteria == ["First measurable criterion", "Second measurable criterion"]
    assert set(run.tasks) == {"spec", "code"}
    assert state["s"]["coverage"] == {"First measurable criterion": ["spec"],
                                      "Second measurable criterion": ["code"]}


@pytest.mark.parametrize("tasks,message", [
    ([{"packet": packet("a"), "capability": "model_only", "checks": ["result_schema"], "covers": [0]}],
     "not covered"),
    ([{"packet": packet("a", ["b"]), "capability": "model_only", "checks": ["result_schema"], "covers": [0, 1]},
      {"packet": packet("b"), "capability": "model_only", "checks": ["result_schema"], "covers": []}],
     "unknown or later"),
    ([{"packet": packet("a"), "capability": "developer_sandbox", "checks": ["result_schema"], "covers": [0, 1]}],
     "executable check"),
])
def test_invalid_plans_are_refused_before_anything_is_recorded(driver, tasks, message):
    workflow, state = driver
    with pytest.raises(ValueError, match=message):
        workflow._install_plan(plan(tasks))
    run = workflow.controller.inspect()
    assert run.tasks == {} and run.plan.completion_criteria == [INITIAL_COMPLETION_CRITERION]
    assert "s" not in state


def test_planner_gets_one_corrected_attempt_then_fails_closed(driver, monkeypatch):
    workflow, _ = driver
    calls = []
    bad = plan([{"packet": packet("a"), "capability": "model_only", "checks": ["result_schema"], "covers": [0]}])

    async def invoke(**kwargs):
        calls.append(kwargs["input"])
        return bad
    monkeypatch.setattr(workflow.controller, "_invoke", invoke)
    with pytest.raises(GateError, match="could not produce a plan"):
        asyncio.run(workflow.plan())
    assert len(calls) == 2 and "rejected by validation" in calls[1]


def test_all_model_only_run_completes_through_the_kernel(driver, monkeypatch):
    workflow, _ = driver
    good = plan([
        {"packet": packet("spec"), "capability": "model_only", "checks": ["result_schema"], "covers": [0, 1]}])

    async def invoke(**kwargs):
        if kwargs["role"] == "planner":
            return good
        if kwargs["role"] == "worker":
            from walter.contracts import WorkerResult
            return WorkerResult(task_id="spec", status="completed", summary="done", deliverable="The spec.")
        from walter.adapter import ReviewResult
        return ReviewResult(passed=True, evidence=["fine"], reason="Meets criteria")
    monkeypatch.setattr(workflow.controller, "_invoke", invoke)
    message = asyncio.run(workflow.run())
    run = workflow.controller.inspect()
    assert run.status == "completed" and message.startswith("Build complete")
    assert run.tasks["spec"].status == TaskStatus.ACCEPTED
    kinds = [event.kind for event in workflow.core.store.events(run.id)]
    assert kinds.index("artifact.validation_completed") < kinds.index("artifact.reviewed") < kinds.index("run.completed")


def test_failed_review_routes_through_kernel_recovery(driver, monkeypatch):
    workflow, _ = driver
    reviews = iter([False, True])

    async def invoke(**kwargs):
        if kwargs["role"] == "planner":
            return plan([{"packet": packet("spec"), "capability": "model_only", "checks": ["result_schema"],
                          "covers": [0, 1]}])
        if kwargs["role"] == "worker":
            from walter.contracts import WorkerResult
            return WorkerResult(task_id="spec", status="completed", summary="done", deliverable="The spec.")
        from walter.adapter import ReviewResult
        passed = next(reviews)
        return ReviewResult(passed=passed, evidence=["checked"], reason="ok" if passed else "Missing detail")
    monkeypatch.setattr(workflow.controller, "_invoke", invoke)
    asyncio.run(workflow.run())
    run = workflow.controller.inspect()
    assert run.status == "completed"
    [failure] = run.failures
    assert failure.classification.value == "BAD_OUTPUT" and "Missing detail" in failure.evidence
    assert run.recoveries[0].action == "REVISE" and run.tasks["spec"].attempts == 2
    assert json.loads(run.artifacts[run.tasks["spec"].artifact_ids[0]].reviews[0].evidence)["passed"] is False
