import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate for /app: without a session cookie, send the visitor to sign
 * in while keeping the full destination (including a preserved build prompt).
 * The app layout still verifies the session server-side on every request.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const next = request.nextUrl.pathname + request.nextUrl.search;
    const url = new URL(`/sign-in?next=${encodeURIComponent(next)}`, request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app", "/app/:path*"] };
