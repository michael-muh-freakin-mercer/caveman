import "server-only";

/**
 * Server-side client for the private Caveman API. Only the web server holds
 * CAVEMAN_API_TOKEN; the browser reaches the API exclusively through the
 * authenticated proxy in app/api/caveman, which forwards the session user's id.
 */
export class CavemanApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function apiBase(): string {
  return (process.env.CAVEMAN_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
}

export function serviceHeaders(userId: string): Record<string, string> {
  const token = process.env.CAVEMAN_API_TOKEN;
  if (!token) throw new CavemanApiError("The web server is missing CAVEMAN_API_TOKEN.", 500);
  return { Authorization: `Bearer ${token}`, "X-Caveman-User": userId };
}

export async function cavemanFetch<T>(userId: string, path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/api/${path.replace(/^\//, "")}`, {
      ...init,
      cache: "no-store",
      headers: { ...serviceHeaders(userId), "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    throw new CavemanApiError("The Caveman API is unavailable.", 503);
  }
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = typeof body.detail === "string" ? body.detail : detail;
    } catch {
      /* non-JSON error */
    }
    throw new CavemanApiError(detail, response.status);
  }
  return (await response.json()) as T;
}
