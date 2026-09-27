import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { githubEnabled } from "@/lib/auth";
import { promptFromNext } from "@/lib/next-param";
import { safeNext } from "@/lib/prompt-storage";
import { currentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sign In" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await currentUser().catch(() => null)) redirect(safeNext(next));
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to follow your builds." pendingPrompt={promptFromNext(next)}>
      <AuthForm mode="sign-in" next={next ?? null} githubEnabled={githubEnabled} />
    </AuthShell>
  );
}
