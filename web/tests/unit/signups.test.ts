import { describe, expect, it } from "vitest";
import { parseSignupAllowlist, signupAllowed } from "@/lib/signups";

describe("sign-up allowlist", () => {
  it("lets anyone sign up when unset or blank", () => {
    expect(parseSignupAllowlist(undefined)).toBeNull();
    expect(parseSignupAllowlist(" , ")).toBeNull();
    expect(signupAllowed("anyone@example.com", null)).toBe(true);
  });

  it("matches listed addresses and domains, ignoring case and spaces", () => {
    const list = parseSignupAllowlist(" Friend@Example.com , @team.dev");
    expect(signupAllowed("friend@example.com", list)).toBe(true);
    expect(signupAllowed(" FRIEND@example.COM ", list)).toBe(true);
    expect(signupAllowed("someone@team.dev", list)).toBe(true);
  });

  it("refuses everything else", () => {
    const list = parseSignupAllowlist("friend@example.com,@team.dev");
    expect(signupAllowed("stranger@example.com", list)).toBe(false);
    expect(signupAllowed("someone@sub.team.dev", list)).toBe(false);
    expect(signupAllowed("someone@team.dev.evil.com", list)).toBe(false);
    expect(signupAllowed("team.dev", list)).toBe(false);
  });
});
