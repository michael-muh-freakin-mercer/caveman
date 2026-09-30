import { safeNext } from "./prompt-storage";

/** Extracts the preserved prompt from a post-auth destination like /app/new?prompt=... */
export function promptFromNext(next: string | null | undefined): string | null {
  const destination = safeNext(next, "");
  if (!destination) return null;
  try {
    const url = new URL(destination, "http://cavman.local");
    return url.pathname === "/app/new" ? url.searchParams.get("prompt") : null;
  } catch {
    return null;
  }
}
