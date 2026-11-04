import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MasterProjectManagementPage from "@/pages/admin/ProjectManagementPage";

const mocks = vi.hoisted(() => ({
  filters: vi.fn(), update: vi.fn(), insert: vi.fn(), toast: vi.fn(),
  sync: vi.fn(), error: null as Error | null,
}));
vi.mock("@/lib/supabase", () => ({ supabase: {
  from: (table: string) => {
    const query = {
      select: () => query, order: () => query, eq: () => query, range: () => query,
      gt: (...args: unknown[]) => { mocks.filters("gt", ...args); return query; },
      not: (...args: unknown[]) => { mocks.filters("not", ...args); return query; },
      is: (...args: unknown[]) => { mocks.filters("is", ...args); return query; },
      update: (payload: unknown) => { mocks.update(payload); return query; },
      insert: mocks.insert,
      then: (done: (result: unknown) => void) => Promise.resolve(done({
        error: mocks.error, data: table === "master_projects" ? [{
          id: "external", name: "External Project", marison_project_id: 19,
          marison_project_code: "SRG", entity_id: null, marison_review_reasons: [],
        }] : [],
      })),
    };
    return query;
  },
  channel: () => {
    const channel = { on: () => channel, subscribe: () => channel };
    return channel;
  }, removeChannel: vi.fn(),
}, onRealtimeReconnect: () => ({ unsubscribe: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/app/AppDialogProvider", () => ({ useAppDialog: () => ({ confirm: async () => true }) }));
vi.mock("@/services/marison-integration.service", () => ({ marisonIntegrationService: { syncProjects: mocks.sync } }));

beforeEach(() => { vi.clearAllMocks(); mocks.error = null; });

describe("Master Proyek external-only (replaces local ID-reuse UI)", () => {
  it("requires synced external identity and never offers manual creation", async () => {
    render(<MasterProjectManagementPage />);
    await screen.findByText("External Project");
    expect(mocks.filters).toHaveBeenCalledWith("gt", "marison_project_id", 0);
    expect(mocks.filters).toHaveBeenCalledWith("not", "marison_synced_at", "is", null);
    expect(mocks.filters).toHaveBeenCalledWith("is", "local_retired_at", null);
    expect(screen.queryByRole("button", { name: /Tambah manual|Hapus/ })).toBeNull();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("entity assignment cannot overwrite external project identity", async () => {
    render(<MasterProjectManagementPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Atur entitas External Project" }));
    expect(screen.queryByLabelText("ID Proyek Marison")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ entity_id: null }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("entity write failure keeps the dialog open for retry without creating a local project", async () => {
    render(<MasterProjectManagementPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Atur entitas External Project" }));
    mocks.error = new Error("Entity denied");
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      variant: "destructive", description: "Entity denied",
    })));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
