import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AccountData } from "@/components/app/account-data";

const deleteUser = vi.fn();
const replace = vi.fn();
vi.mock("@/lib/auth-client", () => ({ deleteUser: (...args: unknown[]) => deleteUser(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

describe("AccountData", () => {
  it("offers the export and deletes only after the typed confirmation and password", async () => {
    deleteUser.mockResolvedValueOnce({ error: { status: 409, message: "A build is running." } }).mockResolvedValueOnce({ data: {} });
    render(<AccountData hasPassword />);
    expect(screen.getByRole("link", { name: /Download my data/ })).toHaveAttribute("href", "/api/account/export");
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    const confirm = screen.getByRole("button", { name: "Delete permanently" });
    await userEvent.type(screen.getByLabelText(/Type delete my account/), "delete my account");
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Password"), "secret-password");
    await userEvent.click(confirm);
    expect(await screen.findByRole("alert")).toHaveTextContent("A build is running.");
    expect(replace).not.toHaveBeenCalled();
    await userEvent.click(confirm);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(deleteUser).toHaveBeenLastCalledWith({ password: "secret-password" });
  });

  it("does not ask GitHub-only accounts for a password", async () => {
    render(<AccountData hasPassword={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(screen.queryByLabelText("Password")).toBeNull();
  });
});
