import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth, ensureAuthSchema } from "@/lib/auth";
import { apiBase, serviceHeaders } from "@/lib/cavman";

/**
 * Authenticated proxy to the private Cavman API.
 *
 * The session is verified here, server-side, and only the verified user id is
 * forwarded. The API enforces ownership of every project and run. Only an
 * explicit allowlist of resources is reachable, and state-changing requests
 * must be same-origin JSON.
 */
export const dynamic = "force-dynamic";

const ALLOWED = /^(system|builds|projects(\/[0-9a-f]{32})?|runs(\/[0-9a-f]{32}(\/(events|stream|continue|stop|abandon|budget|delivery(\/download)?|tasks\/[A-Za-z0-9_.:-]{1,128}|artifacts\/[0-9a-f]{32}|approvals\/[0-9a-f]{32}))?)?)$/;

async function forward(request: Request, params: Promise<{ path: string[] }>) {
  const { path } = await params;
  const joined = path.join("/");
  if (!ALLOWED.test(joined)) return NextResponse.json({ detail: "Not found." }, { status: 404 });

  const method = request.method.toUpperCase();
  if (method !== "GET") {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (!origin || new URL(origin).host !== host) {
      return NextResponse.json({ detail: "Cross-origin request refused." }, { status: 403 });
    }
    if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
      return NextResponse.json({ detail: "JSON body required." }, { status: 415 });
    }
  }

  await ensureAuthSchema();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ detail: "Sign in to continue." }, { status: 401 });

  const url = new URL(request.url);
  const target = `${apiBase()}/api/${joined}${url.search}`;
  const init: RequestInit & { duplex?: string } = {
    method,
    headers: {
      ...serviceHeaders(session.user.id),
      ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
      ...(request.headers.get("last-event-id") ? { "Last-Event-ID": request.headers.get("last-event-id")! } : {}),
    },
    body: method === "GET" ? undefined : await request.text(),
    cache: "no-store",
    signal: request.signal,
  };

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return NextResponse.json({ detail: "The Cavman API is unavailable. Try again shortly." }, { status: 503 });
  }

  const passthrough = new Headers();
  for (const name of ["content-type", "content-disposition", "cache-control"]) {
    const value = upstream.headers.get(name);
    if (value) passthrough.set(name, value);
  }
  if (joined.endsWith("/stream")) passthrough.set("X-Accel-Buffering", "no");
  return new Response(upstream.body, { status: upstream.status, headers: passthrough });
}

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context) {
  return forward(request, context.params);
}
export async function POST(request: Request, context: Context) {
  return forward(request, context.params);
}
export async function PATCH(request: Request, context: Context) {
  return forward(request, context.params);
}
