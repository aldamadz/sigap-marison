import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InboxPage from "@/pages/surat/InboxPage";

type FixtureItem = { nama_barang?: string; id?: string; keterangan?: string; jumlah: string | number; satuan?: string; estimasi_harga_satuan?: number };
type Fixture = {
  id: string; surat_id: string; task_type: string; step_order: number; role_name: string; is_signed: boolean;
  label_jabatan?: string;
  verifier_snapshot?: { user_id: string; full_name: string }[]; requires_unit_allocation?: boolean;
  surat_registrasi: {
    id: string; no_surat: string; judul_surat: string; status: string; created_at: string; request_date: string; request_place: string;
    requester_snapshot: { full_name: string }; location_snapshot: { office: { name: string }; department: { name: string }; form: { nomor_form: string } };
    form_input_data: { request_category: string; items: FixtureItem[]; requires_recommendation?: boolean };
    policy_snapshot: Record<string, unknown>; surat_signatures: unknown[]; surat_attachments: unknown[];
  };
};

const mocks = vi.hoisted(() => ({
  fixture: {} as Fixture,
  compact: null as Record<string, unknown> | null,
  currentUser: null as {id:string}|null,
  detailError: false,
  kpi: [] as Record<string,unknown>[],
  noop: vi.fn(),
  requestRevision: vi.fn(),
  saveDraft: vi.fn(async (_signature: string, _payload: unknown, _note?: string) => ({})),
  prompt: vi.fn(),
  error: vi.fn(),
  empty: [],
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.noop }),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: queryKey[0] === "surat-inbox-detail" ? queryKey[1] && !mocks.detailError ? mocks.fixture : undefined : queryKey[0] === "user-profile-inbox" ? mocks.currentUser : queryKey[0] === "surat-inbox-kpi" ? mocks.kpi : mocks.empty,
    isError: queryKey[0] === "surat-inbox-detail" && mocks.detailError,isFetching: false, isLoading: false,
  }),
}));
vi.mock("@/features/surat/inbox/lib/use-inbox-pagination", () => ({
  useInboxPagination: () => ({
    items: [mocks.compact || mocks.fixture], total: 1, remaining: 0, hasMore: false, loading: false, error: null, isFetching: false,
    detailCache: {}, setDetailCache: mocks.noop, loadMore: mocks.noop, refetch: mocks.noop, refetchFull: mocks.noop,
    finishTaskLocally: mocks.noop, refreshAfterAction: mocks.noop, resetPagination: mocks.noop,
  }),
}));
vi.mock("@/providers/AttentionProvider", () => ({ useAttention: () => ({ refetch: mocks.noop }) }));
vi.mock("@/components/app/AppDialogProvider", () => ({ useAppDialog: () => ({ prompt: mocks.prompt }) }));
vi.mock("@/hooks/useDocumentOpener", () => ({
  useDocumentOpener: () => ({ openPdf: mocks.noop, openFile: mocks.noop, isOpening: () => false }),
  documentOperationKey: { pdf: () => "document", file: () => "file" },
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})},channel:()=>{const channel={on:()=>channel,subscribe:()=>channel};return channel;},removeChannel:()=>undefined},
  onRealtimeReconnect:()=>({unsubscribe:()=>undefined}),
}));
vi.mock("@/features/surat/inbox/services/surat-approval-api", () => ({
  suratApprovalApi: { requestProcessRevision: mocks.requestRevision, saveVerificationDraft:mocks.saveDraft },
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.noop } }));

