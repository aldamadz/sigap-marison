import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OfficeManagementPage from "@/pages/admin/OfficeManagementPage";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), toast: vi.fn(), rows: [] as Record<string, unknown>[] }));
vi.mock("@/lib/supabase", () => ({ supabase: {
  from: (table: string) => {
    const query = { select: () => query, order: () => Promise.resolve({ data: mocks.rows, error: null }),
      eq: () => query, then: (resolve: (result: unknown) => void) => resolve({ count: 0, error: null }) };
    return table === "master_offices" ? query : query;
  }, rpc: mocks.rpc,
} }));
vi.mock("@/hooks/use-master-realtime-reload", async () => {
  const React = await import("react");
  return { useMasterRealtimeReload: (_: string, __: string[], load: (background: boolean) => Promise<void>) => {
    React.useEffect(() => { void load(false); }, []);
    return () => load(true);
  } };
});
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/app/AppDialogProvider", () => ({ useAppDialog: () => ({ confirm: vi.fn() }) }));
vi.mock("@/services/marison-payload-mapping.service", () => ({ marisonPayloadMappingService: { list: async () => [] } }));
vi.mock("@/components/admin/MarisonPayloadMappingCell", () => ({ MarisonPayloadMappingCell: () => null }));

describe("office headquarters mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ error: null });
    mocks.rows = [{ id: "hq", code: "HQ", name: "Head Office", kedudukan: "Pusat", parent_id: "kc",
      marison_branch_id: 1, marison_review_required: false, marison_review_reasons: [] },
    { id: "kc", code: "KC", name: "Branch", kedudukan: "KC", parent_id: null,
      marison_branch_id: 2, marison_review_required: false, marison_review_reasons: [] }];
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000003" });
  });
  afterEach(() => vi.unstubAllGlobals());
  const editHQ = async () => {
    render(<OfficeManagementPage />);
    const row = (await screen.findByText("Head Office")).closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "Edit" }));
    return screen.getByRole("dialog");
  };
  it("hides a legacy headquarters parent and sends null through the guarded RPC", async () => {
    const dialog = await editHQ();
    expect(within(dialog).queryByText("Kantor induk")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("save_master_office", expect.objectContaining({
      p_id: "hq", p_parent_id: null, p_kedudukan: "Pusat", p_create: false,
    })));
  });
  it("clears the parent when converting KC to headquarters", async () => {
    render(<OfficeManagementPage />);
    const row = (await screen.findByText("Branch")).closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByRole("option", { name: "Pusat" }));
    expect(within(dialog).queryByText("Kantor induk")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("save_master_office", expect.objectContaining({ p_parent_id: null })));
  });
  it.each(["KCP", "Kost"])("%s still requires a parent", async (kind) => {
    const dialog = await editHQ();
    fireEvent.click(within(dialog).getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: kind }));
    expect(within(dialog).getByText("Kantor induk")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Hirarki belum lengkap" }));
  });
  it("reuses the create UUID after an uncertain outcome and prevents concurrent double saves", async () => {
    render(<OfficeManagementPage />);
    await screen.findByText("Head Office");
    fireEvent.click(screen.getByRole("button", { name: "Tambah Manual" }));
    const dialog = screen.getByRole("dialog");
    const inputs = within(dialog).getAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "NEW" } });
    fireEvent.change(inputs[1], { target: { value: "New HQ" } });
    fireEvent.click(within(dialog).getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByRole("option", { name: "Pusat" }));
    let finish!: (value: unknown) => void;
    mocks.rpc.mockImplementationOnce(() => new Promise((done) => { finish = done; }));
    const save = within(dialog).getByRole("button", { name: "Simpan" });
    fireEvent.click(save); fireEvent.click(save);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    finish({ error: { message: "Connection lost" } });
    await waitFor(() => expect(save).not.toBeDisabled());
    fireEvent.click(save);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
    expect(mocks.rpc.mock.calls[0][1]).toEqual(mocks.rpc.mock.calls[1][1]);
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_id: "00000000-0000-4000-8000-000000000003", p_create: true, p_parent_id: null });
  });
});
