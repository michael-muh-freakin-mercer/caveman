import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth, ensureAuthSchema } from "@/lib/auth";

/**
 * Sign out one of the user's devices, or every device but this one.
 *
 * Sessions are addressed by id; their tokens stay on the server, so a script
 * running in this page could never learn another device's session token.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ detail: "Cross-origin request refused." }, { status: 403 });
  }
  await ensureAuthSchema();
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return NextResponse.json({ detail: "Sign in to continue." }, { status: 401 });
  let body: { id?: unknown; others?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "JSON body required." }, { status: 415 });
  }
  if (body.others === true) {
    await auth.api.revokeOtherSessions({ headers: requestHeaders });
    return NextResponse.json({ revoked: "others" });
  }
  if (typeof body.id !== "string") return NextResponse.json({ detail: "Choose a session." }, { status: 422 });
  const sessions = await auth.api.listSessions({ headers: requestHeaders });
  const target = sessions.find((item) => item.id === body.id);
  if (!target) return NextResponse.json({ detail: "That session no longer exists." }, { status: 404 });
  if (target.id === session.session.id) {
    return NextResponse.json({ detail: "Use Sign out to end this session." }, { status: 409 });
  }
  await auth.api.revokeSession({ body: { token: target.token }, headers: requestHeaders });
  return NextResponse.json({ revoked: target.id });
}
