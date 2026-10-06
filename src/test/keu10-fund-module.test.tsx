import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fundModule } from "@/features/surat/registration/usages/fund/fund-module";
import type { UsageModuleContext } from "@/features/surat/registration/usages/usage-contract";
import type { Keu10Config } from "@/features/surat/registration/lib/keu10-config";
import { FUND_SUBMISSION_TYPES } from "@/features/surat/registration/usages/fund/fund-types";

const config: Keu10Config = { version: 1, disposition: "legal_land", purposes: [{ code: "land", label: "Pengurusan tanah" }], approval_threshold: null };
const items = [{ keterangan: "Pengurusan tanah", jumlah: 2, satuan: "dokumen", estimasi_harga_satuan: 150_000, total: 1 }];
function context(): UsageModuleContext {
  return {
    usage: { id: "keu10", scope_type: "cabang", keu10_config: config, master_forms: { nomor_form: "FM-UAI.KEU-10-00" } },
    usageKey: "non_asset", category: "non_asset", formData: { office_id: "branch", dept_id: "finance", entity_id: "entity", letter_type_id: "keu", project_id: "project" },
    input: { items, keu10_purpose_code: "land", fund_type: "operational" }, isPusatSelected: false, requesterDepartmentId: "finance",
    linkedDocumentContext: null, externalRevision: null, generatedNoSurat: null,
    master: { entities: [], depts: [], offices: [], types: [], users: [], projects: [] },
    marisonProject: { ready: true, projectId: 1, projectName: "Project", unavailableCount: 0 }, unitAvailability: null, recommendationIO: null,
    setInputValue: vi.fn(), setSelection: vi.fn(), requestExternalOptions: async () => [],
  };
}

