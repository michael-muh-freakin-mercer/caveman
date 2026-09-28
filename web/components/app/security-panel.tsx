"use client";

import { LoaderCircle, LogOut, Monitor } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { changePassword } from "@/lib/auth-client";
import { relativeTime } from "@/lib/format";

export type SessionSummary = { id: string; device: string; createdAt: string; current: boolean };

async function revoke(body: { id?: string; others?: boolean }): Promise<string | null> {
  const response = await fetch("/api/account/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.ok) return null;
  const detail = await response.json().catch(() => ({}));
  return typeof detail.detail === "string" ? detail.detail : "That did not work. Try again.";
}

export function SecurityPanel({ sessions, hasPassword }: { sessions: SessionSummary[]; hasPassword: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const ids = { current: useId(), next: useId() };
  const others = sessions.filter((item) => !item.current);

  async function run(key: string, body: { id?: string; others?: boolean }) {
    setBusy(key);
    setError(null);
    setNotice(null);
    const problem = await revoke(body);
    setBusy(null);
    if (problem) setError(problem);
    else router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted">Signed-in devices</p>
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
          {sessions.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-fg-soft">
                <Monitor className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="truncate">{item.device}</span>
                <span className="shrink-0 text-xs text-faint">since {relativeTime(item.createdAt)}</span>
              </span>
              {item.current ? (
                <span className="shrink-0 text-xs text-ok">This device</span>
              ) : (
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => run(item.id, { id: item.id })}
                  aria-label={`Sign out ${item.device}`}>
                  {busy === item.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
        {others.length ? (
          <Button variant="secondary" size="sm" className="mt-3" disabled={busy !== null} onClick={() => run("others", { others: true })}>
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Sign out all other devices
          </Button>
        ) : null}
      </div>

      {hasPassword ? (
        <form
          method="post"
          className="space-y-3 border-t border-line pt-5"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            setBusy("password");
            setError(null);
            setNotice(null);
            const result = await changePassword({
              currentPassword: String(data.get("current") ?? ""),
              newPassword: String(data.get("next") ?? ""),
              revokeOtherSessions: true,
            });
            setBusy(null);
            if (result.error) {
              setError(result.error.message ?? "The password could not be changed.");
              return;
            }
            form.reset();
            setNotice("Password changed. Other devices were signed out.");
            router.refresh();
          }}
        >
          <p className="text-xs text-muted">Change password</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={ids.current} className="text-xs text-muted">Current password</label>
              <input id={ids.current} name="current" type="password" required autoComplete="current-password"
                className="mt-1 h-10 w-full rounded-lg border border-line-strong bg-surface-2 px-3 text-sm focus:border-glacier focus:outline-none" />
            </div>
            <div>
              <label htmlFor={ids.next} className="text-xs text-muted">New password</label>
              <input id={ids.next} name="next" type="password" required minLength={10} autoComplete="new-password"
                className="mt-1 h-10 w-full rounded-lg border border-line-strong bg-surface-2 px-3 text-sm focus:border-glacier focus:outline-none" />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={busy !== null}>
            {busy === "password" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            Change password
          </Button>
        </form>
      ) : null}

      {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-ok">{notice}</p> : null}
    </div>
  );
}
