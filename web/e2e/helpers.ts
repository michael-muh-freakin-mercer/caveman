import { expect, type Page } from "@playwright/test";

let counter = 0;

export async function signUp(page: Page, next?: string) {
  const email = `e2e-${Date.now()}-${counter++}@example.com`;
  await page.goto(next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up");
  await page.getByLabel("Name").fill("Test Caveman");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-long-enough-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(next ? (url) => url.pathname === new URL(next, "http://x").pathname : /\/app$/);
  return email;
}

export async function startBuild(page: Page, prompt: string): Promise<string> {
  await page.goto("/app/new");
  await page.getByLabel("What do you want to build?").fill(prompt);
  await page.getByRole("button", { name: "Build it" }).click();
  await page.waitForURL(/\/app\/runs\/[0-9a-f]{32}$/);
  return page.url().split("/").pop()!;
}

export async function runJson(page: Page, runId: string) {
  const response = await page.request.get(`/api/caveman/runs/${runId}`);
  expect(response.status()).toBe(200);
  return response.json();
}
