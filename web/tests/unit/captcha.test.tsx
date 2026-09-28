import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "@/components/auth/auth-form";
import { ForgotPasswordForm } from "@/components/auth/password-forms";

const signUpEmail = vi.fn();
const requestPasswordReset = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  signUp: { email: (...args: unknown[]) => signUpEmail(...args) },
  signIn: { email: vi.fn(), social: vi.fn() },
  requestPasswordReset: (...args: unknown[]) => requestPasswordReset(...args),
  resetPassword: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));

let solve: (token: string) => void = () => {};
const reset = vi.fn();

beforeEach(() => {
  signUpEmail.mockReset().mockResolvedValue({ data: { token: "session" }, error: null });
  requestPasswordReset.mockReset().mockResolvedValue({ data: {}, error: null });
  reset.mockReset();
  // Stands in for Cloudflare's script: render() hands back the solve callback.
  window.turnstile = {
    render: (_element: HTMLElement, options: Record<string, unknown>) => {
      solve = options.callback as (token: string) => void;
      return "widget-1";
    },
    reset,
    remove: vi.fn(),
  };
});

afterEach(() => {
  delete window.turnstile;
});

async function fillSignUp() {
  await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
  await userEvent.type(screen.getByLabelText("Password"), "a-long-enough-password");
}

describe("sign-up CAPTCHA", () => {
  it("is absent without a site key", async () => {
    render(<AuthForm mode="sign-up" next={null} githubEnabled={false} />);
    expect(screen.queryByTestId("captcha")).not.toBeInTheDocument();
    await fillSignUp();
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(signUpEmail.mock.calls[0][0].fetchOptions).toBeUndefined();
  });

  it("holds sign-up until solved, sends the token, then asks for a fresh one", async () => {
    render(<AuthForm mode="sign-up" next={null} githubEnabled={false} captchaSiteKey="site-key" />);
    await fillSignUp();
    const button = screen.getByRole("button", { name: "Create account" });
    expect(button).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId("captcha")).toBeInTheDocument());
    act(() => solve("token-1"));
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(signUpEmail.mock.calls[0][0].fetchOptions).toEqual({ headers: { "x-captcha-response": "token-1" } });
    await waitFor(() => expect(reset).toHaveBeenCalledWith("widget-1"));
  });

  it("is not shown on sign-in", () => {
    render(<AuthForm mode="sign-in" next={null} githubEnabled={false} captchaSiteKey="site-key" />);
    expect(screen.queryByTestId("captcha")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("guards password-reset requests too", async () => {
    render(<ForgotPasswordForm captchaSiteKey="site-key" />);
    await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
    const button = screen.getByRole("button", { name: "Send reset link" });
    expect(button).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId("captcha")).toBeInTheDocument());
    act(() => solve("token-2"));
    await userEvent.click(await screen.findByRole("button", { name: "Send reset link" }));
    expect(requestPasswordReset.mock.calls[0][0].fetchOptions).toEqual({ headers: { "x-captcha-response": "token-2" } });
  });
});
