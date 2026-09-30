import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LetterNumberCounterPage from "@/pages/admin/LetterNumberCounterPage";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  toast: vi.fn(),
  confirm: vi.fn().mockResolvedValue(true),
  updated: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/app/AppDialogProvider", () => ({
  useAppDialog: () => ({ confirm: mocks.confirm }),
}));

const configs = [
  {
    id: "cfg-1",
    scope_type: "cabang_000",
    entity_id: "ent-1",
    office_id: "off-1",
    dept_id: null,
    project_id: null,
    year: 2026,
    start_from: 40,
    notes: "Cabang tanpa proyek",
    master_entities: { code: "UAI", name: "PT UAI" },
    master_offices: { code: "KCM", name: "KC Magelang", kedudukan: "KC" },
    master_projects: null,
    master_departments: null,
  },
  {
    id: "cfg-2",
    scope_type: "pusat",
    entity_id: "ent-1",
    office_id: null,
    dept_id: "dept-1",
    project_id: null,
    year: 2026,
    start_from: 12,
    notes: null,
    master_entities: { code: "UAI", name: "PT UAI" },
    master_offices: null,
    master_projects: null,
    master_departments: { code: "PBO", name: "Pengembangan Organisasi" },
  },
];

const policy = { id: "pol-1", unit: "days", value: 2, notes: "opsi", updated_at: "2026-09-30T10:00:00Z", is_active: true };

const tableData = (table: string) =>
  table === "master_entities" ? [{ id: "ent-1", code: "UAI", name: "PT UAI" }]
    : table === "master_departments" ? [{ id: "dept-1", code: "PBO", name: "Pengembangan Organisasi", dept_index: 1 }]
    : table === "master_projects" ? []
    : table === "master_offices" ? [{ id: "off-1", code: "KCM", name: "KC Magelang", kedudukan: "KC" }]
    : table === "letter_number_counter_configs" ? configs
    : [];

beforeEach(() => {
  mocks.from.mockReset();
  mocks.toast.mockReset();
  mocks.confirm.mockReset().mockResolvedValue(true);
  mocks.updated.length = 0;
  // Radix Select scrolls the highlighted option into view on open; jsdom has
  // no scrollIntoView. Without the stub the open triggers an unhandled error
  // and the CI quality gate fails.
  Element.prototype.scrollIntoView = () => {};

  mocks.from.mockImplementation((table: string) => {
    // Thenable chain: any .eq/.order/.limit returns the same chain; awaiting it
    // resolves to the table data. `.limit(1).maybeSingle()` handles the policy.
    const chain = {
      eq: () => chain,
      order: () => chain,
      in: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({
        data: table === "letter_number_reuse_policies" ? policy : null,
        error: null,
      }),
      single: async () => ({ data: null, error: null }),
      then: (resolve: (value: unknown) => void) => {
        resolve({ data: tableData(table), error: null });
      },
    };
    return {
      select: () => chain,
      insert: () => ({ error: null }),
      update: (payload: Record<string, unknown>) => {
        mocks.updated.push(payload);
        return { eq: () => ({ error: null }) };
      },
    };
  });
});

describe("LetterNumberCounterPage", () => {
  it("renders both configuration sections and the current policy", async () => {
    render(<LetterNumberCounterPage />);
    expect(await screen.findByText("Counter Awal")).toBeInTheDocument();
    expect(screen.getByText("Nomor Draft Dibatalkan")).toBeInTheDocument();
    expect(screen.getByText(/2 Hari/)).toBeInTheDocument();
  });

  it("shows cabang_000 scope counter with office context in the list", async () => {
    render(<LetterNumberCounterPage />);
    await screen.findByText("Counter Awal");
    expect((await screen.findAllByText("Cabang tanpa proyek")).length).toBeGreaterThan(0);
    expect(screen.getByText("KCM - KC Magelang")).toBeInTheDocument();
    expect(screen.getByText("PBO - Pengembangan Organisasi")).toBeInTheDocument();
  });

  it("rejects invalid reuse-policy value before saving", async () => {
    render(<LetterNumberCounterPage />);
    await screen.findByText("Nomor Draft Dibatalkan");
    fireEvent.change(screen.getByLabelText("Masa Berlaku"), { target: { value: "0" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Simpan/i })[1]);
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Masa berlaku tidak valid" })));
    expect(mocks.updated).toHaveLength(0);
  });

  it("saves a valid reuse-policy with confirmation", async () => {
    render(<LetterNumberCounterPage />);
    await screen.findByText("Nomor Draft Dibatalkan");
    fireEvent.change(screen.getByLabelText("Masa Berlaku"), { target: { value: "5" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Simpan/i })[1]);
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    await waitFor(() => expect(mocks.updated).toHaveLength(1));
    expect(mocks.updated[0]).toMatchObject({ unit: "days", value: 5, is_active: true });
  });

  it("rejects invalid reuse-policy value before saving", async () => {
    render(<LetterNumberCounterPage />);
    await screen.findByText("Nomor Draft Dibatalkan");
    fireEvent.change(screen.getByLabelText("Masa Berlaku"), { target: { value: "0" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Simpan/i })[1]);
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Masa berlaku tidak valid" })));
    expect(mocks.updated).toHaveLength(0);
  });

  it("saves a valid reuse-policy with confirmation", async () => {
    render(<LetterNumberCounterPage />);
    await screen.findByText("Nomor Draft Dibatalkan");
    fireEvent.change(screen.getByLabelText("Masa Berlaku"), { target: { value: "5" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Simpan/i })[1]);
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    await waitFor(() => expect(mocks.updated).toHaveLength(1));
    expect(mocks.updated[0]).toMatchObject({ unit: "days", value: 5, is_active: true });
  });

  it("requires entity before saving a counter", async () => {
    render(<LetterNumberCounterPage />);
    await screen.findByText("Counter Awal");
    fireEvent.click(screen.getAllByRole("button", { name: /Simpan/i })[0]);
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Entitas wajib dipilih" })));
  });

  it("exposes hours/days unit options", async () => {
    render(<LetterNumberCounterPage />);
    await screen.findByText("Nomor Draft Dibatalkan");
    fireEvent.click(screen.getByRole("combobox", { name: "Satuan" }));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getAllByText("Jam").length).toBeGreaterThan(0);
    expect(within(listbox).getAllByText("Hari").length).toBeGreaterThan(0);
  });
});