const reason = "Perbaiki data dan lampiran pendukung.";
const originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
const renderInbox = () => render(<MemoryRouter><InboxPage /></MemoryRouter>);
const openRevision = () => {
  fireEvent.click(screen.getByRole("button", { name: "Perbaikan" }));
  return within(screen.getByRole("dialog", { name: "Perbaikan pengajuan" }));
};
const chooseOption = (trigger: HTMLElement, label: string) => {
  fireEvent.keyDown(trigger, { key: "Enter" });
  fireEvent.click(screen.getByRole("option", { name: label }));
};
const useKeu10 = (role = "verifikator") => {
  mocks.fixture.role_name = role;
  mocks.fixture.surat_registrasi.location_snapshot.form.nomor_form = "FM-UAI.KEU-10-00";
  mocks.fixture.surat_registrasi.form_input_data.items = [
    { id: "item", keterangan: "Biaya sertifikat", jumlah: 3, satuan: "dokumen", estimasi_harga_satuan: 150_000 },
  ];
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.compact = null;
  mocks.kpi=[];
  mocks.currentUser=null;mocks.detailError=false;
  mocks.requestRevision.mockResolvedValue({ id: "revision" });
  mocks.prompt.mockResolvedValue(reason);
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  mocks.fixture = {
    id: "signature", surat_id: "surat", task_type: "approval", step_order: 3, role_name: "menyetujui", is_signed: false,
    surat_registrasi: {
      id: "surat", no_surat: "001/UAI/X/2026", judul_surat: "Pengajuan Aset", status: "PROSES",
      created_at: "2026-10-06", request_date: "2026-10-06", request_place: "Solo",
      requester_snapshot: { full_name: "Pemohon" },
      location_snapshot: { office: { name: "KC. Solo" }, department: { name: "Keuangan" }, form: { nomor_form: "FM-UAI.PGD-03-00" } },
      form_input_data: { request_category: "asset", items: [{ nama_barang: "Laptop", jumlah: "3" }] },
      policy_snapshot: {}, surat_signatures: [], surat_attachments: [],
    },
  };
});

