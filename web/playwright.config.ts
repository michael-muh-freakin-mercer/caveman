import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * End-to-end tests run the real stack: the Caveman API, a durable worker using
 * the scripted test executor (scripted models, real kernel, real sandbox), and
 * the production web build with real authentication.
 */
process.env.CAVEMAN_E2E_DIR ??= mkdtempSync(join(tmpdir(), "caveman-e2e-"));
const dir = process.env.CAVEMAN_E2E_DIR;
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const python = process.env.CAVEMAN_PYTHON_BIN ?? join(repo, ".venv/bin");
const apiPort = 8765;
const webPort = 3100;
const token = "e2e-service-token-0123456789abcdef0123456789";
// Set by deploy/e2e.sh: the stack is already running (docker compose), so
// Playwright only drives the browser against it.
const external = process.env.CAVEMAN_E2E_BASE_URL;

const shared = {
  CAVEMAN_API_TOKEN: token,
  NEXT_TELEMETRY_DISABLED: "1",
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: external ?? `http://localhost:${webPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: external ? [] : [
    {
      // The worker runs beside the API; both stop when the tests finish.
      command: `sh -c '${python}/caveman worker & exec ${python}/caveman api --port ${apiPort}'`,
      cwd: repo,
      url: `http://127.0.0.1:${apiPort}/api/health`,
      env: {
        ...shared,
        CAVEMAN_EXECUTOR: "scripted",
        CAVEMAN_DATA_DIR: join(dir, "data"),
        CAVEMAN_SCRIPTED_STEP_DELAY: "0.15",
        CAVEMAN_HEARTBEAT_SECONDS: "0.5",
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: process.env.PW_SKIP_BUILD ? `npx next start --port ${webPort}` : `npx next build && npx next start --port ${webPort}`,
      cwd: here,
      url: `http://localhost:${webPort}/`,
      env: {
        ...shared,
        CAVEMAN_API_URL: `http://127.0.0.1:${apiPort}`,
        BETTER_AUTH_SECRET: "e2e-auth-secret-0123456789abcdef0123456789",
        BETTER_AUTH_URL: `http://localhost:${webPort}`,
        // A postgres:// URL runs the journeys against Better Auth on Postgres.
        AUTH_DATABASE_URL: process.env.AUTH_DATABASE_URL ?? join(dir, "auth.db"),
        CAVEMAN_DEV_OUTBOX: join(dir, "outbox.jsonl"),
        CAVEMAN_E2E: "1",
      },
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
