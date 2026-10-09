import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MasterProjectManagementPage from "@/pages/admin/ProjectManagementPage";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  catalog: vi.fn(),
  saveMapping: vi.fn(),
  toast: vi.fn(),
  inserted: [] as Array<Record<string, unknown>>,
  updated: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: mocks.from,
    channel: vi.fn(() => {
      const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
      return channel;
    }),
    removeChannel: vi.fn(),
  },
  onRealtimeReconnect: vi.fn(() => ({ unsubscribe: vi.fn() })),
}));
vi.mock("@/services/marison-payload-mapping.service", () => ({
  marisonPayloadMappingService: {
    list: vi.fn().mockResolvedValue([]),
    catalog: mocks.catalog,
    save: mocks.saveMapping,
  },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/app/AppDialogProvider", () => ({
  useAppDialog: () => ({ confirm: vi.fn().mockResolvedValue(true) }),
}));

const existing = {
  id: "source-project",
  name: "Sragen Test",
  code: "SRG",
  marison_project_code: "SRG",
  marison_synced_at: "2026-09-16T00:00:00Z",
  marison_review_required: false,
  master_offices: {
    marison_branch_id: 7,
    marison_synced_at: "2026-09-16T00:00:00Z",
    marison_review_required: false,
  },
};

beforeEach(() => {
  mocks.inserted.length = 0;
  mocks.updated.length = 0;
  mocks.from.mockReset();
  mocks.catalog.mockReset().mockResolvedValue([{
    id: existing.id,
    name: existing.name,
    external_id: 19,
    valid: true,
  }]);
  mocks.saveMapping.mockReset().mockResolvedValue({ mapping: { target_record_id: existing.id } });
  mocks.toast.mockReset();

  mocks.from.mockImplementation((table: string) => {
    if (table === "master_offices") return {
      select: () => ({ order: async () => ({ data: [{
        id: "office-a", name: "Sragen", kedudukan: "KCP",
        marison_branch_id: 8, marison_synced_at: "2026-09-16T00:00:00Z", marison_review_required: false,
      }], error: null }) }),
    };
    if (table === "master_entities") return {
      select: () => ({ order: async () => ({ data: [], error: null }) }),
    };
    if (table !== "master_projects") throw new Error(`Unexpected table ${table}`);
    return {
      select: () => ({
        order: async () => ({ data: [], error: null }),
        eq: () => ({
          maybeSingle: async () => ({ data: existing, error: null }),
          neq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }),
        }),
      }),
      insert: (rows: Array<Record<string, unknown>>) => {
        mocks.inserted.push(rows[0]);
        return { select: () => ({ single: async () => ({ data: { id: `local-${mocks.inserted.length}` }, error: null }) }) };
      },
      update: (payload: Record<string, unknown>) => {
        mocks.updated.push(payload);
        return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: "local-1" }, error: null }) }) }) };
      },
    };
  });
});

async function addProject(name: string) {
  fireEvent.click(await screen.findByRole("button", { name: /Tambah manual/i }));
  fireEvent.change(screen.getByPlaceholderText("Masukkan nama proyek"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("ID Proyek Marison"), { target: { value: "19" } });
  fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
}

describe("Master Proyek reused Marison ID", () => {
  it("does not write a local project when the staging mapping catalog rejects the target", async () => {
    mocks.catalog.mockResolvedValueOnce([]);
    render(<MasterProjectManagementPage />);
    await addProject("Proyek Lokal A");
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      variant: "destructive",
      description: "ID ini belum tersedia sebagai proyek Marison tersinkronisasi pada mapping payload staging.",
    })));
    expect(mocks.inserted).toHaveLength(0);
    expect(mocks.saveMapping).not.toHaveBeenCalled();
  });

  it("maps multiple local projects to one validated external ID without duplicating the canonical ID", async () => {
    render(<MasterProjectManagementPage />);
    await addProject("Proyek Lokal A");
    await waitFor(() => expect(mocks.saveMapping).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await addProject("Proyek Lokal B");
    await waitFor(() => expect(mocks.saveMapping).toHaveBeenCalledTimes(2));

    expect(mocks.inserted).toEqual([
      expect.objectContaining({ name: "Proyek Lokal A", marison_project_id: null, marison_project_code: null }),
      expect.objectContaining({ name: "Proyek Lokal B", marison_project_id: null, marison_project_code: null }),
    ]);
    expect(mocks.saveMapping).toHaveBeenNthCalledWith(1, expect.objectContaining({
      entityType: "project", recordId: "local-1", targetRecordId: "source-project",
    }));
    expect(mocks.saveMapping).toHaveBeenNthCalledWith(2, expect.objectContaining({
      entityType: "project", recordId: "local-2", targetRecordId: "source-project",
    }));
    expect(mocks.catalog).toHaveBeenCalledWith("project", "SRG", null);
  });

  it("keeps a partially saved project editable if mapping fails", async () => {
    mocks.saveMapping.mockRejectedValueOnce(new Error("Mapping berubah"));
    render(<MasterProjectManagementPage />);
    await addProject("Proyek Lokal A");
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      variant: "destructive",
      description: expect.stringContaining("Proyek tersimpan, tetapi pemetaan ID Marison gagal"),
    })));
    expect(mocks.inserted).toHaveLength(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(mocks.saveMapping).toHaveBeenCalledTimes(2));
    expect(mocks.inserted).toHaveLength(1);
    expect(mocks.updated).toHaveLength(1);
  });
});
