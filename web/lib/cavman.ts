import "server-only";
import { setting } from "./env";

/**
 * Server-side client for the private Cavman API. Only the web server holds
 * CAVMAN_API_TOKEN; the browser reaches the API exclusively through the
 * authenticated proxy in app/api/cavman, which forwards the session user's id.
 */
export class CavmanApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function apiBase(): string {
  return (setting("API_URL") ?? "http://127.0.0.1:8000").replace(/\/$/, "");
}

export function serviceHeaders(userId: string): Record<string, string> {
  const token = setting("API_TOKEN");
  if (!token) throw new CavmanApiError("The web server is missing CAVMAN_API_TOKEN.", 500);
  return { Authorization: `Bearer ${token}`, "X-Cavman-User": userId };
}

export async function cavmanFetch<T>(userId: string, path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/api/${path.replace(/^\//, "")}`, {
      ...init,
      cache: "no-store",
      headers: { ...serviceHeaders(userId), "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    throw new CavmanApiError("The Cavman API is unavailable.", 503);
  }
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = typeof body.detail === "string" ? body.detail : detail;
    } catch {
      /* non-JSON error */
    }
    throw new CavmanApiError(detail, response.status);
  }
  return (await response.json()) as T;
}
