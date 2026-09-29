import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/password-forms";
import { captchaSiteKey } from "@/lib/captcha";

export const metadata: Metadata = { title: "Reset password" };
// Rendered per request so the CAPTCHA site key is read at runtime, not baked in at build.
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" subtitle="We will email you a link to choose a new one." pendingPrompt={null}>
      <ForgotPasswordForm captchaSiteKey={captchaSiteKey} />
    </AuthShell>
  );
}
