"""Starting a project from a public GitHub repository, and planning on existing files.

The network is never used: GitHub metadata is stubbed and the clone comes from a
local upstream repository over file://, which the importer otherwise refuses.
"""
import subprocess

import pytest

from caveman import importer
from walter.sandbox import INTEGRATION_REF, WorkspaceManager


def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True,
                          text=True).stdout.strip()


PUBLIC = {"private": False, "visibility": "public", "size": 12, "default_branch": "trunk"}


@pytest.fixture
def upstream(tmp_path):
    repo = tmp_path / "upstream"
    (repo / "src").mkdir(parents=True)
    (repo / "src" / "app.py").write_text("def hello():\n    return 'hi'\n")
    (repo / "README.md").write_text("# Upstream\n")
    (repo / ".gitignore").write_text("build/\n")
    (repo / ".env").write_text("SECRET=do-not-import\n")
    (repo / "deploy.pem").write_text("-----BEGIN KEY-----\n")
    git(tmp_path, "init", "-q", "-b", "trunk", str(repo))
    git(repo, "add", "-A")
    git(repo, "-c", "user.name=u", "-c", "user.email=u@u", "commit", "-qm", "first")
    (repo / "src" / "more.py").write_text("X = 1\n")
    git(repo, "add", "-A")
    git(repo, "-c", "user.name=u", "-c", "user.email=u@u", "commit", "-qm", "second")
    return repo


@pytest.fixture
def local_github(monkeypatch, upstream):
    """Point the importer at the local upstream, keeping every other rule."""
    metadata = dict(PUBLIC)
    monkeypatch.setattr(importer, "repository_metadata", lambda source, api_url: metadata)
    monkeypatch.setattr(importer, "ALLOWED_PROTOCOLS", "file")
    monkeypatch.setattr(importer.Source, "clone_url", property(lambda self: f"file://{upstream}"))
    return metadata


def run_import(tmp_path, **limits):
    return importer.import_repository(
        "https://github.com/octo/demo", tmp_path / "project" / "repo", "Demo",
        api_url="https://api.github.invalid", max_mb=limits.get("max_mb", 50),
        max_files=limits.get("max_files", 100))


@pytest.mark.parametrize("url", [
    "http://github.com/octo/demo", "git@github.com:octo/demo.git", "ssh://github.com/octo/demo",
    "https://github.com/octo", "https://github.com/octo/demo/tree/main", "https://github.com.evil.test/octo/demo",
    "https://user:pass@github.com/octo/demo", "https://github.com/octo/demo?x=1", "https://gitlab.com/octo/demo",
    "file:///etc", "https://github.com/-octo/demo", "https://github.com/octo/..",
])
def test_only_plain_public_github_urls_are_accepted(url):
    with pytest.raises(importer.RepositoryImportError):
        importer.parse_url(url)


def test_accepted_url_forms():
    assert importer.parse_url("https://github.com/octo/demo").full_name == "octo/demo"
    assert importer.parse_url("https://github.com/octo/demo.git").full_name == "octo/demo"
    assert importer.parse_url(" https://github.com/Octo-Cat/my.repo_1/ ").full_name == "Octo-Cat/my.repo_1"


def test_import_keeps_files_but_not_history_remote_or_secrets(tmp_path, local_github, upstream):
    imported = run_import(tmp_path)
    repo = tmp_path / "project" / "repo"
    assert imported.commit == git(upstream, "rev-parse", "HEAD") and imported.branch == "trunk"
    assert imported.files == 4 and set(imported.dropped) == {".env", "deploy.pem"}
    # One local commit on main, no parents, no remote, no shallow state.
    assert git(repo, "branch", "--show-current") == "main"
    assert git(repo, "rev-list", "--count", "HEAD") == "1"
    assert git(repo, "remote") == "" and not (repo / ".git" / "shallow").exists()
    assert "octo/demo" in git(repo, "log", "-1", "--format=%B")
    files = set(git(repo, "ls-tree", "-r", "--name-only", "HEAD").splitlines())
    assert files == {".gitignore", "README.md", "src/app.py", "src/more.py"}
    assert not (repo / ".env").exists() and (repo / "src" / "more.py").read_text() == "X = 1\n"
    # Caveman state is ignored locally without changing the project's own .gitignore.
    assert ".local/" in (repo / ".git" / "info" / "exclude").read_text()
    assert (repo / ".gitignore").read_text() == "build/\n"
    assert git(repo, "status", "--porcelain") == ""
    # The imported repository works as a Caveman project: integration starts from it.
    workspaces = WorkspaceManager(repo)
    assert workspaces.tracked_files() == sorted(files)
    head = workspaces.integration_head(create=True)
    assert git(repo, "rev-parse", INTEGRATION_REF) == head