describe("KEU 10 fund module", () => {
  it("requires a branch and ready project even with stale without-project flags", () => {
    const ctx = context();
    ctx.input.fund_without_project = true;
    expect(fundModule.usesProjectForUsage?.(ctx.usage)).toBe(true);
    expect(fundModule.requiresMasterProjectMappingForUsage?.(ctx.usage)).toBe(true);
    expect(fundModule.allowsOptionalProjectForUsage?.(ctx.usage)).toBe(false);
    expect(fundModule.validateNumberContext(ctx)).toEqual([]);
    ctx.formData.project_id = "";
    expect(fundModule.validateNumberContext(ctx)[0].title).toBe("Proyek Tujuan Wajib Dipilih");
    expect(fundModule.validateSubmit?.(ctx)?.[0].title).toBe("Proyek Tujuan Wajib Dipilih");
    ctx.formData.project_id = "project";
    ctx.marisonProject = null;
    expect(fundModule.validateNumberContext(ctx)[0].title).toBe("Proyek Belum Terhubung");
    ctx.isPusatSelected = true;
    expect(fundModule.validateNumberContext(ctx)[0].title).toBe("Cabang Wajib Dipilih");
  });
  it("uses configured purposes before items and hides the without-project control", () => {
    const ctx = context();
    ctx.usage.keu10_config = { ...config, purposes: [...config.purposes, { code: "certificate", label: "Sertifikat tanah" }] };
    render(<>{fundModule.renderContextPanel(ctx)}{fundModule.renderDetailsPanel?.(ctx)}</>);
    const select = screen.getByRole("combobox", { name: "Tujuan Pengajuan" });
    expect(select).toHaveTextContent("Pengurusan tanah");
    expect(select.compareDocumentPosition(screen.getByLabelText("Keterangan")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Jenis Pengajuan Dana" })).toHaveTextContent("Biaya Operasional");
    expect(screen.queryByText(/Free Cash|Kebutuhan Dana/)).not.toBeInTheDocument();
    fireEvent.click(select);
    fireEvent.click(screen.getByRole("option", { name: "Sertifikat tanah" }));
    expect(ctx.setInputValue).toHaveBeenCalledWith("keu10_purpose_code", "certificate");
  });
  it("disables the purpose selector when config is missing", () => {
    const ctx = context();
    ctx.usage.keu10_config = null;
    render(<>{fundModule.renderDetailsPanel?.(ctx)}</>);
    expect(screen.getByRole("combobox", { name: "Tujuan Pengajuan" })).toBeDisabled();
  });
  it("rejects missing, unknown, or cross-usage purposes and malformed config", () => {
    const ctx = context();
    expect(fundModule.validateSubmit?.(ctx)).toEqual([]);
    ctx.input.keu10_purpose_code = "other-usage";
    expect(fundModule.validateSubmit?.(ctx)?.[0].title).toBe("Tujuan Pengajuan Wajib Dipilih");
    expect(fundModule.isFieldComplete?.({ key: "keu10_purpose_code" }, ctx)).toBe(false);
    delete ctx.input.keu10_purpose_code;
    expect(fundModule.validateSubmit?.(ctx)?.[0].title).toBe("Tujuan Pengajuan Wajib Dipilih");
    ctx.usage.keu10_config = null;
    expect(fundModule.validateSubmit?.(ctx)?.[0].title).toBe("Konfigurasi KEU 10 Tidak Valid");
  });
  it("normalizes only the KEU 10 financial payload and retains computed row total", () => {
    const ctx = context();
    const result = fundModule.normalizeInput({ ...ctx.input, free_cash_sisa_bulan_lalu: 50_000, fund_without_project: true, fund_type: "production_cost", total: 1 }, ctx);
    expect(result).toMatchObject({ fund_amount: 300_000, fund_without_project: false, keu10_purpose_code: "land", items: [{ total: 300_000 }] });
    expect(result).not.toHaveProperty("free_cash_sisa_bulan_lalu");
    expect(result).toHaveProperty("fund_type", "production_cost");
    expect(result).not.toHaveProperty("total");
    expect(fundModule.hiddenFieldKeys?.(ctx)).toContain("total");
    expect(fundModule.buildSummaryFields?.(ctx)?.map((field) => field.label)).toEqual(["Jenis Pengajuan Dana", "Tujuan Pengajuan", "Rincian Pengajuan Dana", "Grand Total"]);
    expect(fundModule.cleanup(ctx, "usage_change").inputKeysToDelete).toContain("keu10_purpose_code");
  });
  it("removes stale purpose/free cash values on context reconciliation", () => {
    const ctx = context();
    const result = fundModule.reconcileInputForContext?.({ ...ctx.input, keu10_purpose_code: "unknown", free_cash_sisa_bulan_lalu: 1 }, ctx);
    expect(result).not.toHaveProperty("keu10_purpose_code");
    expect(result).not.toHaveProperty("free_cash_sisa_bulan_lalu");
    expect(fundModule.reconcileInputForContext?.(ctx.input, ctx)).toHaveProperty("keu10_purpose_code", "land");
  });
  it.each(FUND_SUBMISSION_TYPES)("accepts and preserves $value for KEU 10", ({ value, label }) => {
    const ctx = context();
    ctx.input.fund_type = value;
    expect(fundModule.validateNumberContext(ctx)).toEqual([]);
    expect(fundModule.validateSubmit?.(ctx)).toEqual([]);
    expect(fundModule.isFieldComplete?.({ key: "fund_type" }, ctx)).toBe(true);
    expect(fundModule.reconcileInputForContext?.(ctx.input, ctx)).toHaveProperty("fund_type", value);
    expect(fundModule.normalizeInput(ctx.input, ctx)).toHaveProperty("fund_type", value);
    expect(fundModule.buildSummaryFields?.(ctx)?.find((field) => field.key === "fund_type")?.value).toBe(label);
    expect(fundModule.buildSummaryFields?.(ctx)?.find((field) => field.key === "keu10_purpose_code")?.value).toBe("Pengurusan tanah");
  });
  it.each([undefined, "", "invalid", "marketing", "Biaya Marketing"])("blocks invalid KEU 10 fund type %s instead of defaulting", (value) => {
    const ctx = context();
    ctx.input.fund_type = value;
    expect(fundModule.validateNumberContext(ctx)[0].title).toBe("Jenis Pengajuan Dana Wajib Dipilih");
    expect(fundModule.validateSubmit?.(ctx)?.[0].title).toBe("Jenis Pengajuan Dana Wajib Dipilih");
    expect(fundModule.isFieldComplete?.({ key: "fund_type" }, ctx)).toBe(false);
    expect(fundModule.normalizeInput(ctx.input, ctx).fund_type).toBe(value);
  });
  it.each(FUND_SUBMISSION_TYPES)("selects $label for KEU 10 with the canonical value", ({ value, label }) => {
    const ctx = context();
    delete ctx.input.fund_type;
    render(<>{fundModule.renderContextPanel(ctx)}</>);
    fireEvent.click(screen.getByRole("combobox", { name: "Jenis Pengajuan Dana" }));
    expect(screen.getAllByRole("option")).toHaveLength(3);
    fireEvent.click(screen.getByRole("option", { name: label }));
    expect(ctx.setInputValue).toHaveBeenCalledWith("fund_type", value);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
  it("shows exactly the three canonical types for PGD and retains its without-project option", () => {
    const ctx = context();
    ctx.usage.master_forms = { nomor_form: "FM-UAI.PGD-01-00" };
    render(<>{fundModule.renderContextPanel(ctx)}</>);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("combobox", { name: "Jenis Pengajuan Dana" }));
    expect(screen.getAllByRole("option")).toHaveLength(3);
    fireEvent.click(screen.getByRole("option", { name: "Biaya Marketing" }));
    expect(ctx.setInputValue).toHaveBeenCalledWith("fund_type", "marketing_cost");
  });
  it.each(FUND_SUBMISSION_TYPES)("preserves $value for PGD and keeps KEU 1 operational", ({ value, label }) => {
    const ctx = context();
    ctx.input.fund_type = value;
    ctx.usage.master_forms = { nomor_form: "FM-UAI.PGD-01-00" };
    ctx.input.items = [{ nama_barang: "Biaya", jumlah: 1, sat: "paket", harga_satuan: 100 }];
    expect(fundModule.validateNumberContext(ctx)).toEqual([]);
    expect(fundModule.normalizeInput(ctx.input, ctx)).toHaveProperty("fund_type", value);
    expect(fundModule.buildSummaryFields?.(ctx)?.find((field) => field.key === "fund_type")?.value).toBe(label);
    ctx.usage.master_forms = { nomor_form: "FM-UAI.KEU-01-00" };
    expect(fundModule.renderContextPanel(ctx)).toBeNull();
    expect(fundModule.normalizeInput(ctx.input, ctx)).toHaveProperty("fund_type", "operational");
  });
});
