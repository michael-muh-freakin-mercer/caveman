import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth, ensureAuthSchema } from "@/lib/auth";
import { CavmanApiError, cavmanFetch } from "@/lib/cavman";

/**
 * Download everything Cavman holds for the signed-in account: the account
 * record, linked sign-in methods (never their tokens) and every project and run.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  await ensureAuthSchema();
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return NextResponse.json({ detail: "Sign in to continue." }, { status: 401 });
  let data: Record<string, unknown>;
  try {
    data = await cavmanFetch<Record<string, unknown>>(session.user.id, "account/export");
  } catch (error) {
    const status = error instanceof CavmanApiError ? error.status : 503;
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Export failed." }, { status });
  }
  const accounts = await auth.api.listUserAccounts({ headers: requestHeaders });
  const { id, name, email, emailVerified, createdAt, updatedAt } = session.user;
  const body = {
    ...data,
    account: {
      id, name, email, emailVerified, createdAt, updatedAt,
      sign_in_methods: accounts.map((account) => ({
        provider: account.providerId, created_at: account.createdAt, scopes: account.scopes ?? [],
      })),
    },
  };
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="cavman-export-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
