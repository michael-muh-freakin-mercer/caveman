import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { githubEnabled } from "@/lib/auth";
import { promptFromNext } from "@/lib/next-param";
import { safeNext } from "@/lib/prompt-storage";
import { currentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sign In" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const { next, reset } = await searchParams;
  if (await currentUser().catch(() => null)) redirect(safeNext(next));
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to follow your builds." pendingPrompt={promptFromNext(next)}>
      {reset ? (
        <p role="status" className="mb-5 rounded-lg border border-ok/30 bg-ok/5 px-3 py-2 text-sm text-ok">
          Your password was changed. Sign in with the new one.
        </p>
      ) : null}
      <AuthForm mode="sign-in" next={next ?? null} githubEnabled={githubEnabled} />
    </AuthShell>
  );
}
