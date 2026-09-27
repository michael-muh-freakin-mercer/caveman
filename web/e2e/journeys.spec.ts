import { expect, test } from "@playwright/test";
import { runJson, signUp, startBuild } from "./helpers";

test("journey 1: a landing-page prompt survives sign-up", async ({ page }) => {
  const prompt = "Build me a booking app for a tattoo studio";
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Type what you want.");
  await page.getByLabel("Describe the software you want").fill(prompt);
  await page.getByRole("button", { name: "Build it" }).click();
  await page.waitForURL(/\/sign-up\?next=/);
  await expect(page.getByTestId("pending-prompt")).toContainText(prompt);
  await page.getByLabel("Name").fill("Journey One");
  await page.getByLabel("Email").fill(`journey1-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("a-long-enough-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/app\/new\?prompt=/);
  await expect(page.getByLabel("What do you want to build?")).toHaveValue(prompt);
});

test("the dashboard requires authentication and keeps the destination", async ({ page }) => {
  await page.goto("/app/new?prompt=Build%20a%20CLI");
  await page.waitForURL(/\/sign-in\?next=/);
  await expect(page.getByTestId("pending-prompt")).toContainText("Build a CLI");
});

test("journeys 2, 3 and 6: a real run is created, streams progress, and delivers", async ({ page }) => {
  await signUp(page);
  const runId = await startBuild(page, "Build me a booking app for a tattoo studio");

  // Journey 2: the run exists in the backend and the dashboard shows it.
  const created = await runJson(page, runId);
  expect(created.id).toBe(runId);
  expect(created.executor).toBe("scripted");
  await expect(page.getByRole("heading", { name: "Booking app for a tattoo studio" })).toBeVisible();

  // Journey 3: backend changes arrive without a reload.
  await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
  await expect(page.getByText("Product specialist").first()).toBeVisible();
  await expect(page.getByText("Validation passed: Candidate tests")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Build complete" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);

  // Journey 6: real deliverables.
  const download = page.getByRole("link", { name: "Download project" });
  await expect(download).toBeVisible();
  await expect(page.locator("#build-report")).toContainText("booking.py");
  const archive = await page.request.get(`/api/caveman/runs/${runId}/delivery/download`);
  expect(archive.status()).toBe(200);
  expect(archive.headers()["content-type"]).toContain("gzip");
  const final = await runJson(page, runId);
  expect(final.status).toBe("completed");
  expect(final.tasks.every((t: { state: string }) => t.state === "Accepted")).toBe(true);
  await expect(page.getByText("2 of 2 passed").or(page.getByText("3 of 3 passed"))).toBeVisible();
});

test("journey 4: an approval is shown and the exact-scoped decision reaches the backend", async ({ page }) => {
  await signUp(page);
  const runId = await startBuild(page, "Booking core #approval");
  const card = page.locator("#approvals");
  await expect(card.getByRole("heading", { name: "Grant a capability" })).toBeVisible();
  await expect(card.getByText("Executes candidate code inside the isolated sandbox")).toBeVisible();
  await expect(card.getByText(/Sandboxed development/).first()).toBeVisible();
  const pending = await runJson(page, runId);
  expect(pending.state).toBe("approval_needed");
  expect(pending.approvals[0].status).toBe("pending");

  await card.getByLabel(/Note/).fill("Reviewed the scope");
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("heading", { name: "Build complete" })).toBeVisible();
  const decided = await runJson(page, runId);
  expect(decided.approvals[0].status).toBe("approved");
  expect(decided.approvals[0].decision.reason).toBe("Reviewed the scope");
  expect(decided.approvals[0].decision.decided_by).toMatch(/^caveman-user:/);
});

test("journey 4b: rejecting is recorded and leaves the work honestly blocked; scope cannot be forged", async ({ page }) => {
  await signUp(page);
  const runId = await startBuild(page, "Booking core #approval");
  await expect(page.locator("#approvals").getByRole("button", { name: "Reject" })).toBeVisible();
  const pending = await runJson(page, runId);
  const approvalId = pending.approvals[0].id;
  const forged = await page.request.post(`/api/caveman/runs/${runId}/approvals/${approvalId}`, {
    data: { decision: "approve", scope_digest: "0".repeat(64) },
    headers: { Origin: "http://localhost:3100" },
  });
  expect(forged.status()).toBe(409);
  await page.locator("#approvals").getByRole("button", { name: "Reject" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Blocked" })).toBeVisible();
  await expect(page.locator("#tasks").getByText("Blocked", { exact: true })).toBeVisible();
  const decided = await runJson(page, runId);
  expect(decided.approvals[0].status).toBe("rejected");
  expect(decided.status).toBe("active");
  expect(decided.capability_requests[0].status).toBe("denied");
});

test("journey 5: a failed validation is shown honestly with its recovery", async ({ page }) => {
  await signUp(page);
  const runId = await startBuild(page, "Booking core #fail-validation");
  await expect(page.getByText("Validation failed: Candidate tests")).toBeVisible();
  const failures = page.locator("#failures");
  await expect(failures.getByText("The specialist's output did not meet the task's acceptance criteria.")).toBeVisible();
  await expect(failures.getByText("Revision requested.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Build complete" })).toBeVisible();
  await expect(page.locator("#artifacts").getByText("Rejected")).toBeVisible();
  const run = await runJson(page, runId);
  expect(run.failure_details[0].classification).toBe("BAD_OUTPUT");
  expect(run.artifacts[0].validation_state).toBe("failed");
});

test("runs are private to their owner", async ({ browser }) => {
  const owner = await browser.newPage();
  await signUp(owner);
  const runId = await startBuild(owner, "Private project");
  const stranger = await browser.newPage();
  await signUp(stranger);
  expect((await stranger.request.get(`/api/caveman/runs/${runId}`)).status()).toBe(404);
  await stranger.goto(`/app/runs/${runId}`);
  await expect(stranger.getByText("This does not exist, or it belongs to someone else.")).toBeVisible();
});

test("the API is unreachable from the browser without a session", async ({ request }) => {
  const response = await request.get("/api/caveman/runs");
  expect(response.status()).toBe(401);
  const crossSite = await request.post("/api/caveman/builds", {
    data: { prompt: "x" },
    headers: { Origin: "https://evil.example" },
  });
  expect(crossSite.status()).toBe(403);
});

test("dependent code tasks build on merged work and deliver one integrated project", async ({ page }) => {
  await signUp(page);
  const runId = await startBuild(page, "Booking API #dependent");
  await expect(page.getByRole("heading", { name: "Build complete" })).toBeVisible();
  await expect(page.locator("#activity").getByText(/^Merged into the project/)).toHaveCount(2);
  await expect(page.locator("#artifacts").getByText(/^merged [0-9a-f]{7}$/)).toHaveCount(2);
  await expect(page.locator("#build-report")).toContainText("api.py");
  await expect(page.locator("#build-report")).toContainText("booking.py");
  const run = await runJson(page, runId);
  const api = run.artifacts.find((a: { task_id: string }) => a.task_id === "api");
  expect(run.delivery.commit).toBe(api.integrated_commit);
});
