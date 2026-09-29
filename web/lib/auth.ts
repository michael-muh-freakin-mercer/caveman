import "server-only";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { nextCookies } from "better-auth/next-js";
import { captcha } from "better-auth/plugins";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Pool } from "pg";
import { CAPTCHA_ENDPOINTS, captchaSecretKey } from "./captcha";
import { CavemanApiError, cavemanFetch } from "./caveman";
import { linkEmail, sendEmail } from "./email";
import { SIGNUP_CLOSED_MESSAGE, parseSignupAllowlist, signupAllowed } from "./signups";

/**
 * Authentication uses Better Auth, an established library: password hashing,
 * sessions, CSRF-safe cookies, OAuth and rate limiting are its responsibility.
 * Caveman adds no cryptography of its own.
 *
 * AUTH_DATABASE_URL selects storage: a postgres:// URL for managed Postgres,
 * otherwise a local SQLite file (default .local/caveman-auth.db).
 */
function database() {
  const url = process.env.AUTH_DATABASE_URL ?? "";
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    return new Pool({ connectionString: url, max: 5 });
  }
  const file = resolve(/*turbopackIgnore: true*/ url.replace(/^file:/, "") || ".local/caveman-auth.db");
  mkdirSync(dirname(file), { recursive: true });
  return new DatabaseSync(file);
}

const github =
  process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    ? {
        github: {
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          // Identity only. Repository access would be requested separately and explicitly.
          scope: ["read:user", "user:email"],
        },
      }
    : undefined;

export const githubEnabled = Boolean(github);

const signupAllowlist = parseSignupAllowlist(process.env.CAVEMAN_SIGNUP_ALLOWLIST);
// An allowlist is only as good as proof that the address belongs to the person
// signing up, so turning it on also requires email verification.
const requireEmailVerification = process.env.CAVEMAN_REQUIRE_EMAIL_VERIFICATION === "1" || signupAllowlist !== null;

const options = {
  appName: "Caveman",
  database: database(),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: true,
    // Off by default so a fresh install works without an email provider;
    // hosted deployments should set CAVEMAN_REQUIRE_EMAIL_VERIFICATION=1 (implied by CAVEMAN_SIGNUP_ALLOWLIST).
    requireEmailVerification,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
      await sendEmail(linkEmail(user.email, "Reset your Caveman password",
        "Someone asked to reset the password for your Caveman account.", "Choose a new password", url));
    },
  },
  emailVerification: {
    sendOnSignUp: requireEmailVerification,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
      await sendEmail(linkEmail(user.email, "Verify your email for Caveman",
        "Confirm this email address to start building with Caveman.", "Verify email", url));
    },
  },
  socialProviders: github,
  user: {
    // Deleting an account requires the password (or, for GitHub-only accounts, a
    // session from the last day). Caveman's data goes first: if a build is
    // still running the API refuses, and the account is kept.
    deleteUser: {
      enabled: true,
      beforeDelete: async (user: { id: string }) => {
        try {
          await cavemanFetch(user.id, "account", { method: "DELETE" });
        } catch (error) {
          const status = error instanceof CavemanApiError ? error.status : 503;
          const message = error instanceof Error ? error.message : "Caveman could not delete your data.";
          throw new APIError(status === 409 ? "CONFLICT" : "SERVICE_UNAVAILABLE", { message });
        }
      },
    },
  },
  hooks: {
    // Say "invite-only" up front: with verification on, Better Auth answers a refused
    // password sign-up with a generic success (to hide which emails exist).
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const email = typeof ctx.body?.email === "string" ? ctx.body.email : "";
      if (!signupAllowed(email, signupAllowlist)) throw new APIError("FORBIDDEN", { message: SIGNUP_CLOSED_MESSAGE });
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // Runs for every new account, password or GitHub, so neither path skips the invite list.
        before: async (user: { email: string }) => {
          if (!signupAllowed(user.email, signupAllowlist)) throw new APIError("FORBIDDEN", { message: SIGNUP_CLOSED_MESSAGE });
          return { data: user };
        },
      },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
  // OAuth tokens (used only to publish to GitHub on explicit request) are encrypted at rest.
  account: { encryptOAuthTokens: true },
  rateLimit: { enabled: process.env.NODE_ENV === "production" && process.env.CAVEMAN_E2E !== "1" },
  telemetry: { enabled: false },
  plugins: [
    ...(captchaSecretKey
      ? [captcha({
          provider: "cloudflare-turnstile",
          secretKey: captchaSecretKey,
          endpoints: CAPTCHA_ENDPOINTS,
          // A token solved on another site with the same key is refused.
          allowedHostnames: process.env.BETTER_AUTH_URL ? [new URL(process.env.BETTER_AUTH_URL).hostname] : undefined,
        })]
      : []),
    nextCookies(),
  ],
};

export const auth = betterAuth(options);

let migrated: Promise<void> | null = null;

/** Create or upgrade the auth tables once per process (disable with CAVEMAN_AUTH_AUTO_MIGRATE=0). */
export function ensureAuthSchema(): Promise<void> {
  if (process.env.CAVEMAN_AUTH_AUTO_MIGRATE === "0") return Promise.resolve();
  migrated ??= getMigrations(options)
    .then(({ runMigrations }) => runMigrations())
    .catch((error) => {
      migrated = null;
      throw error;
    });
  return migrated;
}
