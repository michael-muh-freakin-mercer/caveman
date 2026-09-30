"use client";

import { Download, LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { deleteUser } from "@/lib/auth-client";

const CONFIRMATION = "delete my account";

export function AccountData({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { typed: useId(), password: useId() };

  async function remove() {
    setBusy(true);
    setError(null);
    const result = await deleteUser(hasPassword ? { password } : {});
    if (result.error) {
      setBusy(false);
      setError(result.error.status === 400 && !hasPassword
        ? "For your security, sign out and sign in again, then delete your account."
        : result.error.message ?? "Cavman could not delete your account.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <>
      <p className="text-sm text-fg-soft">
        Download a copy of your account, projects, runs, decisions, checks and events as JSON. Delivered project files
        stay downloadable from each completed run.
      </p>
      <a href="/api/account/export" download className={buttonClass("secondary", "md", "mt-3")}>
        <Download className="h-4 w-4" aria-hidden="true" /> Download my data
      </a>
      <div className="mt-6 border-t border-line pt-5">
        <p className="text-sm text-fg-soft">
          Deleting your account permanently removes your projects, runs, delivered archives and sign-in. Repositories you
          published to GitHub stay in your GitHub account.
        </p>
        <Button variant="danger" className="mt-3" onClick={() => dialog.current?.showModal()}>
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete account
        </Button>
      </div>
      <dialog ref={dialog} aria-labelledby="delete-title" className="m-auto w-[min(520px,92vw)] rounded-xl border-2 border-ink bg-surface p-6 text-fg shadow-[6px_6px_0_0_var(--color-ink)] backdrop:bg-ink/50">
        <h2 id="delete-title" className="text-lg font-semibold">Delete your account?</h2>
        <p className="mt-2 text-sm text-muted">
          This cannot be undone. Running builds must be stopped first.
        </p>
        <label htmlFor={ids.typed} className="mt-5 block text-xs text-muted">
          Type <span className="font-mono text-fg-soft">{CONFIRMATION}</span> to confirm
        </label>
        <input id={ids.typed} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off"
          className="mt-1 h-10 w-full rounded-md border-2 border-line-strong bg-surface px-3 text-sm focus:border-ink focus:outline-none" />
        {hasPassword ? (
          <>
            <label htmlFor={ids.password} className="mt-4 block text-xs text-muted">Password</label>
            <input id={ids.password} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
              className="mt-1 h-10 w-full rounded-md border-2 border-line-strong bg-surface px-3 text-sm focus:border-ink focus:outline-none" />
          </>
        ) : null}
        {error ? <p role="alert" className="mt-4 text-sm text-bad">{error}</p> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => dialog.current?.close()}>Cancel</Button>
          <Button variant="danger" onClick={remove} disabled={busy || typed.trim().toLowerCase() !== CONFIRMATION || (hasPassword && !password)}>
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Delete permanently
          </Button>
        </div>
      </dialog>
    </>
  );
}