afterEach(() => {
  cleanup();
  if (originalScrollIntoView) Object.defineProperty(Element.prototype, "scrollIntoView", originalScrollIntoView);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Inbox requester data and attachment revision", () => {
  it('does not prefill examiner identity fields from requester-controlled allocation detail', async () => {
    const unit = {value:'2048',label:'B40',raw:{id:2048,type:'30/52',land_area:60,production_code:'001/UAI/PRC/5.2/07/10/2026'}};
    Object.assign(mocks.fixture,{task_type:'verification',verification_required:true,verification_status:'pending',requires_unit_allocation:true,action_type:'unit_allocation'});
    Object.assign(mocks.fixture.surat_registrasi.form_input_data,{request_category:'unit',requested_unit_count:1,
      requested_project:{id:23,code:'TEST',name:'Proyek Uji'},
      allocated_units:[{...unit,allocation_detail:{examiner_verified:true,unit_type:'forged',production_serial:'999',production_block:'fake',production_date:'2020-01-01'}}]});
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({options:[unit]})})));
    renderInbox();
    expect(await screen.findByRole('textbox',{name:'Tipe unit kavling B40'})).toHaveValue('30/52');
    expect(screen.getByRole('textbox',{name:'Nomor kode produksi kavling B40'})).toHaveValue('001');
    expect(screen.getByRole('textbox',{name:'Desain kode produksi kavling B40'})).toHaveValue('5.2');
  });
  it('shows the server paused clock and blocks approval without blocking correction requests',async()=>{
    mocks.fixture.step_order=2;
    mocks.kpi=[{signature_id:'signature',elapsed_minutes:20,sla_minutes:120,is_late:false,sla_paused:true,sla_pause_reasons:['Menunggu rekomendasi']}];
    renderInbox();
    expect(await screen.findByText('SLA dijeda')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Setujui'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'Perbaikan'})).toBeEnabled();
  });
  it('allows examiner reference edits while LT stays external and saves edits across remount', async () => {
    const unit = {value:'2048',label:'B40',raw:{id:2048,type:'30/52',land_area:60,production_code:'001/UAI/PRC/5.2/07/10/2026'}};
    const project = {id:23,code:'TEST',name:'Proyek Uji'};
    Object.assign(mocks.fixture,{task_type:'verification',verification_required:true,verification_status:'pending',requires_unit_allocation:true,action_type:'unit_allocation'});
    Object.assign(mocks.fixture.surat_registrasi.form_input_data,{request_category:'unit',requested_unit_count:1,requested_project:project});
    const snapshot = {verification_drafts:{signature:{input:{allocated_project:project,allocated_units:[unit]}}}};
    Object.assign(mocks.fixture.surat_registrasi,{data_snapshot:snapshot});
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({options:[unit]})})));
    const first=renderInbox();
    const type = await screen.findByRole('textbox',{name:'Tipe unit kavling B40'});
    expect(type).toHaveValue('30/52');expect(type).not.toHaveAttribute('readonly');
    expect(screen.getByRole('textbox',{name:'LT (Luas Tanah) kavling B40'})).toBeDisabled();
    expect(screen.getByRole('textbox',{name:'LT (Luas Tanah) kavling B40'})).toHaveValue('60');
    expect(screen.getByRole('button',{name:'Pilih tanggal produksi B40'})).toBeEnabled();
    fireEvent.change(type,{target:{value:'36/72'}});
    fireEvent.change(screen.getByRole('textbox',{name:'Nomor kode produksi kavling B40'}),{target:{value:'9'}});
    fireEvent.blur(screen.getByRole('textbox',{name:'Nomor kode produksi kavling B40'}));
    fireEvent.change(screen.getByRole('textbox',{name:'Desain kode produksi kavling B40'}),{target:{value:'6.1'}});
    fireEvent.click(screen.getByRole('button',{name:'Pilih tanggal produksi B40'}));
    fireEvent.click(within(screen.getByRole('grid')).getByText('8',{selector:'button'}));
    expect(type.closest('tr')).toHaveTextContent('009/UAI/PRC/6.1/08/10/2026');
    await waitFor(()=>expect(mocks.saveDraft).toHaveBeenCalled(),{timeout:3000});
    const payload=mocks.saveDraft.mock.lastCall![1] as any;
    expect(payload.allocated_units[0].allocation_detail).toMatchObject({unit_type:'36/72',production_serial:'009',production_block:'6.1',production_date:'2026-10-08'});
    expect(payload.allocated_units[0].raw).toEqual(unit.raw);
    first.unmount();snapshot.verification_drafts.signature.input=payload;
    renderInbox();
    expect(await screen.findByRole('textbox',{name:'Tipe unit kavling B40'})).toHaveValue('36/72');
    expect(screen.getByRole('textbox',{name:'Nomor kode produksi kavling B40'})).toHaveValue('009');
    expect(screen.getByRole('textbox',{name:'Desain kode produksi kavling B40'})).toHaveValue('6.1');
    expect(screen.getByRole('button',{name:'Pilih tanggal produksi B40'})).toHaveTextContent('08/10/2026');
  });
  it('opens the requested canonical detail even when absent from the paginated compact queue',()=>{
    const signature='00000000-0000-4000-8000-000000000003',user='00000000-0000-4000-8000-000000000004';
    mocks.currentUser={id:user};mocks.fixture.id=signature;Object.assign(mocks.fixture,{user_id:user});
    mocks.compact={id:'other-signature',task_type:'approval',no_surat:'UNRELATED',judul_surat:'Unrelated queue'};
    render(<MemoryRouter initialEntries={[`/surat/inbox?task=approval:${signature}`]}><InboxPage/></MemoryRouter>);
    expect(screen.getByText('001/UAI/X/2026')).toBeInTheDocument();expect(screen.queryByText('Unrelated queue')).not.toBeInTheDocument();
  });
  it('keeps a stale requested task unavailable instead of selecting an unrelated first task',()=>{
    mocks.detailError=true;mocks.compact={id:'other-signature',task_type:'approval',judul_surat:'Unrelated queue'};
    render(<MemoryRouter initialEntries={['/surat/inbox?task=approval:00000000-0000-4000-8000-000000000003']}><InboxPage/></MemoryRouter>);
    expect(screen.getByText('Tugas yang dipilih tidak tersedia untuk akun ini atau sudah berpindah tahap.')).toBeInTheDocument();expect(screen.queryByText('Unrelated queue')).not.toBeInTheDocument();
  });
  it("shows queue identity from flat compact rows without loading every detail", async () => {
    mocks.compact = { id: "signature", surat_id: "surat", task_type: "approval", step_order: 3,
      no_surat: "009/UAI/TEST/X/2026", judul_surat: "Pengajuan Dana Operasional: Perawatan",
      requester_name: "Pemohon Antrean", requester_department: "Umum & Keuangan",
      request_category: "non_asset", has_attachment_requirements: true };
    renderInbox();
    fireEvent.click(screen.getByRole("button", { name: /Antrean/ }));
    const card = screen.getByTestId("inbox-task-approval:signature");
    expect(within(card).getByText("009/UAI/TEST/X/2026")).toBeInTheDocument();
    expect(within(card).getByText("Pengajuan Dana Operasional: Perawatan")).toBeInTheDocument();
    expect(within(card).getByText("Pemohon Antrean · Umum & Keuangan")).toBeInTheDocument();
    expect(within(card).getByText("Pengajuan Dana")).toBeInTheDocument();
    expect(within(card).getByText("Lampiran")).toBeInTheDocument();
    expect(within(card).queryByText("Nomor diproses")).not.toBeInTheDocument();
  });
  it.each(["Mgr. HRD & GA", "Mgr. Perencanaan"])("allows %s checkers to request missing RAB/redaction without reducing items", async label => {
    mocks.fixture.task_type = "verification";
    mocks.fixture.role_name = "memeriksa";
    mocks.fixture.label_jabatan = label;
    mocks.fixture.surat_registrasi.form_input_data.request_category = "non_asset";
    renderInbox();
    fireEvent.click(screen.getByRole("button", { name: "Minta perbaikan" }));
    await waitFor(() => expect(mocks.requestRevision).toHaveBeenCalledOnce());
    expect(mocks.requestRevision.mock.calls[0][0]).toMatchObject({ targetType: "requester", reason,
      changes: { requester_edit_required: true, restart_step: 3 } });
    expect(mocks.requestRevision.mock.calls[0][0].changes).not.toHaveProperty("item_revisions");
    expect(mocks.requestRevision.mock.calls[0][0].changes).not.toHaveProperty("unit_availability_dead_end");
    expect(mocks.fixture.surat_registrasi.form_input_data.items).toEqual([{ nama_barang: "Laptop", jumlah: "3" }]);
  });
  it.each([true, false])("defaults to general return with structured items=%s", async (hasItems) => {
    if (!hasItems) mocks.fixture.surat_registrasi.form_input_data.items = [];
    renderInbox();
    const dialog = openRevision();
    expect(dialog.getByRole("radio", { name: "Minta Perbaikan Pemohon" })).toBeChecked();
    expect(dialog.queryByText("Perubahan item")).not.toBeInTheDocument();
    const input = dialog.getByLabelText("Alasan pengembalian");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("minlength", "5");
    fireEvent.change(input, { target: { value: `  ${reason}  ` } });
    fireEvent.click(dialog.getByRole("button", { name: /Minta perbaikan|Kirim revisi/ }));
    await waitFor(() => expect(mocks.requestRevision).toHaveBeenCalledExactlyOnceWith({
      suratId: "surat", signatureId: "signature", targetType: "requester", targetStep: null, reason,
      changes: { note: reason, requested_by: "approval_inbox", requires_resign: true, restart_step: 3, requester_edit_required: true },
    }));
  });

  it.each(["", "    ", " abcd "])("rejects an insufficient general reason %j", (value) => {
    renderInbox();
    const dialog = openRevision();
    fireEvent.change(dialog.getByLabelText("Alasan pengembalian"), { target: { value } });
    fireEvent.click(dialog.getByRole("button", { name: /Minta perbaikan|Kirim revisi/ }));
    expect(mocks.requestRevision).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith("Catatan revisi minimal 5 karakter.");
  });

  it("validates full signer proposals and sends all edited fields without applying them", async () => {
    renderInbox();
    const dialog = openRevision();
    fireEvent.click(dialog.getByRole("radio", { name: "Revisi oleh Penandatangan" }));
    fireEvent.change(dialog.getByLabelText("Jumlah"), { target: { value: "0" } });
    fireEvent.change(dialog.getByLabelText("Alasan revisi"), { target: { value: reason } });
    fireEvent.click(dialog.getByRole("button", { name: "Kirim usulan revisi" }));
    expect(mocks.requestRevision).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("Jumlah"));
    fireEvent.change(dialog.getByLabelText("Jumlah"), { target: { value: "2.5" } });
    fireEvent.change(dialog.getByLabelText("Nama Barang"), { target: { value: "Laptop revisi" } });
    fireEvent.change(dialog.getByLabelText("Alasan revisi"), { target: { value: "abcd" } });
    fireEvent.click(dialog.getByRole("button", { name: "Kirim usulan revisi" }));
    expect(mocks.requestRevision).not.toHaveBeenCalled();
    fireEvent.change(dialog.getByLabelText("Alasan revisi"), { target: { value: reason } });
    fireEvent.click(dialog.getByRole("button", { name: "Kirim usulan revisi" }));
    await waitFor(() => expect(mocks.requestRevision).toHaveBeenCalledOnce());
    const payload = mocks.requestRevision.mock.calls[0][0];
    expect(payload).toMatchObject({ targetType: "requester", reason, changes: {
      requires_resign: true, restart_step: 3, signer_revision_required: true,
      signer_proposed_form: { form_input_data: { items: [{ nama_barang: "Laptop revisi", jumlah: 2.5 }] } },
    } });
    expect(payload.changes).not.toHaveProperty("requester_edit_required");
    expect(payload.changes).not.toHaveProperty("external_submission_revision");
    expect(mocks.fixture.surat_registrasi.form_input_data.items[0]).toEqual({ nama_barang: "Laptop", jumlah: "3" });
  });

  it("does not send hidden item changes or use their reasons in general mode", async () => {
    renderInbox();
    const dialog = openRevision();
    fireEvent.click(dialog.getByRole("radio", { name: "Revisi oleh Penandatangan" }));
    fireEvent.change(dialog.getByLabelText("Nama Barang"), { target: { value: "Usulan item sebelumnya" } });
    fireEvent.click(dialog.getByRole("radio", { name: "Minta Perbaikan Pemohon" }));
    fireEvent.click(dialog.getByRole("button", { name: /Minta perbaikan|Kirim revisi/ }));
    expect(mocks.requestRevision).not.toHaveBeenCalled();
    fireEvent.change(dialog.getByLabelText("Alasan pengembalian"), { target: { value: reason } });
    fireEvent.click(dialog.getByRole("button", { name: /Minta perbaikan|Kirim revisi/ }));
    await waitFor(() => expect(mocks.requestRevision).toHaveBeenCalledOnce());
    expect(mocks.requestRevision.mock.calls[0][0].changes).toEqual({
      note: reason, requested_by: "approval_inbox", requires_resign: true, restart_step: 3, requester_edit_required: true,
    });
  });

  it("resets the mode when reopening the return dialog", () => {
    renderInbox();
    const dialog = openRevision();
    fireEvent.click(dialog.getByRole("radio", { name: "Revisi oleh Penandatangan" }));
    fireEvent.click(dialog.getByRole("button", { name: "Batal" }));
    expect(openRevision().getByRole("radio", { name: "Minta Perbaikan Pemohon" })).toBeChecked();
  });

  it.each([
    ["checker", "Tim pemeriksa", 3, 3],
    ["signer", "Signer sebelumnya", 2, 2],
    ["recommendation", "Tim IT / rekomendasi", null, 3],
  ])("preserves %s destination behavior", async (target, label, targetStep, restartStep) => {
    mocks.fixture.verifier_snapshot = [{ user_id: "checker", full_name: "Pemeriksa" }];
    mocks.fixture.surat_registrasi.form_input_data.requires_recommendation = true;
    renderInbox();
    const targetSelect = screen.getAllByRole("combobox").find((element) => element.textContent === "Pemohon")!;
    chooseOption(targetSelect, String(label));
    const dialog = openRevision();
    expect(dialog.queryByRole("radio")).not.toBeInTheDocument();
    chooseOption(dialog.getByRole("combobox"), "Tidak disetujui");
    fireEvent.change(dialog.getByRole("textbox"), { target: { value: reason } });
    fireEvent.click(dialog.getByRole("button", { name: /Minta perbaikan|Kirim revisi/ }));
    await waitFor(() => expect(mocks.requestRevision).toHaveBeenCalledOnce());
    const payload = mocks.requestRevision.mock.calls[0][0];
    expect(payload).toMatchObject({ targetType: target, targetStep, reason, changes: {
      requires_resign: true, restart_step: restartStep, item_revisions: [{ action: "reject", alasan: reason }],
    } });
    expect(payload.changes).not.toHaveProperty("requester_edit_required");
  });

  it.each(["pemohon", "memeriksa", "menyetujui", "verifikator"])("allows KEU10 %s general return without item validation", async (role) => {
    useKeu10(role);
    mocks.fixture.surat_registrasi.form_input_data.items[0].jumlah = 0;
    renderInbox();
    const dialog = openRevision();
    expect(dialog.queryByLabelText("Keterangan")).not.toBeInTheDocument();
    expect(dialog.getByRole("radio", { name: "Revisi oleh Penandatangan" })).toBeEnabled();
    fireEvent.change(dialog.getByLabelText("Alasan pengembalian"), { target: { value: reason } });
    fireEvent.click(dialog.getByRole("button", { name: /Minta perbaikan|Kirim revisi/ }));
    await waitFor(() => expect(mocks.requestRevision).toHaveBeenCalledExactlyOnceWith({
      suratId: "surat", signatureId: "signature", targetType: "requester", targetStep: null, reason,
      changes: { note: reason, requested_by: "approval_inbox", requires_resign: true, restart_step: 3, requester_edit_required: true },
    }));
  });

  it("retains validated KEU10 proposals for the formal verifier in item mode", async () => {
    useKeu10();
    renderInbox();
    const dialog = openRevision();
    fireEvent.click(dialog.getByRole("radio", { name: "Revisi oleh Penandatangan" }));
    fireEvent.change(dialog.getByLabelText("Jumlah"), { target: { value: "0" } });
    fireEvent.change(dialog.getByLabelText("Alasan revisi"), { target: { value: reason } });
    fireEvent.click(dialog.getByRole("button", { name: "Kirim usulan revisi" }));
    expect(mocks.requestRevision).not.toHaveBeenCalled();
    fireEvent.change(dialog.getByLabelText("Jumlah"), { target: { value: "2" } });
    fireEvent.click(dialog.getByRole("button", { name: "Kirim usulan revisi" }));
    await waitFor(() => expect(mocks.requestRevision).toHaveBeenCalledOnce());
    const payload = mocks.requestRevision.mock.calls[0][0];
    expect(payload.changes).toMatchObject({ requires_resign: true, restart_step: 3,
      signer_revision_required: true, signer_proposed_form: { form_input_data: {
        items: [expect.objectContaining({ jumlah: "2", total: 300_000 })], fund_amount: 300_000,
      } },
    });
    expect(payload.changes).not.toHaveProperty("requester_edit_required");
    expect(mocks.fixture.surat_registrasi.form_input_data.items[0].jumlah).toBe(3);
  });

  it("marks the separate verification dead-end return as requester editing", async () => {
    mocks.fixture.task_type = "verification";
    mocks.fixture.requires_unit_allocation = true;
    mocks.fixture.surat_registrasi.form_input_data.request_category = "unit";
    renderInbox();
    fireEvent.click(screen.getByRole("button", { name: "Minta perbaikan" }));
    await waitFor(() => expect(mocks.requestRevision).toHaveBeenCalledExactlyOnceWith({
      suratId: "surat", signatureId: "signature", targetType: "requester", targetStep: null, reason,
      changes: { note: reason, requested_by: "verification_inbox", requester_edit_required: true,
        requires_resign: true, restart_step: 3, unit_availability_dead_end: true },
    }));
  });

  it("does not expose general return for other verification tasks", () => {
    mocks.fixture.task_type = "verification";
    renderInbox();
    expect(screen.queryByRole("button", { name: /Minta perbaikan/ })).not.toBeInTheDocument();
  });
});
