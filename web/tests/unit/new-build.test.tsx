import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewBuildForm } from "@/components/app/new-build-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
afterEach(() => vi.unstubAllGlobals());

const props = { initialPrompt: "Add a greeting endpoint", defaultBudget: 5, maxBudget: 100, disabledReason: null };

describe("NewBuildForm repository import", () => {
  it("sends a public GitHub repository for a new project", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ run_id: "r1" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<NewBuildForm {...props} projectId={null} projectName={null} />);
    await userEvent.type(screen.getByLabelText("Start from a public GitHub repository"), "https://github.com/octo/demo");
    await userEvent.click(screen.getByRole("button", { name: /Build it/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/runs/r1"));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).settings.repository_url).toBe("https://github.com/octo/demo");
  });

  it("refuses other addresses before calling the server", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<NewBuildForm {...props} projectId={null} projectName={null} />);
    await userEvent.type(screen.getByLabelText("Start from a public GitHub repository"), "https://evil.test/octo/demo");
    await userEvent.click(screen.getByRole("button", { name: /Build it/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("public GitHub repository");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers no import for a run in an existing project", () => {
    render(<NewBuildForm {...props} projectId={"a".repeat(32)} projectName="Demo" />);
    expect(screen.queryByLabelText("Start from a public GitHub repository")).toBeNull();
  });
});
