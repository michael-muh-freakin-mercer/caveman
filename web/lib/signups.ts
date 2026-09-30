/**
 * Invite-only sign-up. CAVMAN_SIGNUP_ALLOWLIST is a comma-separated list of
 * email addresses and whole domains ("@example.com"). When it is set, only
 * matching addresses can create an account, by password or GitHub alike;
 * existing accounts keep signing in. Unset or empty means anyone can sign up.
 * Setting it also turns on email verification (see auth.ts), so it needs an
 * email provider (RESEND_API_KEY) in production.
 */
export type SignupAllowlist = { emails: Set<string>; domains: Set<string> } | null;

export function parseSignupAllowlist(raw: string | undefined): SignupAllowlist {
  const entries = (raw ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (entries.length === 0) return null;
  const emails = new Set<string>();
  const domains = new Set<string>();
  for (const entry of entries) {
    if (entry.startsWith("@")) domains.add(entry.slice(1));
    else emails.add(entry);
  }
  return { emails, domains };
}

export function signupAllowed(email: string, allowlist: SignupAllowlist): boolean {
  if (!allowlist) return true;
  const normalized = email.trim().toLowerCase();
  if (allowlist.emails.has(normalized)) return true;
  const at = normalized.lastIndexOf("@");
  return at > 0 && allowlist.domains.has(normalized.slice(at + 1));
}

export const SIGNUP_CLOSED_MESSAGE = "Cavman is invite-only for now. Ask for an invite and sign up with the address you were invited with.";
