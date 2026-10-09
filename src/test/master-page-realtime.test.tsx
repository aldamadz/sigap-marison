import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OfficeManagementPage from "@/pages/admin/OfficeManagementPage";
import ProjectManagementPage from "@/pages/admin/ProjectManagementPage";

const mocks = vi.hoisted(() => ({
  events: new Map<string, () => void>(), reconnect: null as (() => void) | null,
  query: vi.fn(), rows: {} as Record<string, unknown[]>,
  pause: null as Promise<void> | null,
  update: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: {
  from: (table: string) => {
    const query = { select: () => query, eq: () => query, order: () => query,
      gt: () => query, not: () => query, is: () => query, range: () => query,
      update: (values: unknown) => { mocks.update(table, values); return query; },
      then: async (done: (value: unknown) => void) => {
        mocks.query(table); if (mocks.pause) await mocks.pause;
        return done({ data: mocks.rows[table] || [], error: null, count: 0 });
      } };
    return query;
  },
  channel: () => {
    const channel = { on: (_: string, filter: { table: string }, callback: () => void) => {
      mocks.events.set(filter.table, callback); return channel;
    }, subscribe: () => channel };
    return channel;
  }, removeChannel: vi.fn(),
}, onRealtimeReconnect: (callback: () => void) => {
  mocks.reconnect = callback; return { unsubscribe: vi.fn() };
} }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/app/AppDialogProvider", () => ({ useAppDialog: () => ({ confirm: vi.fn() }) }));
vi.mock("@/services/marison-payload-mapping.service", () => ({ marisonPayloadMappingService: { list: async () => [] } }));
vi.mock("@/components/admin/MarisonPayloadMappingCell", () => ({ MarisonPayloadMappingCell: () => null }));

describe("actual master page consumers", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks(); mocks.events.clear(); mocks.pause = null;
    mocks.rows = {
      master_offices: [{ id: "hq", code: "HQ", name: "Head Office", kedudukan: "Pusat",
        parent_id: null, marison_review_required: false, marison_review_reasons: [] }],
      master_projects: [{ id: "project", code: "PRJ", name: "Project Visible", created_at: "2026-10-09",
        master_offices: { name: "Head Office", kedudukan: "Pusat" }, marison_review_reasons: [] }],
    };
  });
  afterEach(() => vi.useRealTimers());
  it.each([
    ["office", OfficeManagementPage, "Head Office", "master_offices"],
    ["project", ProjectManagementPage, "Project Visible", "master_projects"],
  ] as const)("%s reloads once for burst/reconnect without clearing visible rows or filters", async (_, Page, label, table) => {
    render(<Page />);
    await act(async () => {});
    expect(screen.getByText(label)).toBeVisible();
    fireEvent.change(screen.getByPlaceholderText(/Cari/), { target: { value: label } });
    mocks.query.mockClear();
    let finish!: () => void;
    mocks.pause = new Promise<void>((done) => { finish = done; });
    act(() => {
      for (const event of mocks.events.values()) event();
      mocks.reconnect!();
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByPlaceholderText(/Cari/)).toHaveValue(label);
    expect(document.querySelector(".animate-spin")).toBeNull();
    await act(async () => { mocks.pause = null; finish(); });
    expect(mocks.query.mock.calls.filter(([name]) => name === table)).toHaveLength(1);
    expect(screen.getByText(label)).toBeVisible();
  });
  it("project identity has no manual CRUD and entity assignment writes only entity_id", async () => {
    render(<ProjectManagementPage />);
    await act(async () => {});
    expect(screen.queryByRole("button", { name: /Tambah|Hapus/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Sinkronkan" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Atur entitas Project Visible" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.queryByLabelText(/Nama Proyek|Kode Proyek|Kantor/)).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Simpan" })); });
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith("master_projects", { entity_id: null });
  });
});
