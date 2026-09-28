import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/password-forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return (
    <AuthShell title="Choose a new password" subtitle="Signing in again everywhere is required afterwards." pendingPrompt={null}>
      <ResetPasswordForm token={token ?? null} tokenError={error ?? null} />
    </AuthShell>
  );
}
