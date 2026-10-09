import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FormUsageManagementPage from "@/pages/admin/FormUsageManagementPage";

const mocks = vi.hoisted(() => ({ toast: vi.fn(), rpc: vi.fn(), savedTeam: [] as string[] }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/app/AppDialogProvider", () => ({ useAppDialog: () => ({ confirm: vi.fn() }) }));
vi.mock("@/lib/supabase", () => ({ supabase: {
  rpc: mocks.rpc,
  from: (table: string) => {
    const steps = [{ step_order: 1, role_name: "membuat", label: "Pemohon", action_type: "approval", assignee_mode: "requester" },
      { step_order: 2, role_name: "memeriksa", label: "Mgr. HRD & GA", action_type: "approval", assignee_mode: "select" }]
      .map(step => ({ ...step, candidate_scope: "manual", signer_department_id: "hrd", verifier_department_id: "hrd",
        verifier_scope: "head_office", input_schema: { fields: [] },
        form_usage_step_users: [{ user_id: "manager" }],
        form_usage_step_verifiers: step.step_order === 2 ? mocks.savedTeam.map(user_id => ({ user_id })) : [] }));
    const data: Record<string, unknown[]> = {
      form_usages: [{ id: "usage", name: "Dana HRD", request_category: "non_asset", scope_type: "pusat", status: "draft", sort_order: 0,
        form_id: "pgd", master_forms: { id: "pgd", nama_form: "PGD" }, form_usage_steps: steps,
        form_usage_departments: [{ department_id: "hrd" }], form_usage_attachment_requirements: [] }],
      master_forms: [{ id: "pgd", nama_form: "PGD" }],
      master_departments: [{ id: "hrd", name: "HRD" }],
      master_offices: [{ id: "hq", name: "Kantor Pusat", kedudukan: "Pusat" }],
      profiles: [{ id: "manager", full_name: "Manager HRD", department_id: "hrd", office_id: "hq", job_title: "Manager HRD" },
        { id: "usman", full_name: "Usman Huda", department_id: "hrd", office_id: "hq", job_title: "Staff" },
        { id: "tri", full_name: "Tri Sulistyanto", department_id: "hrd", office_id: "hq", job_title: "Staff" }],
      approval_route_templates: [],
    };
    const chain = {
      select: () => chain, order: () => chain, eq: () => chain, neq: () => chain,
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => Promise.resolve(resolve({ data: data[table] || [], error: null })),
    };
    return chain;
  },
} }));

async function openReviewTeam() {
  render(<MemoryRouter><FormUsageManagementPage /></MemoryRouter>);
  fireEvent.click(await screen.findByTitle("Edit"));
  const heading = screen.getAllByText("Tim Pemeriksa Sebelum Tahap Ini")[1];
  const section = heading.parentElement?.parentElement?.parentElement;
  if (!(section instanceof HTMLElement)) throw new Error("Review team section missing");
  return within(section);
}

describe("verifier team explicit opt-in", () => {
  beforeEach(() => { mocks.savedTeam = []; mocks.toast.mockClear(); mocks.rpc.mockReset(); });

  it("enables an empty team without selecting everyone and retains the picker when the last user is removed", async () => {
    const team = await openReviewTeam();
    const enabled = team.getByRole("checkbox", { name: "Aktifkan" });
    expect(enabled).not.toBeChecked();
    fireEvent.click(enabled);
    expect(enabled).toBeChecked();
    const usman = team.getByRole("checkbox", { name: /Usman Huda/ });
    const tri = team.getByRole("checkbox", { name: /Tri Sulistyanto/ });
    expect(usman).not.toBeChecked();
    expect(tri).not.toBeChecked();
    fireEvent.click(usman);
    expect(usman).toBeChecked();
    expect(tri).not.toBeChecked();
    fireEvent.click(usman);
    expect(team.getByRole("checkbox", { name: /Usman Huda/ })).not.toBeChecked();
    expect(enabled).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Simpan Kegunaan" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("operator pemeriksa") })));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("preserves existing selected members without selecting other candidates", async () => {
    mocks.savedTeam = ["usman"];
    const team = await openReviewTeam();
    expect(team.getByRole("checkbox", { name: "Aktifkan" })).toBeChecked();
    expect(team.getByRole("checkbox", { name: /Usman Huda/ })).toBeChecked();
    expect(team.getByRole("checkbox", { name: /Tri Sulistyanto/ })).not.toBeChecked();
  });
});
