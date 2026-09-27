import { toNextJsHandler } from "better-auth/next-js";
import { auth, ensureAuthSchema } from "@/lib/auth";

const handler = toNextJsHandler(auth);

export async function GET(request: Request) {
  await ensureAuthSchema();
  return handler.GET(request);
}

export async function POST(request: Request) {
  await ensureAuthSchema();
  return handler.POST(request);
}
