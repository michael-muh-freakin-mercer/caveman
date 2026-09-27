"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import { safeNext } from "@/lib/prompt-storage";

function GithubIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function AuthForm({ mode, next, githubEnabled }: { mode: "sign-in" | "sign-up"; next: string | null; githubEnabled: boolean }) {
  const router = useRouter();
  const destination = safeNext(next);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const ids = { name: useId(), email: useId(), password: useId(), error: useId() };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const name = String(data.get("name") ?? "").trim() || email.split("@")[0];
    setBusy(true);
    setError(null);
    const result =
      mode === "sign-up"
        ? await signUp.email({ email, password, name })
        : await signIn.email({ email, password });
    if (result.error) {
      setError(
        result.error.code === "EMAIL_NOT_VERIFIED"
          ? "Verify your email first: we sent you a link. Check your inbox, then sign in."
          : (result.error.message ?? "That did not work. Check your details and try again."),
      );
      setBusy(false);
      return;
    }
    if (mode === "sign-up" && result.data && !("token" in result.data && result.data.token)) {
      // Email verification is required on this server: no session until verified.
      setNotice(`Check ${email} for a link to verify your address, then sign in.`);
      setBusy(false);
      return;
    }
    router.push(destination);
    router.refresh();
  }

  async function github() {
    setBusy(true);
    await signIn.social({ provider: "github", callbackURL: destination });
  }

  const other = mode === "sign-in" ? "/sign-up" : "/sign-in";
  const field = "mt-1.5 block h-11 w-full rounded-lg border border-line-strong bg-surface-2 px-3 text-fg placeholder:text-faint focus:border-glacier focus:outline-none";

  return (
    <div>
      {githubEnabled ? (
        <>
          <button
            type="button"
            onClick={github}
            disabled={busy}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface-2 text-sm font-medium text-fg hover:bg-surface-3 disabled:opacity-50"
          >
            <GithubIcon /> Continue with GitHub
          </button>
          <div className="my-6 flex items-center gap-3 text-xs text-faint" aria-hidden="true">
            <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
          </div>
        </>
      ) : null}
      <form onSubmit={submit} className="space-y-4" aria-describedby={error ? ids.error : undefined}>
        {mode === "sign-up" ? (
          <div>
            <label htmlFor={ids.name} className="text-sm text-fg-soft">Name</label>
            <input id={ids.name} name="name" autoComplete="name" className={field} placeholder="Your name" />
          </div>
        ) : null}
        <div>
          <label htmlFor={ids.email} className="text-sm text-fg-soft">Email</label>
          <input id={ids.email} name="email" type="email" required autoComplete="email" className={field} placeholder="you@example.com" />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor={ids.password} className="text-sm text-fg-soft">Password</label>
            {mode === "sign-in" ? (
              <Link href="/forgot-password" className="text-xs text-muted hover:text-fg">Forgot password?</Link>
            ) : null}
          </div>
          <input
            id={ids.password}
            name="password"
            type="password"
            required
            minLength={10}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            className={field}
            placeholder={mode === "sign-up" ? "At least 10 characters" : ""}
          />
        </div>
        {error ? (
          <p id={ids.error} role="alert" className="text-sm text-bad">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="rounded-lg border border-ok/30 bg-ok/5 px-3 py-2 text-sm text-ok">
            {notice}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-ember text-sm font-semibold text-ink hover:bg-ember-hot disabled:opacity-60"
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {mode === "sign-up" ? "Create account" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {mode === "sign-in" ? "New to Caveman? " : "Already have an account? "}
        <Link href={`${other}${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-ember hover:underline">
          {mode === "sign-in" ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </div>
  );
}
