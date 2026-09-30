"use client";

import { ExternalLink, LoaderCircle } from "lucide-react";
import { GithubIcon } from "@/components/brand/github-icon";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { linkSocial } from "@/lib/auth-client";
import type { RunDetail } from "@/lib/types";

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "cavman-project";
}

export function PublishPanel({ run, onPublished }: { run: RunDetail; onPublished: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(slugify(run.project_name));
  const [isPrivate, setPrivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsScope, setNeedsScope] = useState<string | null>(null);
  const ids = { name: useId(), visibility: useId() };
  const commit = run.delivery?.commit;

  if (run.publication) {
    return (
      <a href={run.publication.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface-2 px-4 text-sm text-fg hover:bg-surface-3">
        <GithubIcon /> View Repository <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    );
  }
  if (!commit) return null;

  async function publish() {
    setBusy(true);
    setError(null);
    setNeedsScope(null);
    const response = await fetch(`/api/publish/${run.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, private: isPrivate, confirm: true }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (response.ok) {
      dialog.current?.close();
      await onPublished();
      return;
    }
    if (body.needs_scope) setNeedsScope(body.needs_scope);
    setError(typeof body.detail === "string" ? body.detail : "Publishing failed.");
  }

  return (
    <>
      <Button variant="secondary" onClick={() => dialog.current?.showModal()}>
        <GithubIcon /> Publish to GitHub
      </Button>
      <dialog ref={dialog} aria-labelledby="publish-title" className="m-auto w-[min(560px,92vw)] rounded-2xl border border-line-strong bg-surface p-6 text-fg backdrop:bg-ink/80">
        <h2 id="publish-title" className="text-lg font-semibold">Publish to GitHub</h2>
        <p className="mt-2 text-sm text-muted">
          Cavman will create a new repository in your GitHub account and push the verified project (commit{" "}
          <span className="font-mono text-fg-soft">{commit.slice(0, 7)}</span>) to its <span className="font-mono">main</span> branch.
          Nothing else is created, changed or overwritten.
        </p>
        <label htmlFor={ids.name} className="mt-5 block text-xs text-muted">Repository name</label>
        <input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} maxLength={100}
          className="mt-1 h-10 w-full rounded-lg border border-line-strong bg-surface-2 px-3 font-mono text-sm focus:border-glacier focus:outline-none" />
        <fieldset className="mt-4">
          <legend className="text-xs text-muted">Visibility</legend>
          <div className="mt-1 flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name={ids.visibility} checked={isPrivate} onChange={() => setPrivate(true)} /> Private</label>
            <label className="flex items-center gap-2"><input type="radio" name={ids.visibility} checked={!isPrivate} onChange={() => setPrivate(false)} /> Public</label>
          </div>
        </fieldset>
        {error ? <p role="alert" className="mt-4 text-sm text-bad">{error}</p> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => dialog.current?.close()}>Cancel</Button>
          {needsScope ? (
            <Button onClick={() => linkSocial({ provider: "github", scopes: [needsScope], callbackURL: window.location.href })}>
              <GithubIcon /> Grant GitHub access
            </Button>
          ) : (
            <Button onClick={publish} disabled={busy || !name.trim()}>
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Create repository and push
            </Button>
          )}
        </div>
      </dialog>
    </>
  );
}
