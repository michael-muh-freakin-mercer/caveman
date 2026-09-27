import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalCard } from "@/components/run/approval-card";
import { ChecksPanel } from "@/components/run/checks-panel";
import { CompletionPanel } from "@/components/run/completion-panel";
import { TaskCard } from "@/components/run/task-card";
import { UsagePanel } from "@/components/run/usage-panel";
import { approval, artifact, runDetail, task } from "./fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }), usePathname: () => "/" }));

beforeEach(() => push.mockReset());

describe("ApprovalCard", () => {
  it("shows what, why, risk and exact scope, and reports the decision", async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    render(<ApprovalCard approval={approval()} onDecide={onDecide} />);
    expect(screen.getByText("Approve: publish to main")).toBeInTheDocument();
    expect(screen.getByText("Publish the accepted booking core.")).toBeInTheDocument();
    expect(screen.getByText("Action affects canonical project state")).toBeInTheDocument();
    expect(screen.getByText(/digest aaaaaaaaaaaaaaaa/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Note/), "Looks right");
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onDecide).toHaveBeenCalledWith("approve", "Looks right");
  });

  it("surfaces a refused decision instead of pretending it applied", async () => {
    const onDecide = vi.fn().mockRejectedValue(new Error("The approval request changed since it was displayed."));
    render(<ApprovalCard approval={approval()} onDecide={onDecide} />);
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("changed since it was displayed");
  });

  it("offers no actions for decided requests", () => {
    render(<ApprovalCard approval={approval({ status: "approved", decision: { approved: true, reason: "ok", decided_by: "caveman-user:a" } })} onDecide={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.getByText(/Approved/, { selector: "p" })).toBeInTheDocument();
  });
});

describe("ChecksPanel", () => {
  it("distinguishes passed, failed, running and not run from trusted records", () => {
    const failed = artifact({
      validations: [
        { id: "v1", check: "compile", label: "Python compile", status: "passed", trusted: true, executor: "executor", command: "python3 -c ...", returncode: 0, output: "", content_digest: "d", created_at: "" },
      ],
    });
    const { rerender } = render(<ChecksPanel tasks={[task()]} artifacts={[failed]} executing={true} />);
    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    rerender(<ChecksPanel tasks={[task()]} artifacts={[failed]} executing={false} />);
    expect(screen.getAllByText("Not run")).toHaveLength(2);
    rerender(
      <ChecksPanel
        tasks={[task({ state: "Failed", required_checks: [{ check: "pytest", label: "Candidate tests", status: "failed" }] })]}
        artifacts={[artifact({ validations: [{ id: "v2", check: "pytest", label: "Candidate tests", status: "failed", trusted: true, executor: "executor", command: "pytest", returncode: 1, output: "1 failed", content_digest: "d", created_at: "" }] })]}
        executing={false}
      />,
    );
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("1 failed")).toBeInTheDocument();
  });
});

describe("TaskCard", () => {
  it("renders the specialist, state, attempt and dependency names", () => {
    render(<TaskCard task={task({ dependencies: ["spec"], state: "Revision Needed", attempt: 2 })} titles={{ spec: "Write the spec" }} executing={false} />);
    expect(screen.getByText("Backend specialist")).toBeInTheDocument();
    expect(screen.getByText("Revision Needed")).toBeInTheDocument();
    expect(screen.getByText("Attempt 2/3")).toBeInTheDocument();
    expect(screen.getByText("Needs Write the spec")).toBeInTheDocument();
  });
});

describe("CompletionPanel", () => {
  it("offers download only when a verified archive exists", () => {
    const { rerender } = render(<CompletionPanel run={runDetail()} />);
    expect(screen.getByRole("heading", { name: "Build complete" })).toBeInTheDocument();
    expect(screen.queryByText("Download project")).not.toBeInTheDocument();
    expect(screen.getByText(/Assembling your download/)).toBeInTheDocument();
    rerender(
      <CompletionPanel
        run={runDetail({ delivery: { status: "ready", created_at: "", error: null, files: ["booking.py"], documents: [], deleted: [], total_files: 4, report: "CAVEMAN_BUILD_REPORT.md", downloadable: true } })}
      />,
    );
    expect(screen.getByText("Download project").closest("a")).toHaveAttribute("href", `/api/caveman/runs/${"r".repeat(32)}/delivery/download`);
    expect(screen.getByText("1 of 1 passed")).toBeInTheDocument();
  });
});

describe("UsagePanel", () => {
  it("says when cost is incomplete instead of estimating", () => {
    const usage = { ...runDetail().usage, cost_complete: false, calls_without_cost: 3, calls: 5 };
    render(<UsagePanel usage={usage} onBudget={vi.fn()} canEdit={false} />);
    expect(screen.getByText("$0.12+")).toBeInTheDocument();
    expect(screen.getByText(/3 of 5 calls reported no cost/)).toBeInTheDocument();
  });

  it("warns near the budget ceiling", () => {
    const base = runDetail().usage;
    render(<UsagePanel usage={{ ...base, budget: { ...base.budget!, spent_usd: 4.5, warning: true } }} onBudget={vi.fn()} canEdit />);
    expect(screen.getByRole("status")).toHaveTextContent("close to its limit");
  });
});

describe("BuildPrompt", () => {
  it("preserves the prompt and sends signed-out visitors to sign up", async () => {
    const { BuildPrompt } = await import("@/components/marketing/build-prompt");
    render(<BuildPrompt signedIn={false} />);
    await userEvent.type(screen.getByLabelText("Describe the software you want"), "Build a CLI for photos");
    await userEvent.click(screen.getByRole("button", { name: /Build it/ }));
    expect(push).toHaveBeenCalledWith(`/sign-up?next=${encodeURIComponent("/app/new?prompt=Build%20a%20CLI%20for%20photos")}`);
    expect(window.sessionStorage.getItem("caveman.pending-prompt")).toBe("Build a CLI for photos");
  });

  it("creates a real run when signed in", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ run_id: "abc" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const { BuildPrompt } = await import("@/components/marketing/build-prompt");
    render(<BuildPrompt signedIn />);
    await userEvent.click(screen.getByRole("button", { name: "API" }));
    await userEvent.click(screen.getByRole("button", { name: /Build it/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/runs/abc"));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).prompt).toMatch(/REST API/);
    vi.unstubAllGlobals();
  });
});