@pytest.mark.parametrize("kind", ["symlink", "submodule"])
def test_links_and_submodules_are_refused_and_nothing_is_left_behind(tmp_path, local_github, upstream, kind):
    if kind == "submodule":
        commit = git(upstream, "rev-parse", "HEAD")
        git(upstream, "update-index", "--add", "--cacheinfo", f"160000,{commit},vendor/lib")
    else:
        (upstream / "escape").symlink_to("/etc/passwd")
        git(upstream, "add", "-A")
    git(upstream, "-c", "user.name=u", "-c", "user.email=u@u", "commit", "-qm", kind)
    with pytest.raises(importer.RepositoryImportError, match=kind.replace("symlink", "symbolic link")):
        run_import(tmp_path)
    assert not (tmp_path / "project" / "repo").exists()


def test_private_oversized_and_disabled_imports_are_refused(tmp_path, local_github):
    local_github["private"] = True
    with pytest.raises(importer.RepositoryImportError, match="public"):
        run_import(tmp_path)
    local_github.update(private=False, size=10 * 1024)
    with pytest.raises(importer.RepositoryImportError, match="larger than the 1 MB"):
        run_import(tmp_path, max_mb=1)
    local_github["size"] = 1
    with pytest.raises(importer.RepositoryImportError, match="more than 2 files"):
        run_import(tmp_path, max_files=2)
    with pytest.raises(importer.RepositoryImportError, match="disabled"):
        run_import(tmp_path, max_mb=0)
    assert not (tmp_path / "project" / "repo").exists()


def test_git_refuses_non_https_transport_by_default(tmp_path, monkeypatch, upstream):
    monkeypatch.setattr(importer, "repository_metadata", lambda source, api_url: dict(PUBLIC))
    monkeypatch.setattr(importer.Source, "clone_url", property(lambda self: f"file://{upstream}"))
    with pytest.raises(importer.RepositoryImportError, match="Git could not import"):
        run_import(tmp_path)
    assert not (tmp_path / "project" / "repo").exists()


def test_tracked_files_prefers_the_integration_head_and_hides_state(tmp_path):
    repo = tmp_path / "p"
    repo.mkdir()
    (repo / "a.py").write_text("A = 1\n")
    (repo / ".env").write_text("X=1\n")
    git(repo, "init", "-q")
    git(repo, "add", "-A")
    git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init")
    workspaces = WorkspaceManager(repo)
    assert workspaces.tracked_files() == ["a.py"]
    head = workspaces.integration_head(create=True)
    grant = workspaces.create_candidate("run", "t", "w", base_revision=head)
    workspaces.write_file(grant.id, "b.py", "B = 1\n", worker_id="w")
    workspaces.integrate(grant.id, workspaces.freeze(grant.id), "Add b")
    assert workspaces.tracked_files() == ["a.py", "b.py"]
    assert workspaces.tracked_files("HEAD") == ["a.py"]


def test_api_starts_projects_and_builds_from_an_imported_repository(tmp_path, local_github):
    pytest.importorskip("agents")
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient

    from caveman.api import create_app
    from caveman.config import Settings

    token = "t" * 40
    headers = {"Authorization": f"Bearer {token}", "X-Caveman-User": "alice"}
    settings = Settings(data_dir=tmp_path / "data", api_token=token, executor="scripted")
    with TestClient(create_app(settings)) as client:
        response = client.post("/api/projects", headers=headers, json={
            "name": "Demo", "repository_url": "https://github.com/octo/demo"})
        assert response.status_code == 201, response.text
        project = response.json()
        assert project["settings"]["source"]["url"] == "https://github.com/octo/demo"
        assert project["settings"]["source"]["files"] == 4
        repo = settings.projects_dir / project["id"] / "repo"
        assert (repo / "src" / "app.py").exists()

        response = client.post("/api/builds", headers=headers, json={
            "prompt": "Add a greeting endpoint", "settings": {"repository_url": "https://github.com/octo/demo"}})
        assert response.status_code == 201, response.text
        assert client.get(f"/api/projects/{response.json()['project_id']}",
                          headers=headers).json()["settings"]["source"]["branch"] == "trunk"

        # An existing project keeps its files; imports only start new projects.
        response = client.post("/api/builds", headers=headers, json={
            "prompt": "Add a greeting endpoint", "project_id": project["id"],
            "settings": {"repository_url": "https://github.com/octo/demo"}})
        assert response.status_code == 422

        before = sorted(p.name for p in settings.projects_dir.iterdir())
        response = client.post("/api/projects", headers=headers, json={
            "name": "Bad", "repository_url": "https://example.com/octo/demo"})
        assert response.status_code == 422 and "github.com" in response.json()["detail"]
        local_github["private"] = True
        response = client.post("/api/builds", headers=headers, json={
            "prompt": "Add a greeting endpoint", "settings": {"repository_url": "https://github.com/octo/demo"}})
        assert response.status_code == 422 and "public" in response.json()["detail"]
        assert sorted(p.name for p in settings.projects_dir.iterdir()) == before
        assert len(client.get("/api/projects", headers=headers).json()["projects"]) == 2
