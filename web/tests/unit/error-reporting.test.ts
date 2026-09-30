import { afterEach, describe, expect, it, vi } from "vitest";
import { reportingEnabled, scrubEvent } from "@/lib/error-reporting";

afterEach(() => vi.unstubAllEnvs());

describe("error reporting", () => {
  it("is off unless SENTRY_DSN is set", () => {
    vi.stubEnv("SENTRY_DSN", "");
    expect(reportingEnabled()).toBe(false);
    vi.stubEnv("SENTRY_DSN", "  ");
    expect(reportingEnabled()).toBe(false);
    vi.stubEnv("SENTRY_DSN", "https://key@o0.ingest.us.sentry.io/1");
    expect(reportingEnabled()).toBe(true);
  });

  it("strips bodies, cookies, queries, auth headers and the user from reports", () => {
    const event = scrubEvent({
      request: {
        url: "https://cavman.dev/api/caveman/runs?token=abc",
        data: '{"prompt":"secret plan"}',
        cookies: { "better-auth.session_token": "abc" },
        query_string: "token=abc",
        headers: { Cookie: "a=b", Authorization: "Bearer x", "User-Agent": "Firefox", "x-forwarded-for": "1.2.3.4" },
      },
      user: { email: "someone@example.com" },
      contexts: { nextjs: { request_path: "/api/caveman/runs?token=abc" } },
      message: "boom",
    });
    expect(event).toEqual({
      request: { url: "https://cavman.dev/api/caveman/runs", headers: { "User-Agent": "Firefox" } },
      contexts: { nextjs: { request_path: "/api/caveman/runs" } },
      message: "boom",
    });
  });

  it("leaves events without a request alone", () => {
    const event: { message: string; request?: undefined } = { message: "boom" };
    expect(scrubEvent(event)).toEqual({ message: "boom" });
  });
});
