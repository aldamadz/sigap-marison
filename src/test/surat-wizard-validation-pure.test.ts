import { describe, expect, it } from "vitest";
import {
  validateStep1ForNumberGeneration,
  type Step1ValidationInput,
} from "@/features/surat/registration/lib/surat-wizard-validation";

/** Factory: fully valid step-1 input for "asset" category. */
function validAssetInput(overrides: Partial<Step1ValidationInput> = {}): Step1ValidationInput {
  return {
    profileLocationReady: true,
    requestCategory: "asset",
    selectedUsageId: "usage-1",
    filteredUsageCount: 3,
    unitProjectCode: undefined,
    unitCount: 0,
    branchHasRegisteredProjects: false,
    projectId: "",
    shouldUseDefaultBranchProject: false,
    isMarisonProjectReady: false,
    fundWithoutProject: false,
    fundType: "",
    formNumber: "FM-UAI.PGD-01-00",
    ...overrides,
  };
}

describe("surat-wizard-validation — validateStep1ForNumberGeneration", () => {
  it.each(["FM-UAI.KEU-01-00", "FM-UAI.KEU-10-00", "FM-MBN.KEU-10-00"])("does not require a fund type for KEU %s", (formNumber) => {
    const input = validAssetInput({ requestCategory: "non_asset", formNumber, fundType: "", projectId: "project", isMarisonProjectReady: true });
    expect(validateStep1ForNumberGeneration(input).valid).toBe(true);
    expect(validateStep1ForNumberGeneration({ ...input, formNumber: "FM-UAI.PGD-01-00" }).errorTitle).toBe("Jenis Pengajuan Dana Wajib Dipilih");
    expect(validateStep1ForNumberGeneration({ ...input, projectId: "" }).valid).toBe(false);
  });
  // ── Common gates ──────────────────────────────────────────────────────────

  it("1. rejects when profile location not ready", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({ profileLocationReady: false }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Profil Sedang Diselaraskan");
  });

  it("2. rejects when no request category", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({ requestCategory: null }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Konfigurasi Kegunaan Belum Valid");
  });

  it("3. rejects when no usage selected", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({ selectedUsageId: null }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Kegunaan Form Belum Dipilih");
  });

  it("4. rejects when filteredUsage is empty", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({ filteredUsageCount: 0 }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Matrix Belum Tersedia");
  });

  // ── Unit category ─────────────────────────────────────────────────────────

  it("5. unit: rejects without project code", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({
        requestCategory: "unit",
        unitProjectCode: undefined,
        unitCount: 5,
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Proyek Unit Wajib Dipilih");
  });

  it("6. unit: rejects with count < 1", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({
        requestCategory: "unit",
        unitProjectCode: "PRJ001",
        unitCount: 0,
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Jumlah Unit Wajib Diisi");
    expect(r.errorDescription).toBe("Jumlah unit minimal 1.");
  });

  it("7. unit: valid with project code and count >= 1", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({
        requestCategory: "unit",
        unitProjectCode: "PRJ001",
        unitCount: 3,
      }),
    );
    expect(r.valid).toBe(true);
  });

  // ── Branch project gate (non-unit, non-non_unit) ──────────────────────────

  it("8. asset at branch with projects but none selected", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({
        branchHasRegisteredProjects: true,
        projectId: "",
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Proyek Cabang Belum Dipilih");
  });

  it("9. asset at branch with project selected passes", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({
        branchHasRegisteredProjects: true,
        projectId: "proj-123",
      }),
    );
    expect(r.valid).toBe(true);
  });

  // ── Non Unit category ─────────────────────────────────────────────────────

  it("10. non_unit: rejects without project when default not used", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({
        requestCategory: "non_unit",
        shouldUseDefaultBranchProject: false,
        projectId: "",
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Proyek Tujuan Wajib Dipilih");
  });

  it("11. non_unit: rejects when Marison mapping not ready", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({
        requestCategory: "non_unit",
        shouldUseDefaultBranchProject: false,
        projectId: "proj-1",
        isMarisonProjectReady: false,
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Proyek Belum Terhubung");
  });

  it("12. non_unit: passes when project ready", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({
        requestCategory: "non_unit",
        shouldUseDefaultBranchProject: false,
        projectId: "proj-1",
        isMarisonProjectReady: true,
      }),
    );
    expect(r.valid).toBe(true);
  });

  it("13. non_unit: passes with default branch project fallback", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({
        requestCategory: "non_unit",
        shouldUseDefaultBranchProject: true,
        projectId: "",
        isMarisonProjectReady: false,
      }),
    );
    expect(r.valid).toBe(true);
  });

  // ── Non Aset (fund) category ──────────────────────────────────────────────

  it("14. non_asset: rejects without project and no fundWithoutProject", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({
        requestCategory: "non_asset",
        fundWithoutProject: false,
        projectId: "",
        fundType: "operational",
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Proyek Tujuan Wajib Dipilih");
  });

  it("15. non_asset: rejects when Marison not ready without fundWithoutProject", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({
        requestCategory: "non_asset",
        fundWithoutProject: false,
        projectId: "proj-1",
        isMarisonProjectReady: false,
        fundType: "operational",
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Proyek Belum Terhubung");
  });

  it("16. non_asset: rejects without fund_type", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({
        requestCategory: "non_asset",
        fundWithoutProject: true,
        projectId: "",
        fundType: "",
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Jenis Pengajuan Dana Wajib Dipilih");
  });

  it("17. non_asset: passes with fundWithoutProject + valid fund_type", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({
        requestCategory: "non_asset",
        fundWithoutProject: true,
        projectId: "",
        fundType: "operational",
      }),
    );
    expect(r.valid).toBe(true);
  });

  it("17a. branch fund without project remains valid when the office has projects", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({
        requestCategory: "non_asset",
        branchHasRegisteredProjects: true,
        fundWithoutProject: true,
        projectId: "",
        fundType: "operational",
      }),
    );
    expect(r.valid).toBe(true);
  });

  it("17b. branch fund still requires a project when without-project is false", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({
        requestCategory: "non_asset",
        branchHasRegisteredProjects: true,
        fundWithoutProject: false,
        projectId: "",
        fundType: "operational",
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Proyek Cabang Belum Dipilih");
  });

  it("accepts marketing_cost when generating a fund number", () => {
    expect(validateStep1ForNumberGeneration(validAssetInput({ requestCategory: "non_asset", fundWithoutProject: false,
      projectId: "proj-1", isMarisonProjectReady: true, fundType: "marketing_cost" })).valid).toBe(true);
  });

  it("18. non_asset: passes with project ready + production_cost", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({
        requestCategory: "non_asset",
        fundWithoutProject: false,
        projectId: "proj-1",
        isMarisonProjectReady: true,
        fundType: "production_cost",
      }),
    );
    expect(r.valid).toBe(true);
  });

  // ── Priority: first error wins ────────────────────────────────────────────

  it("19. profileLocationReady is checked before requestCategory", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({
        profileLocationReady: false,
        requestCategory: null,
      }),
    );
    expect(r.errorTitle).toBe("Profil Sedang Diselaraskan");
  });

  it("20. requestCategory is checked before selectedUsage", () => {
    const r = validateStep1ForNumberGeneration(
      validAssetInput({
        requestCategory: null,
        selectedUsageId: null,
      }),
    );
    expect(r.errorTitle).toBe("Konfigurasi Kegunaan Belum Valid");
  });

  // ── Fully valid asset ─────────────────────────────────────────────────────

  it("21. asset: fully valid input passes", () => {
    const r = validateStep1ForNumberGeneration(validAssetInput());
    expect(r.valid).toBe(true);
    expect(r.errorTitle).toBeUndefined();
    expect(r.errorDescription).toBeUndefined();
  });
});
