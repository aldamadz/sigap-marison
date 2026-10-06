import { describe, expect, it } from "vitest";
import {
  validateSuratSubmit,
  type SuratSubmitValidationInput,
} from "@/features/surat/registration/lib/surat-submit-validation";

/** Factory: fully valid submit input */
function validSubmitInput(overrides: Partial<SuratSubmitValidationInput> = {}): SuratSubmitValidationInput {
  return {
    uploadingRequirement: false,
    uploadingRecommendationAttachment: false,
    generatedNoSurat: "SURAT-001",
    activeDraftId: "draft-123",
    requestPlace: "Jakarta",
    requestDate: "2026-09-02",
    missingInitialAttachmentLabels: [],

    requestCategory: null,
    hasUnitRequestFields: false,
    canCurrentDepartmentRequestUnit: false,
    requestedUnitCount: 0,
    requestedProjectCode: undefined,

    shouldUseDefaultBranchProject: false,
    isMarisonProjectReady: true,
    firstNonUnitError: undefined,

    fundWithoutProject: false,
    fundType: "",
    firstFundIssue: undefined,

    missingField: undefined,
    firstRecommendationError: undefined,

    signerAssignments: [{ user_id: "user-1" }],
    ...overrides,
  };
}

describe("surat-submit-validation — validateSuratSubmit", () => {
  // ── Global Checks ─────────────────────────────────────────────────────────

  it("1. rejects when upload is in progress", () => {
    const r1 = validateSuratSubmit(validSubmitInput({ uploadingRequirement: true }));
    expect(r1.valid).toBe(false);
    expect(r1.errorTitle).toBe("Upload Belum Selesai");

    const r2 = validateSuratSubmit(validSubmitInput({ uploadingRecommendationAttachment: true }));
    expect(r2.valid).toBe(false);
    expect(r2.errorTitle).toBe("Upload Belum Selesai");
  });

  it("2. rejects when number is missing", () => {
    const r = validateSuratSubmit(validSubmitInput({ generatedNoSurat: undefined }));
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Nomor Surat Belum Siap");
  });

  it("3. rejects when draft id is missing", () => {
    const r = validateSuratSubmit(validSubmitInput({ activeDraftId: undefined }));
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Nomor Surat Belum Siap");
  });

  it("4. rejects when place is empty", () => {
    const r = validateSuratSubmit(validSubmitInput({ requestPlace: "   " }));
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Tempat Wajib Diisi");
  });

  it("5. rejects when date is empty", () => {
    const r = validateSuratSubmit(validSubmitInput({ requestDate: undefined }));
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Tanggal Wajib Diisi");
  });

  it("6. rejects when attachments are missing", () => {
    const r = validateSuratSubmit(validSubmitInput({ missingInitialAttachmentLabels: ["KTP", "NPWP"] }));
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Lampiran Wajib");
    expect(r.errorDescription).toBe("Lengkapi: KTP, NPWP.");
  });

  // ── Unit Checks ───────────────────────────────────────────────────────────

  it("7. unit mode: rejects invalid matrix", () => {
    const r = validateSuratSubmit(validSubmitInput({ requestCategory: "unit", hasUnitRequestFields: false }));
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Matrix Unit Tidak Valid");
  });

  it("8. unit mode: rejects invalid department", () => {
    const r = validateSuratSubmit(
      validSubmitInput({ requestCategory: "unit", hasUnitRequestFields: true, canCurrentDepartmentRequestUnit: false }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Mode Unit Tidak Diizinkan");
  });

  it("9. unit mode: rejects without project", () => {
    const r = validateSuratSubmit(
      validSubmitInput({
        requestCategory: "unit",
        hasUnitRequestFields: true,
        canCurrentDepartmentRequestUnit: true,
        requestedProjectCode: undefined,
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Proyek Wajib Dipilih");
  });

  it("10. unit mode: rejects missing or zero unit count", () => {
    const r = validateSuratSubmit(
      validSubmitInput({
        requestCategory: "unit",
        hasUnitRequestFields: true,
        canCurrentDepartmentRequestUnit: true,
        requestedProjectCode: "PRJ-1",
        requestedUnitCount: 0,
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Jumlah Unit Wajib Diisi");
  });

  // ── Non Unit Checks ───────────────────────────────────────────────────────

  it("11. non unit mode: rejects when marison not ready", () => {
    const r = validateSuratSubmit(
      validSubmitInput({
        requestCategory: "non_unit",
        shouldUseDefaultBranchProject: false,
        isMarisonProjectReady: false,
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Proyek Belum Terhubung");
  });

  it("12. non unit mode: rejects on row error", () => {
    const r = validateSuratSubmit(
      validSubmitInput({
        requestCategory: "non_unit",
        shouldUseDefaultBranchProject: false,
        isMarisonProjectReady: true,
        firstNonUnitError: "Item 1 price invalid",
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Data Non Unit Belum Lengkap");
    expect(r.errorDescription).toBe("Item 1 price invalid");
  });

  it("13. non unit mode: allows row error if using default branch project", () => {
    // Original behavior check: if `!shouldUseDefaultBranchProject` is false, it skips the check entirely
    const r = validateSuratSubmit(
      validSubmitInput({
        requestCategory: "non_unit",
        shouldUseDefaultBranchProject: true, // Bypass non-unit checks
        firstNonUnitError: "Ignored row error",
      }),
    );
    expect(r.valid).toBe(true);
  });

  // ── Fund Checks ───────────────────────────────────────────────────────────

  it("14. fund mode: rejects when marison not ready (and not fund without project)", () => {
    const r = validateSuratSubmit(
      validSubmitInput({
        requestCategory: "non_asset",
        fundWithoutProject: false,
        isMarisonProjectReady: false,
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Proyek Belum Terhubung");
  });

  it("accepts marketing_cost on final registration", () => {
    expect(validateSuratSubmit(validSubmitInput({ requestCategory: "non_asset", fundWithoutProject: true,
      fundType: "marketing_cost" })).valid).toBe(true);
  });

  it("15. fund mode: rejects invalid fund type", () => {
    const r = validateSuratSubmit(
      validSubmitInput({
        requestCategory: "non_asset",
        fundWithoutProject: true, // passes marison check
        fundType: "invalid-type",
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Jenis Pengajuan Dana Wajib Dipilih");
  });

  it("16. fund mode: rejects on row issue", () => {
    const r = validateSuratSubmit(
      validSubmitInput({
        requestCategory: "non_asset",
        fundWithoutProject: true,
        fundType: "operational",
        firstFundIssue: "Missing amount",
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Rincian Dana Belum Lengkap");
    expect(r.errorDescription).toBe("Missing amount");
  });

  // ── Manual Input Fields & Recommendation ──────────────────────────────────

  it("17. manual fields: rejects generic missing field", () => {
    const r = validateSuratSubmit(
      validSubmitInput({
        missingField: { key: "some_field", label: "Some Field" },
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Input Belum Lengkap");
    expect(r.errorDescription).toBe("Some Field wajib diisi.");
  });

  it("18. manual fields: rejects missing recommendation items with explicit error", () => {
    const r = validateSuratSubmit(
      validSubmitInput({
        missingField: { key: "recommendation_items", label: "Item Rekomendasi" },
        firstRecommendationError: "Location missing",
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Daftar Rekomendasi Belum Lengkap");
    expect(r.errorDescription).toBe("Location missing");
  });

  it("19. manual fields: rejects missing recommendation items with fallback error", () => {
    const r = validateSuratSubmit(
      validSubmitInput({
        missingField: { key: "recommendation_items", label: "Item Rekomendasi" },
        firstRecommendationError: undefined,
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Daftar Rekomendasi Belum Lengkap");
    expect(r.errorDescription).toBe("Item Rekomendasi wajib diisi.");
  });

  // ── Signers ───────────────────────────────────────────────────────────────

  it("20. signers: rejects incomplete signer", () => {
    const r = validateSuratSubmit(
      validSubmitInput({
        signerAssignments: [{ user_id: "user-1" }, { user_id: undefined }],
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errorTitle).toBe("Pejabat Belum Lengkap");
  });

  // ── Success ───────────────────────────────────────────────────────────────

  it("21. fully valid input passes", () => {
    const r = validateSuratSubmit(validSubmitInput());
    expect(r.valid).toBe(true);
    expect(r.errorTitle).toBeUndefined();
    expect(r.errorDescription).toBeUndefined();
  });
});
