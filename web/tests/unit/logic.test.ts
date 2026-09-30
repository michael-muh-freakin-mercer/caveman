import { afterEach, describe, expect, it } from "vitest";
import { duration, formatUsd, relativeTime } from "@/lib/format";
import { promptFromNext } from "@/lib/next-param";
import { newBuildPath, safeNext, savePendingPrompt, takePendingPrompt } from "@/lib/prompt-storage";
import { canContinue, checkDisplayStatus, isExecuting } from "@/lib/run-state";
import { unverifiedStacks } from "@/lib/stack-support";
import { describeDevice } from "@/lib/devices";
import { setting } from "@/lib/env";
import { mergeTimeline, streamFinished } from "@/lib/use-run";
import { runDetail } from "./fixtures";

describe("check status is never assumed", () => {
  it("shows missing results as not run, or running only while validating", () => {
    expect(checkDisplayStatus("not_run", "Accepted", false)).toBe("not_run");
    expect(checkDisplayStatus("not_run", "Validating", false)).toBe("not_run");
    expect(checkDisplayStatus("not_run", "Validating", true)).toBe("running");
    expect(checkDisplayStatus("failed", "Validating", true)).toBe("failed");
    expect(checkDisplayStatus("passed", "Running", true)).toBe("passed");
  });
});

describe("run controls follow backend state", () => {
  it("never offers continue while executing or waiting on approval", () => {
    expect(isExecuting("running")).toBe(true);
    expect(canContinue("running", "active")).toBe(false);
    expect(canContinue("approval_needed", "active")).toBe(false);
    expect(canContinue("paused", "active")).toBe(true);
    expect(canContinue("budget_reached", "active")).toBe(true);
    expect(canContinue("complete", "completed")).toBe(false);
  });
});

describe("prompt preservation", () => {
  it("round-trips a prompt through storage once", () => {
    savePendingPrompt("Build a CLI");
    expect(takePendingPrompt()).toBe("Build a CLI");
    expect(takePendingPrompt()).toBeNull();
  });

  it("carries the prompt through the post-auth destination", () => {
    const next = newBuildPath("Build me a booking app & more #approval");
    expect(promptFromNext(next)).toBe("Build me a booking app & more #approval");
    expect(promptFromNext("/app/runs")).toBeNull();
  });

  it("only allows same-site destinations", () => {
    expect(safeNext("https://evil.example/app")).toBe("/app");
    expect(safeNext("//evil.example")).toBe("/app");
    expect(safeNext("/\\evil.example")).toBe("/app");
    expect(safeNext("/app/new?prompt=x")).toBe("/app/new?prompt=x");
    expect(promptFromNext("https://evil.example/app/new?prompt=x")).toBeNull();
  });
});

describe("live timeline", () => {
  it("merges events by sequence without duplicates", () => {
    const a = { sequence: 1, kind: "run.created", title: "Build requested", detail: null, level: "info" as const, task_id: null, debug: false, created_at: "" };
    const b = { ...a, sequence: 2, title: "Planned" };
    expect(mergeTimeline([a], [b, a]).map((e) => e.sequence)).toEqual([1, 2]);
  });

  it("keeps streaming until a completed run has its delivery", () => {
    expect(streamFinished(runDetail({ delivery: null }))).toBe(false);
    expect(streamFinished(runDetail({ delivery: { status: "ready", created_at: "", error: null, files: [], documents: [], deleted: [], total_files: 1, commit: null, report: null, downloadable: true } }))).toBe(true);
    expect(streamFinished(runDetail({ status: "active", state: "running" }))).toBe(false);
    expect(streamFinished(runDetail({ status: "abandoned", state: "cancelled" }))).toBe(true);
  });
});

describe("formatting", () => {
  it("marks incomplete cost rather than estimating it", () => {
    expect(formatUsd(1.5)).toBe("$1.50");
    expect(formatUsd(0.0042)).toBe("$0.0042");
    expect(formatUsd(0, { complete: false })).toBe("$0.00+");
  });

  it("formats time", () => {
    const now = new Date("2026-09-27T10:10:00Z");
    expect(relativeTime("2026-09-27T10:09:55Z", now)).toBe("just now");
    expect(relativeTime("2026-09-27T10:05:00Z", now)).toBe("5m ago");
    expect(duration("2026-09-27T10:00:00Z", "2026-09-27T10:02:05Z")).toBe("2m 5s");
  });
});

describe("unverifiedStacks", () => {
  it("names stacks Cavman cannot test and stays quiet for tested ones", () => {
    expect(unverifiedStacks("Build a habit tracker iOS app in SwiftUI")).toEqual(["iOS / Swift"]);
    expect(unverifiedStacks("A REST API", "Go backend with Postgres")).toEqual(["Go"]);
    expect(unverifiedStacks("Build a booking app for a tattoo studio", "Python, FastAPI")).toEqual([]);
    expect(unverifiedStacks("A TypeScript rate limiter; let's go build it")).toEqual([]);
    expect(unverifiedStacks("A JavaScript widget")).toEqual([]);
  });
});

describe("describeDevice", () => {
  it("names the browser and system", () => {
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15")).toBe("Safari on macOS");
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0")).toBe("Edge on Windows");
    expect(describeDevice(null)).toBe("Unknown device");
  });
});

describe("setting", () => {
  afterEach(() => {
    delete process.env.CAVMAN_TEST_VALUE;
    delete process.env.CAVEMAN_TEST_VALUE;
  });

  it("reads the new name, falls back to the pre-rename one, and prefers the new one", () => {
    expect(setting("TEST_VALUE")).toBeUndefined();
    process.env.CAVEMAN_TEST_VALUE = "old";
    expect(setting("TEST_VALUE")).toBe("old");
    process.env.CAVMAN_TEST_VALUE = "new";
    expect(setting("TEST_VALUE")).toBe("new");
  });
});
