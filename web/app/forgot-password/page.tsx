import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/password-forms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" subtitle="We will email you a link to choose a new one." pendingPrompt={null}>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
