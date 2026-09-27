"""Assemble a completed run's deliverable from exactly the accepted bytes.

Assembly runs trusted platform code only; no generated code executes. Each
accepted code change is re-fingerprinted and must match the fingerprint recorded
when the kernel accepted it, so the archive contains what was validated and
reviewed, never a later edit. The project's own repository is not modified:
merging or pushing is a promotion that stays behind explicit human action.
"""
from __future__ import annotations

import hashlib
import io
import re
import subprocess
import tarfile
from pathlib import Path

from walter.models import Run
from walter.sandbox import WorkspaceManager, _excluded

from .engine import _GIT_ENV, git
from .views import _manifest


class DeliveryError(RuntimeError):
    pass


def _slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:60] or "caveman-project"


def _report(run: Run, project_name: str, files: dict[str, dict], documents: list[dict],
            cost_usd: float, cost_complete: bool) -> str:
    lines = [f"# Build report: {project_name}", "", "Assembled by Caveman from accepted work only.", "",
             "## Request", "", run.objective.strip(), "", "## Success criteria", ""]
    lines += [f"- {criterion}" for criterion in run.plan.completion_criteria]
    lines += ["", "## Accepted tasks", ""]
    for artifact_id in run.accepted_artifacts:
        artifact = run.artifacts[artifact_id]
        task = run.tasks[artifact.task_id]
        checks = ", ".join(f"{v.check}: {'passed' if v.passed else 'failed'}"
                           for v in artifact.validations) or "no executable checks"
        review = ("independent review passed" if artifact.reviews and artifact.reviews[-1].passed
                  else "no review recorded")
        lines.append(f"- **{task.packet.role}** — {task.packet.objective.strip()} "
                     f"(v{artifact.version}; {checks}; {review})")
    lines += ["", "## Files delivered", ""]
    lines += [f"- `{path}` — from task `{meta['task_id']}`" for path, meta in sorted(files.items())]
    if documents:
        lines += ["", "## Documents", ""]
        lines += [f"- `{doc['path']}`" for doc in documents]
    cost = f"${cost_usd:.4f}" + ("" if cost_complete else " (some calls reported no cost)")
    lines += ["", "## Cost", "", f"Provider-reported model cost: {cost}", ""]
    return "\n".join(lines)


def assemble(run: Run, repo: Path, out_dir: Path, project_name: str, *,
             cost_usd: float, cost_complete: bool) -> tuple[dict, str]:
    """Return (manifest, archive file name). Raises DeliveryError on any refusal."""
    if run.status != "completed":
        raise DeliveryError("Only a completed run can be delivered.")
    workspaces = WorkspaceManager(repo)
    files: dict[str, dict] = {}
    contents: dict[str, bytes] = {}
    deletions: dict[str, str] = {}
    documents: list[dict] = []
    conflicts: list[str] = []
    for index, artifact_id in enumerate(run.accepted_artifacts, 1):
        artifact = run.artifacts[artifact_id]
        body, manifest = _manifest(artifact.content)
        if artifact.workspace_fingerprint:
            workspace_id = (manifest or {}).get("workspace_id")
            if not workspace_id:
                raise DeliveryError(f"Accepted artifact {artifact_id} has no workspace manifest.")
            try:
                current = workspaces.fingerprint(workspace_id)
            except Exception as exc:  # retired or tampered workspace
                raise DeliveryError(
                    f"The accepted workspace for task {artifact.task_id} is no longer available.") from exc
            if current != artifact.workspace_fingerprint:
                raise DeliveryError(
                    f"The workspace for task {artifact.task_id} changed after acceptance; refusing to deliver it.")
            grant = workspaces.inspect_grant(workspace_id)
            baseline = {p for p in git("-C", grant.root, "ls-tree", "-r", "--name-only",
                                       grant.base_revision).splitlines() if not _excluded(p)}
            present = set(workspaces.list_files(workspace_id))
            for path in workspaces.changed_paths(workspace_id):
                data = workspaces.read_file(workspace_id, path).encode()
                if path in contents and contents[path] != data:
                    conflicts.append(path)
                    continue
                contents[path] = data
                files[path] = {"task_id": artifact.task_id, "artifact_id": artifact_id,
                               "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
            for path in sorted(baseline - present):
                deletions[path] = artifact.task_id
        else:
            path = f"docs/caveman/{index:02d}-{re.sub(r'[^A-Za-z0-9_-]+', '-', artifact.task_id)}.md"
            data = body.strip().encode() + b"\n"
            contents[path] = data
            documents.append({"path": path, "task_id": artifact.task_id, "artifact_id": artifact_id,
                              "sha256": hashlib.sha256(data).hexdigest()})
    if conflicts:
        raise DeliveryError("Accepted tasks changed the same files differently: "
                            + ", ".join(sorted(set(conflicts))))

    report = _report(run, project_name, files, documents, cost_usd, cost_complete).encode()
    contents["CAVEMAN_BUILD_REPORT.md"] = report
    slug = _slug(project_name)
    archive_name = f"{run.id}.tar.gz"
    out_dir.mkdir(parents=True, exist_ok=True)
    tree: dict[str, bytes] = {}
    for path in git("-C", str(repo), "ls-tree", "-r", "--name-only", "HEAD").splitlines():
        if not _excluded(path) and path not in deletions:
            tree[path] = _git_show(repo, path)
    tree.update(contents)
    temporary = out_dir / (archive_name + ".tmp")
    with tarfile.open(temporary, "w:gz") as archive:
        for path in sorted(tree):
            info = tarfile.TarInfo(f"{slug}/{path}")
            info.size = len(tree[path])
            info.mode = 0o644
            info.mtime = 0
            archive.addfile(info, io.BytesIO(tree[path]))
    temporary.replace(out_dir / archive_name)
    manifest = {"archive": archive_name, "root": slug, "files": files, "documents": documents,
                "deleted": sorted(deletions), "total_files": len(tree),
                "report": "CAVEMAN_BUILD_REPORT.md"}
    return manifest, archive_name


def _git_show(repo: Path, path: str) -> bytes:
    result = subprocess.run(["/usr/bin/git", "-C", str(repo), "show", f"HEAD:{path}"],
                            env=_GIT_ENV, capture_output=True, timeout=30)
    if result.returncode:
        raise DeliveryError(f"Could not read base file {path}")
    return result.stdout


def deliver_run(engine, platform, projector, run_id: str, *, retry: bool = False) -> None:
    """Assemble a completed run's archive once and record the outcome durably."""
    import logging

    existing = platform.delivery(run_id)
    if existing is not None and (existing.status == "ready" or not retry):
        return
    run = engine.load(run_id)
    if run.status != "completed":
        return
    record = platform.run_by_id(run_id)
    project = platform.project_by_id(record.project_id)
    usage = projector.usage(run, record)
    try:
        manifest, archive = assemble(run, engine.project_repo(record.project_id),
                                     engine.settings.deliveries_dir, project.name,
                                     cost_usd=usage["cost_usd"], cost_complete=usage["cost_complete"])
        platform.save_delivery(run_id, "ready", manifest, archive)
    except DeliveryError as exc:
        platform.save_delivery(run_id, "failed", {"error": engine.redact(str(exc), 2000)}, None)
    except Exception as exc:
        logging.getLogger("caveman.delivery").exception("Delivery assembly failed for run %s", run_id)
        platform.save_delivery(run_id, "failed",
                               {"error": engine.redact(f"{type(exc).__name__}: {exc}", 2000)}, None)
