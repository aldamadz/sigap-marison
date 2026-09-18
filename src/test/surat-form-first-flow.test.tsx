/** SUR-01 form-first acceptance matrix (Issue #306).
 *
 * Covers contract G points not covered by per-module flow tests:
 * progressive disclosure, no auto-select, fail-closed resolver,
 * reset state, locked profile location, and structural boundaries
 * (no module implementation inside SuratForm, no UUID/name dispatch).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, act, fireEvent, within } from "@testing-library/react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  toastMock,
  allowServiceCalls,
  assertStrictServiceCalls,
} from "./surat-form-harness";
import {
  UUID,
  MASTER_DATA_DEFAULT,
  CURRENT_PROFILE_DEFAULT,
  FORM_USAGES_RAW,
  FORM_USAGES_RAW_WITH_DRAFT,
} from "./surat-form-fixtures";
import {
  configureStandardMocks,
  mountForm,
  mountFormWithUsage,
  selectForm,
  selectUsage,
  selectFormAndUsage,
  selectLetterType,
  selectEntity,
  findSelectTrigger,
  clickGetNumber,
} from "./surat-form-driver";
import { resolveUsageModuleKey } from "@/features/surat/registration/usages/usage-registry";
import { normalizeFormInputData } from "@/services/surat/form-helpers";
import suratFormSource from "@/components/surat/SuratForm.tsx?raw";
import usageRegistrySource from "@/features/surat/registration/usages/usage-registry.ts?raw";

const SECOND_UUID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";

function twoAssetUsagesSameForm() {
  const base = FORM_USAGES_RAW[0] as Record<string, unknown>;
  const steps = (base.form_usage_steps as Array<Record<string, unknown>>).map((s, i) => ({
    ...s,
    id: `bbbbbbbb-2222-4222-8222-00000000000${i + 1}`,
  }));
  return [
    { ...base, name: "Permohonan Aset Satu" },
    { ...base, id: SECOND_UUID, name: "Permohonan Aset Dua", form_usage_steps: steps },
  ];
}

beforeEach(() => {
  setupTestHarness();
  configureStandardMocks();
  allowServiceCalls(
    "getMasterData",
    "getActiveRegistrationDrafts",
    "generateNoSurat",
    "createRegistrationDraft",
  );
});

afterEach(() => {
  teardownTestHarness();
});

describe("SUR-01 form-first acceptance", () => {
  it("1-3. initial hanya Form; Kegunaan muncul setelah Form; lokasi setelah Kegunaan", async () => {
    await mountForm();
    expect(screen.getByText("Form PGD")).toBeInTheDocument();
    expect(screen.queryByText("Kegunaan")).not.toBeInTheDocument();
    expect(screen.queryByText(/Kantor Penerbit/i)).not.toBeInTheDocument();

    await selectForm();
    expect(screen.getByText("Kegunaan")).toBeInTheDocument();
    expect(screen.queryByText(/Kantor Penerbit/i)).not.toBeInTheDocument();

    await selectUsage();
    expect(screen.getByText(/Kantor Penerbit/i)).toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("4-5. kategori otomatis tanpa tombol klasifikasi manual", async () => {
    await mountForm();
    await selectFormAndUsage();
    await selectLetterType();
    await selectEntity();
    await clickGetNumber();

    const payload = serviceMock.generateNoSurat.mock.calls[0][0];
    expect(payload.form_input_data.request_category).toBe("asset");
    expect(screen.queryByText("Pengajuan Aset")).not.toBeInTheDocument();
    expect(screen.queryByText("Pengajuan SPK")).not.toBeInTheDocument();
    expect(screen.queryByText("Pengajuan Dana")).not.toBeInTheDocument();
    expect(screen.queryByText("Pengajuan Non Unit")).not.toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("6. Form/Kegunaan tidak auto-select pada flow normal", async () => {
    await mountForm();
    // FORM_USAGES_RAW hanya punya satu usage: tanpa auto-select,
    // Kegunaan tetap placeholder setelah Form dipilih.
    await selectForm();
    const usageTrigger = findSelectTrigger(/Kegunaan/i);
    expect(usageTrigger).toHaveTextContent(/Pilih kegunaan dan alur approval/i);
    expect(screen.queryByText(/Kantor Penerbit/i)).not.toBeInTheDocument();
    assertStrictServiceCalls();
  });

  it("7. kategori kosong fail closed dengan pesan aman", async () => {
    const bad = [{ ...(FORM_USAGES_RAW[0] as object), id: SECOND_UUID, request_category: undefined, request_categories: [] }];
    await mountFormWithUsage(bad as unknown[]);
    await selectForm();
    await selectUsage();

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Kegunaan Form Tidak Valid" })
    );
    // Usage ditolak: lokasi tidak tampil, nomor tidak bisa dibuat.
    expect(screen.queryByText(/Kantor Penerbit/i)).not.toBeInTheDocument();
    expect(serviceMock.generateNoSurat).not.toHaveBeenCalled();
  });

  it("8. handler tak dikenal fail closed", async () => {
    const bad = [{ ...(FORM_USAGES_RAW[0] as object), id: SECOND_UUID, request_category: "kegunaan_misterius" }];
    await mountFormWithUsage(bad as unknown[]);
    await selectForm();
    await selectUsage();

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Kegunaan Form Tidak Valid" })
    );
    expect(screen.queryByText(/Kantor Penerbit/i)).not.toBeInTheDocument();
    expect(serviceMock.generateNoSurat).not.toHaveBeenCalled();
  });

  it("9. tidak ada fallback non_unit di normalizeFormInputData", async () => {
    expect(normalizeFormInputData({})).not.toHaveProperty("request_category");
    expect(normalizeFormInputData({ request_mode: "unit" }).request_category).toBe("unit");
    expect(normalizeFormInputData({ is_aset: true }).request_category).toBe("asset");
  });

  it("10. ganti Form membersihkan seluruh state turunannya", async () => {
    await mountFormWithUsage(FORM_USAGES_RAW_WITH_DRAFT);
    await selectFormAndUsage(/Permohonan Aset/i);
    await selectLetterType();
    await selectEntity();
    expect(screen.getByText(/Kantor Penerbit/i)).toBeInTheDocument();

    await selectForm(/PERUBAHAN/i);

    // Kegunaan + lokasi + signer konteks lama bersih; nomor terkunci.
    const usageTrigger = findSelectTrigger(/Kegunaan/i);
    expect(usageTrigger).toHaveTextContent(/Pilih kegunaan dan alur approval/i);
    expect(screen.queryByText(/Kantor Penerbit/i)).not.toBeInTheDocument();
    const numberBtn = screen.getByRole("button", { name: /Dapatkan Nomor Surat/i });
    expect(numberBtn).toBeDisabled();
    expect(serviceMock.generateNoSurat).not.toHaveBeenCalled();
  });

  it("11. ganti Kegunaan membersihkan state modul sebelumnya", async () => {
    await mountFormWithUsage(twoAssetUsagesSameForm());
    await selectForm();
    await selectUsage(/Satu/i);

    const needButton = screen.getByRole("button", { name: /Butuh rekomendasi/i });
    await act(async () => { fireEvent.click(needButton); });
    expect(screen.getByRole("button", { name: /Butuh rekomendasi/i })).toHaveAttribute("aria-pressed", "true");

    await selectUsage(/Dua/i);

    // Cleanup modul lama: pilihan rekomendasi kembali default.
    expect(screen.getByRole("button", { name: /Tidak perlu rekomendasi/i })).toHaveAttribute("aria-pressed", "true");
    const usageTrigger = findSelectTrigger(/Kegunaan/i);
    expect(usageTrigger).toHaveTextContent(/Permohonan Aset Dua/i);
    expect(screen.getByText(/Kantor Penerbit/i)).toBeInTheDocument();
  });

  it("12. lokasi profil terkunci tampil read-only", async () => {
    await mountForm();
    await selectFormAndUsage();
    // Profil default role=user (non-admin): Kantor & Departemen terkunci
    // tapi tetap tampil sebagai informasi, bukan disembunyikan.
    const officeTrigger = findSelectTrigger(/Kantor Penerbit/i);
    expect(officeTrigger).toHaveTextContent(/Kantor Pusat/i);
    expect(officeTrigger).toBeDisabled();
    const deptTrigger = findSelectTrigger(/Departemen/i);
    expect(deptTrigger).toHaveTextContent(/Pengembangan Organisasi/i);
    expect(deptTrigger).toBeDisabled();
    expect(CURRENT_PROFILE_DEFAULT.role).toBe("user");
  });

  it("17. SuratForm hanya orchestrator: tanpa implementasi khusus modul", async () => {
    expect(suratFormSource).not.toContain("setRequestCategory");
    expect(suratFormSource).not.toContain("renderRequestClassificationStep");
    expect(suratFormSource).not.toContain("Pilih Jenis Pengajuan");
    expect(suratFormSource).not.toContain('"Pengajuan Aset"');
    expect(suratFormSource).not.toContain('"Pengajuan SPK"');
    expect(suratFormSource).not.toContain('"Pengajuan Dana"');
    expect(suratFormSource).not.toContain('"Pengajuan Non Unit"');
    // E: editor + state modul tidak boleh kembali ke orchestrator.
    expect(suratFormSource).not.toContain("FundSubmissionEditor");
    expect(suratFormSource).not.toContain("NonUnitRequestEditor");
    expect(suratFormSource).not.toContain("RecommendationMultiDetailEditor");
    expect(suratFormSource).not.toContain("NonAsetItemEditor");
    expect(suratFormSource).not.toContain("nonUnitOptions");
    expect(suratFormSource).not.toContain("nonUnitReloadKey");
    // State milik modul (useState + setter); properti input validator bersama
    // (fundWithoutProject:) tetap menjadi lem ke lib validasi.
    expect(suratFormSource).not.toContain("setFundWithoutProject");
    expect(suratFormSource).not.toContain("[fundWithoutProject");
    // F: tanpa any/double-cast/ts-ignore di orchestrator.
    expect(suratFormSource).not.toContain(" as any");
    expect(suratFormSource).not.toContain("@ts-ignore");
    expect(suratFormSource).not.toContain("@ts-nocheck");
    // A: validasi khusus modul tidak boleh diimpor/dipanggil orchestrator.
    expect(suratFormSource).not.toContain("validateFundSubmissionItems");
    expect(suratFormSource).not.toContain("validateNonUnitRows");
    // C: rekonsiliasi rekomendasi milik modul Aset.
    expect(suratFormSource).not.toContain("clearRecommendationInput");
    // D: kelayakan rekomendasi hanya dihitung modul Aset.
    expect(suratFormSource).not.toContain("canUseAssetRecommendation");
    expect(suratFormSource).not.toContain("canRequesterUseRecommendation");
    // E: tanpa hardcode default rekomendasi di applySelectedUsage.
    expect(suratFormSource).not.toContain("nextInput.requires_recommendation = false");
    expect(suratFormSource).not.toContain("requires_recommendation");
    expect(suratFormSource).not.toContain('usageData.category === "asset"');
    // B: tanpa flag mode kategori di orchestrator.
    expect(suratFormSource).not.toContain("isFundMode");
    expect(suratFormSource).not.toContain("isNonUnitMode");
    // A: tanpa fallback generic.
    expect(suratFormSource).not.toContain('registry.get("generic")');
    // Slot generik dipakai (bukan branch kategori).
    expect(suratFormSource).toContain("reconcileInputForContext");
    expect(suratFormSource).toContain("validateSubmit");
    expect(suratFormSource).toContain("buildSummaryFields");
    expect(suratFormSource).toContain("renderDetailsPanel");
    expect(suratFormSource).toContain("requiresMasterProjectMapping");
  });

  it("18. tidak ada dispatch berbasis UUID/nama", async () => {
    // Statis: resolver tidak menyentuh id/nama/label.
    expect(usageRegistrySource).not.toContain("usage.id");
    expect(usageRegistrySource).not.toContain("usage.name");
    expect(usageRegistrySource).not.toContain("nama_form");
    expect(usageRegistrySource).not.toContain("master_forms");
    // Dinamis: nama/UUID berbeda, kategori sama → modul sama.
    const base = FORM_USAGES_RAW[0] as unknown as Record<string, unknown>;
    const a = resolveUsageModuleKey({ ...base, id: UUID.form_usage, name: "Nama A" } as never);
    const b = resolveUsageModuleKey({ ...base, id: SECOND_UUID, name: "Nama B" } as never);
    expect(a).toBe("asset");
    expect(b).toBe("asset");
    // Ambigu (dua kategori) → fail closed.
    const ambiguous = resolveUsageModuleKey({
      ...base, request_category: undefined, request_categories: ["asset", "non_unit"],
    } as never);
    expect(ambiguous).toBeNull();
  });
});
