"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { TurnstileWidget } from "@/components/auth/turnstile";
import { requestPasswordReset, resetPassword } from "@/lib/auth-client";
import { useHydrated } from "@/lib/use-hydrated";

const field =
  "mt-1.5 block h-11 w-full rounded-lg border border-line-strong bg-surface-2 px-3 text-fg placeholder:text-faint focus:border-glacier focus:outline-none";
const submit =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-ember text-sm font-semibold text-ink hover:bg-ember-hot disabled:opacity-60";

// Error codes Better Auth's captcha plugin returns for a missing or rejected token.
const CAPTCHA_REJECTED = new Set(["MISSING_RESPONSE", "VERIFICATION_FAILED"]);

export function ForgotPasswordForm({ captchaSiteKey = null }: { captchaSiteKey?: string | null }) {
  const hydrated = useHydrated();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaRound, setCaptchaRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  if (sent) {
    return (
      <p role="status" className="text-sm text-fg-soft">
        If an account exists for that address, a reset link is on its way. It expires in one hour.
      </p>
    );
  }
  return (
    <form
      method="post"
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
        const fetchOptions = captchaToken ? { headers: { "x-captcha-response": captchaToken } } : undefined;
        const result = await requestPasswordReset({ email, redirectTo: "/reset-password", fetchOptions });
        setBusy(false);
        if (captchaSiteKey) setCaptchaRound((round) => round + 1);
        // A rejected human check says nothing about the account: keep the form for a fresh attempt.
        if (result.error && CAPTCHA_REJECTED.has(result.error.code ?? "")) {
          setError("The human check failed. Complete it again, then resend.");
          return;
        }
        // Same message whether or not the account exists, so addresses cannot be probed.
        if (result.error && result.error.status >= 500) setError("Password reset is unavailable right now. Try again later.");
        else setSent(true);
      }}
    >
      <div>
        <label htmlFor={id} className="text-sm text-fg-soft">Email</label>
        <input id={id} name="email" type="email" required autoComplete="email" className={field} />
      </div>
      {captchaSiteKey ? (
        <TurnstileWidget siteKey={captchaSiteKey} onToken={setCaptchaToken} resetKey={captchaRound} />
      ) : null}
      {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
      <button type="submit" disabled={busy || !hydrated || (Boolean(captchaSiteKey) && !captchaToken)} className={submit}>
        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        Send reset link
      </button>
      <p className="text-center text-sm text-muted">
        <Link href="/sign-in" className="text-ember hover:underline">Back to sign in</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token, tokenError }: { token: string | null; tokenError: string | null }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  if (!token || tokenError) {
    return (
      <div role="alert" className="space-y-4 text-sm">
        <p className="text-bad">This reset link is invalid or has expired.</p>
        <Link href="/forgot-password" className="text-ember hover:underline">Request a new link</Link>
      </div>
    );
  }
  return (
    <form
      method="post"
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        const newPassword = String(new FormData(event.currentTarget).get("password") ?? "");
        const result = await resetPassword({ newPassword, token });
        setBusy(false);
        if (result.error) {
          setError(result.error.message ?? "The password could not be changed.");
          return;
        }
        router.push("/sign-in?reset=1");
      }}
    >
      <div>
        <label htmlFor={id} className="text-sm text-fg-soft">New password</label>
        <input id={id} name="password" type="password" required minLength={10} autoComplete="new-password"
          placeholder="At least 10 characters" className={field} />
      </div>
      {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
      <button type="submit" disabled={busy || !hydrated} className={submit}>
        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        Set new password
      </button>
    </form>
  );
}
