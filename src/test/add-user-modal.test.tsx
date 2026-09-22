import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddUserModal } from "@/components/users/AddUserModal";
import { adminUserService } from "@/services/admin-user.service";
import type { User } from "@/types/agenda";

vi.mock("@/lib/supabase", () => {
  const chain = { data: [], error: null };
  const from = () => ({ select: () => ({ order: () => chain }) });
  return { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) }, from } };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const allUsers: User[] = [
  { id: "parent-user-id", fullName: "Parent User", jobTitle: "Manager", email: "parent@example.com" },
] as unknown as User[];

const fillForm = async () => {
  fireEvent.change(screen.getByPlaceholderText("name@company.com"), { target: { value: "New.User@Example.com" } });
  fireEvent.change(screen.getByPlaceholderText("Masukkan nama sesuai KTP"), { target: { value: "New User" } });
  fireEvent.change(screen.getByPlaceholderText("MBN-001"), { target: { value: "NIK-001" } });
};

describe("AddUserModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends NIK and parent_id to the backend service", async () => {
    const createSpy = vi.spyOn(adminUserService, "createUser").mockResolvedValue({
      user: {
        id: "new-user-id",
        email: "new.user@example.com",
        full_name: "New User",
        role: "user",
        is_active: true,
        department_id: null,
        office_id: null,
        parent_id: null,
      },
    });
    const onSuccess = vi.fn();

    render(
      <AddUserModal
        isOpen
        onClose={vi.fn()}
        onSuccess={onSuccess}
        allUsers={allUsers}
      />,
    );

    await fillForm();
    const parentSelect = screen.getByText("Top Level / Board of Directors");
    expect(parentSelect).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /simpan user/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    const payload = createSpy.mock.calls[0][0];
    expect(payload.email).toBe("New.User@Example.com");
    expect(payload.nik).toBe("NIK-001");
    expect(payload.parent_id).toBe(null);
    expect(payload).not.toHaveProperty("password");
  });

  it("does not send a password field", async () => {
    const createSpy = vi.spyOn(adminUserService, "createUser").mockResolvedValue({
      user: {
        id: "new-user-id",
        email: "new.user@example.com",
        full_name: "New User",
        role: "user",
        is_active: true,
        department_id: null,
        office_id: null,
        parent_id: null,
      },
    });

    render(
      <AddUserModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} allUsers={allUsers} />,
    );

    await fillForm();
    fireEvent.click(screen.getByRole("button", { name: /simpan user/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    const serialized = JSON.stringify(createSpy.mock.calls[0][0]);
    expect(serialized).not.toContain("password");
  });

  it("blocks double-submit while a request is in flight", async () => {
    let resolveCreate: ((value: unknown) => void) | undefined;
    const createSpy = vi
      .spyOn(adminUserService, "createUser")
      .mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve; }) as never);

    render(
      <AddUserModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} allUsers={allUsers} />,
    );

    await fillForm();
    const submit = screen.getByRole("button", { name: /simpan user/i });
    fireEvent.click(submit);
    // Tunggu sampai disabled class / teks berubah untuk menghindari race condition test (React 18 batching)
    await waitFor(() => expect(submit).toBeDisabled());
    fireEvent.click(submit);

    expect(createSpy).toHaveBeenCalledTimes(1);
    await actResolve(resolveCreate);
  });

  it("surfaces a 409 conflict error to the user", async () => {
    const error = new Error("Email sudah terdaftar.") as Error & { status: number };
    error.status = 409;
    vi.spyOn(adminUserService, "createUser").mockRejectedValue(error);
    const { toast } = await import("sonner");

    render(
      <AddUserModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} allUsers={allUsers} />,
    );

    await fillForm();
    fireEvent.click(screen.getByRole("button", { name: /simpan user/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Konflik data: Email sudah terdaftar.")),
    );
  });
});

const actResolve = async (resolve?: (value: unknown) => void) => {
  if (resolve) resolve({ user: { id: "new-user-id", email: "", full_name: "", role: "user", is_active: true, department_id: null, office_id: null, parent_id: null } });
  await Promise.resolve();
};
