"""Assemble a completed run's deliverable from exactly the accepted bytes.

Assembly runs trusted platform code only; no generated code executes.

Runs that integrate accepted code deliver the tree at the project's integration
head, after checking that the head is the last commit the kernel recorded and
that every recorded integration is in its history: each of those commits holds
exactly the bytes that were validated and reviewed.

Older runs without integration fall back to re-fingerprinting each accepted
workspace. Nothing here pushes or promotes anything; that stays behind explicit
human action.
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


def _documents(run: Run) -> tuple[dict[str, bytes], list[dict]]:
    contents: dict[str, bytes] = {}
    documents: list[dict] = []
    for index, artifact_id in enumerate(run.accepted_artifacts, 1):
        artifact = run.artifacts[artifact_id]
        if artifact.workspace_fingerprint:
            continue
        body, _ = _manifest(artifact.content)
        path = f"docs/caveman/{index:02d}-{re.sub(r'[^A-Za-z0-9_-]+', '-', artifact.task_id)}.md"
        data = body.strip().encode() + b"\n"
        contents[path] = data
        documents.append({"path": path, "task_id": artifact.task_id, "artifact_id": artifact_id,
                          "sha256": hashlib.sha256(data).hexdigest()})
    return contents, documents


def _write_archive(tree: dict[str, bytes], out_dir: Path, run_id: str, slug: str) -> str:
    archive_name = f"{run_id}.tar.gz"
    out_dir.mkdir(parents=True, exist_ok=True)
    temporary = out_dir / (archive_name + ".tmp")
    with tarfile.open(temporary, "w:gz") as archive:
        for path in sorted(tree):
            info = tarfile.TarInfo(f"{slug}/{path}")
            info.size = len(tree[path])
            info.mode = 0o644
            info.mtime = 0
            archive.addfile(info, io.BytesIO(tree[path]))
    temporary.replace(out_dir / archive_name)
    return archive_name


def _tree_at(repo: Path, revision: str) -> dict[str, bytes]:
    names = git("-C", str(repo), "ls-tree", "-r", "-z", "--name-only", revision).split("\0")
    return {name: _git_show(repo, name, revision) for name in names if name and not _excluded(name)}


def _assemble_integrated(run: Run, repo: Path, out_dir: Path, project_name: str, code: list,
                         cost_usd: float, cost_complete: bool) -> tuple[dict, str]:
    from walter.sandbox import INTEGRATION_REF

    commits = {artifact.integrated_commit: artifact for artifact in code}
    head = git("-C", str(repo), "rev-parse", "--verify", INTEGRATION_REF + "^{commit}").strip()
    if head not in commits:
        raise DeliveryError("The integration branch moved outside Caveman; refusing to deliver it.")
    for commit in commits:
        if subprocess.run(["/usr/bin/git", "-C", str(repo), "merge-base", "--is-ancestor", commit, head],
                          env=_GIT_ENV, capture_output=True, timeout=30).returncode:
            raise DeliveryError("An accepted change is missing from the integration branch.")
    tree = _tree_at(repo, head)
    base = git("-C", str(repo), "rev-parse", "HEAD").strip()
    changed = [name for name in git("-C", str(repo), "diff", "-z", "--name-only", base, head).split("\0")
               if name and not _excluded(name)]
    files: dict[str, dict] = {}
    for path in changed:
        if path not in tree:
            continue
        last = git("-C", str(repo), "log", "-1", "--format=%H", head, "--", path).strip()
        owner = commits.get(last)
        files[path] = {"task_id": owner.task_id if owner else None,
                       "artifact_id": owner.id if owner else None,
                       "sha256": hashlib.sha256(tree[path]).hexdigest(), "bytes": len(tree[path])}
    deleted = sorted(set(_tree_at(repo, base)) - set(tree))
    doc_contents, documents = _documents(run)
    tree.update(doc_contents)
    tree["CAVEMAN_BUILD_REPORT.md"] = _report(run, project_name, files, documents, cost_usd,
                                              cost_complete).encode()
    slug = _slug(project_name)
    archive = _write_archive(tree, out_dir, run.id, slug)
    return ({"archive": archive, "root": slug, "commit": head, "files": files, "documents": documents,
             "deleted": deleted, "total_files": len(tree), "report": "CAVEMAN_BUILD_REPORT.md"}, archive)


def assemble(run: Run, repo: Path, out_dir: Path, project_name: str, *,
             cost_usd: float, cost_complete: bool) -> tuple[dict, str]:
    """Return (manifest, archive file name). Raises DeliveryError on any refusal."""
    if run.status != "completed":
        raise DeliveryError("Only a completed run can be delivered.")
    code = [run.artifacts[a] for a in run.accepted_artifacts if run.artifacts[a].workspace_fingerprint]
    if code and all(artifact.integrated_commit for artifact in code):
        return _assemble_integrated(run, repo, out_dir, project_name, code, cost_usd, cost_complete)
    # Runs without integration (and documents-only runs) use the workspace path.
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


def _git_show(repo: Path, path: str, revision: str = "HEAD") -> bytes:
    result = subprocess.run(["/usr/bin/git", "-C", str(repo), "show", f"{revision}:{path}"],
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
