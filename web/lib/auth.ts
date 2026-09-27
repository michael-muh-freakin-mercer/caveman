import "server-only";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { nextCookies } from "better-auth/next-js";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Pool } from "pg";

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
  },
  socialProviders: github,
  session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: process.env.NODE_ENV === "production" && process.env.CAVEMAN_E2E !== "1" },
  telemetry: { enabled: false },
  plugins: [nextCookies()],
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
