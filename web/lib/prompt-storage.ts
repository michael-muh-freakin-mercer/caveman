/**
 * Keeps a build request across sign-up / sign-in (including OAuth round trips),
 * so the words someone typed on the landing page are never lost.
 */
const KEY = "caveman.pending-prompt";
export const MAX_PROMPT_LENGTH = 8000;

export function savePendingPrompt(prompt: string): void {
  try {
    window.sessionStorage.setItem(KEY, prompt.slice(0, MAX_PROMPT_LENGTH));
  } catch {
    /* storage unavailable: the prompt still travels in the URL */
  }
}

export function takePendingPrompt(): string | null {
  try {
    const value = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    return value;
  } catch {
    return null;
  }
}

export function newBuildPath(prompt: string): string {
  return `/app/new?prompt=${encodeURIComponent(prompt.slice(0, MAX_PROMPT_LENGTH))}`;
}

/** Only same-site relative paths are accepted as post-auth destinations. */
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
