/** Flow MRN-21: Non Aset KC memilih "Tanpa Proyek (Dana Umum)" untuk dana tanpa proyek. */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  allowServiceCalls,
  assertStrictServiceCalls,
} from "./surat-form-harness";
import { MASTER_DATA_DEFAULT, MASTER_DATA_WITH_PROJECTS, CURRENT_PROFILE_KC, FUND_FORM_USAGE_RAW, UUID } from "./surat-form-fixtures";
import {
  configureStandardMocks,
  selectLetterType,
  selectEntity,
  selectFormAndUsage,
  selectOptionByLabel,
  mountFormWithUsage,
  clickGetNumber,
  selectForm,
  selectUsage,
  selectCategory,
  selectCategoryAset,
  selectCategoryUnit,
  selectCategoryNonUnit
} from "./surat-form-driver";

afterEach(() => teardownTestHarness());

describe("Flow MRN-21: Non Aset dana umum tanpa proyek", () => {
  beforeEach(() => {
    setupTestHarness();
    configureStandardMocks();
    serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
    allowServiceCalls(
      "getMasterData",
      "getActiveRegistrationDrafts",
      "generateNoSurat",
      "createRegistrationDraft",
    );
  });

  it.each([
    { selected: "requester", contextual: false, mode: "requester" },
    { selected: "supervisor", contextual: false, mode: "requester" },
    { selected: "supervisor", contextual: true, mode: "requester" },
    { selected: "supervisor", contextual: true, mode: "select" },
  ])("keeps selected $selected through confirmation (contextual=$contextual, mode=$mode)", async ({ selected, contextual, mode }) => {
    allowServiceCalls("saveRegistrationDraft");
    serviceMock.getMasterData.mockResolvedValue({ ...MASTER_DATA_DEFAULT, users: [
      ...MASTER_DATA_DEFAULT.users,
      { id: "spv-marketing", full_name: "SPV Marketing Lokal", job_title: "SPV Marketing", office_id: UUID.office_kc },
      { id: "spv-teknik", full_name: "SPV Teknik Lokal", job_title: "Supervisor Teknik", office_id: UUID.office_kc },
      { id: "spv-other", full_name: "SPV Cabang Lain", job_title: "Supervisor Teknik", office_id: UUID.office_pusat },
    ].map(user => ({ ...user, is_active: true })) });
    const usages = FUND_FORM_USAGE_RAW.map(usage => ({ ...usage,
      ...(contextual ? { first_maker_policy: "contextual" } : {}),
      name: "Pengajuan Kas Kecil - Kantor Cabang",
      master_forms: { ...usage.master_forms, nama_form: "FORM PENGAJUAN KAS KECIL", nomor_form: "FM-UAI.KEU-01-00" },
      form_usage_steps: usage.form_usage_steps.map(step => ({ ...step, assignee_mode: step.step_order === 1 ? mode : "select" })),
    }));
    await mountFormWithUsage(usages, CURRENT_PROFILE_KC);
    await selectForm(/KAS KECIL/i);
    await selectUsage(/Kas Kecil/i);
    await selectLetterType();
    await selectEntity();
    await clickGetNumber();
    fireEvent.change(screen.getByLabelText("Keterangan"), { target: { value: "Listrik kantor" } });
    fireEvent.change(screen.getByLabelText("Jumlah"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Satuan"), { target: { value: "bulan" } });
    const price = screen.getByRole("textbox", { name: "Estimasi harga satuan item 1" });
    fireEvent.change(price, { target: { value: "10000" } });
    fireEvent.blur(price);
    fireEvent.click(screen.getByRole("button", { name: "Selanjutnya" }));
    const trigger = await screen.findByRole("button", { name: /Pemohon Staging.*Staff/ });
    expect(trigger).toBeEnabled();
    fireEvent.click(trigger);
    const options = await screen.findByRole("listbox");
    expect(within(options).getByText("Pemohon Staging")).toBeInTheDocument();
    expect(within(options).getByText("SPV Marketing Lokal")).toBeInTheDocument();
    expect(within(options).getByText("SPV Teknik Lokal")).toBeInTheDocument();
    expect(within(options).queryByText("SPV Cabang Lain")).not.toBeInTheDocument();
    const selectedName = selected === "supervisor" ? "SPV Marketing Lokal" : "Pemohon Staging";
    fireEvent.click(within(options).getByText(selectedName));
    expect(await screen.findByRole("button", { name: new RegExp(`${selectedName}.*(Staff|SPV Marketing)`) })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Konfirmasi Pendaftaran" }));
    const summary = await screen.findByRole("dialog", { name: /Periksa sebelum didaftarkan/i });
    expect(within(summary).getAllByText(selectedName).length).toBeGreaterThan(0);
    expect(screen.queryByText("Pejabat Belum Lengkap")).not.toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("reserves number for dana umum without a Marison project", async () => {
    await mountFormWithUsage(FUND_FORM_USAGE_RAW, CURRENT_PROFILE_KC);
    await selectFormAndUsage(/Dana/i);
    await selectLetterType();
    await selectEntity();

    // KC tidak punya proyek siap Marison; fund bisa memilih Tanpa Proyek.
    expect(await screen.findByText("Belum ada proyek yang siap digunakan")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText("Tanpa Proyek (Dana Umum)"));
    });
    await selectOptionByLabel(/^Jenis Pengajuan Dana$/i, /Biaya Operasional/i);
    await clickGetNumber();

    const payload = serviceMock.generateNoSurat.mock.calls[0][0];
    expect(payload).toMatchObject({
      office_id: CURRENT_PROFILE_KC.office_id,
      project_id: "",
    });
    const input = payload.form_input_data;
    expect(input).toMatchObject({
      request_category: "non_asset",
      request_mode: "barang",
      fund_type: "operational",
      fund_without_project: true,
    });
    expect(input).not.toHaveProperty("requested_project");
    expect(input).not.toHaveProperty("project_code");

    const draftRequest = serviceMock.createRegistrationDraft.mock.calls[0][0];
    expect(draftRequest.payload.formData.form_input_data.requested_project).toBeUndefined();
    expect(draftRequest.payload.formData.form_input_data.fund_without_project).toBe(true);
    await waitFor(() => expect(screen.getByText("001/FA/MKT/VIII/2026")).toBeInTheDocument());

    expect(await screen.findByText("Rincian Fund Submission")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nama barang/jasa"), { target: { value: "Sewa kendaraan operasional" } });
    fireEvent.change(screen.getByLabelText("Jumlah"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Satuan"), { target: { value: "bulan" } });
    const nominal = screen.getByRole("textbox", { name: "Nominal item 1" });
    expect(screen.getAllByText("Rp")).toHaveLength(1);
    fireEvent.change(nominal, { target: { value: "1500000" } });
    fireEvent.blur(nominal);
    expect(await screen.findByText("Rp 1.500.000")).toBeInTheDocument();

    assertStrictServiceCalls();
  });

  it.each(["KC", "KCP"])("limits the %s Branch Manager step to active parent KC managers through confirmation", async scope => {
    allowServiceCalls("saveRegistrationDraft");
    const kcpId = "b1000000-0000-4000-8000-000000000001";
    const offices = [...MASTER_DATA_DEFAULT.offices,
      { id: kcpId, name: "KCP Fixture", kedudukan: "KCP", code: "01", parent_id: UUID.office_kc }];
    serviceMock.getMasterData.mockResolvedValue({ ...MASTER_DATA_DEFAULT, offices, users: [
      ...[
        ...MASTER_DATA_DEFAULT.users,
        { id: "local-bm", full_name: "BM Cabang Terkait", job_title: "Branch Manager", office_id: UUID.office_kc },
        { id: "local-spv", full_name: "SPV Kantor", job_title: "Supervisor Teknik", office_id: UUID.office_kc },
        { id: "local-staff", full_name: "Staff Kantor", job_title: "Staff Admin", office_id: UUID.office_kc },
        { id: "foreign-bm", full_name: "BM Kantor Lain", job_title: "Branch Manager", office_id: UUID.office_pusat },
      ].map(user => ({ ...user, is_active: true })),
      { id: "inactive-bm", full_name: "BM Nonaktif", job_title: "Branch Manager", office_id: UUID.office_kc, is_active: false },
      { id: "deleted-bm", full_name: "BM Terhapus", job_title: "Branch Manager", office_id: UUID.office_kc, is_active: true, deleted_at: "2026-10-08" },
    ] });
    const usages = FUND_FORM_USAGE_RAW.map(usage => ({ ...usage,
      first_maker_policy: "contextual", name: "Pengajuan Kas Kecil - Kantor Cabang",
      master_forms: { ...usage.master_forms, nama_form: "FORM PENGAJUAN KAS KECIL", nomor_form: "FM-UAI.KEU-01-00" },
      form_usage_steps: usage.form_usage_steps.map(step => ({ ...step,
        assignee_mode: step.step_order === 1 ? "requester" : "select",
        ...(step.step_order === 2 ? { label: "Branch Manager", role_name: "memeriksa", candidate_scope: "request_office",
          candidate_fallback_mode: "related_branch_manager", form_usage_step_users: [] } : {}),
      })),
    }));
    await mountFormWithUsage(usages, { ...CURRENT_PROFILE_KC, office_id: scope === "KCP" ? kcpId : UUID.office_kc });
    await selectForm(/KAS KECIL/i);
    await selectUsage(/Kas Kecil/i);
    await selectLetterType();
    await selectEntity();
    await clickGetNumber();
    fireEvent.change(screen.getByLabelText("Keterangan"), { target: { value: "Kas kantor" } });
    fireEvent.change(screen.getByLabelText("Jumlah"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Satuan"), { target: { value: "bulan" } });
    const price = screen.getByRole("textbox", { name: "Estimasi harga satuan item 1" });
    fireEvent.change(price, { target: { value: "10000" } });
    fireEvent.blur(price);
    fireEvent.click(screen.getByRole("button", { name: "Selanjutnya" }));
    fireEvent.click(await screen.findByRole("button", { name: "BM Cabang Terkait" }));
    const options = await screen.findByRole("listbox");
    expect(within(options).getByText("BM Cabang Terkait")).toBeInTheDocument();
    expect(within(options).queryByText("SPV Kantor")).not.toBeInTheDocument();
    expect(within(options).queryByText("Staff Kantor")).not.toBeInTheDocument();
    expect(within(options).queryByText("BM Kantor Lain")).not.toBeInTheDocument();
    expect(within(options).queryByText("BM Nonaktif")).not.toBeInTheDocument();
    expect(within(options).queryByText("BM Terhapus")).not.toBeInTheDocument();
    fireEvent.click(within(options).getByText("BM Cabang Terkait"));
    fireEvent.click(screen.getByRole("button", { name: "Konfirmasi Pendaftaran" }));
    const summary = await screen.findByRole("dialog", { name: /Periksa sebelum didaftarkan/i });
    expect(within(summary).getByText("BM Cabang Terkait")).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("reserves a KEU 1 number without choosing a project even when the branch has projects", async () => {
    serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_WITH_PROJECTS);
    const keu1Usage = FUND_FORM_USAGE_RAW.map((usage) => ({
      ...usage,
      name: "Pengajuan Kas Kecil - Kantor Cabang",
      master_forms: {
        ...usage.master_forms,
        nama_form: "FORM PENGAJUAN KAS KECIL",
        nomor_form: "FM-UAI.KEU-01-00",
      },
    }));
    await mountFormWithUsage(keu1Usage, CURRENT_PROFILE_KC);
    await selectForm(/KAS KECIL/i);
    await selectUsage(/Kas Kecil/i);
    expect(screen.getByText("Proyek Cabang (opsional)")).toBeInTheDocument();
    expect(screen.queryByText("Proyek Tujuan")).not.toBeInTheDocument();
    await selectLetterType();
    await selectEntity();
    await clickGetNumber();

    expect(serviceMock.generateNoSurat).toHaveBeenCalledWith(expect.objectContaining({
      project_id: "",
      form_input_data: expect.objectContaining({
        fund_type: "operational",
        fund_without_project: true,
      }),
    }));
    assertStrictServiceCalls();
  });

  it("keeps an optional KEU 1 project in the number and draft payload, and permits clearing it", async () => {
    serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_WITH_PROJECTS);
    const usages = FUND_FORM_USAGE_RAW.map(usage => ({ ...usage,
      scope_type: "cabang", name: "Pengajuan Kas Kecil - Kantor Cabang",
      master_forms: { ...usage.master_forms, nama_form: "FORM PENGAJUAN KAS KECIL", nomor_form: "FM-UAI.KEU-01-00" },
    }));
    await mountFormWithUsage(usages, CURRENT_PROFILE_KC);
    await selectForm(/KAS KECIL/i);
    await selectUsage(/Kas Kecil/i);
    await selectOptionByLabel(/Proyek Cabang \(opsional\)/i, /Griya Asri/i);
    await selectOptionByLabel(/Proyek Cabang \(opsional\)/i, /^Tanpa proyek$/i);
    await selectOptionByLabel(/Proyek Cabang \(opsional\)/i, /Griya Asri/i);
    await selectLetterType();
    await selectEntity();
    await clickGetNumber();
    expect(serviceMock.generateNoSurat).toHaveBeenCalledWith(expect.objectContaining({
      project_id: "proj-001",
      form_input_data: expect.objectContaining({ fund_without_project: false,
        requested_project: expect.objectContaining({ id: 19, code: "GA01" }) }),
    }));
    const draft = serviceMock.createRegistrationDraft.mock.calls[0][0];
    expect(draft.payload.formData.project_id).toBe("proj-001");
    expect(draft.payload.formData.form_input_data.fund_without_project).toBe(false);
    assertStrictServiceCalls();
  });
});
