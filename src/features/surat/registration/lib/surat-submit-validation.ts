/**
 * Pure validation for final submission.
 *
 * Pass K1 — extracted from SuratForm.tsx validateRegistration.
 * No React hooks, no toast, no fetch, no side effects.
 */

export interface SignerAssignmentSnapshot {
  user_id?: string;
}

export interface MissingFieldSnapshot {
  key: string;
  label: string;
}

export type RequestCategory = "asset" | "unit" | "non_unit" | "non_asset";

export interface SuratSubmitValidationInput {
  uploadingRequirement: boolean;
  uploadingRecommendationAttachment: boolean;
  generatedNoSurat?: string;
  activeDraftId?: string;
  requestPlace: string;
  requestDate?: string;
  missingInitialAttachmentLabels: string[];

  /** Kategori canonical; mode turunan dihitung di dalam lib, bukan oleh pemanggil. */
  requestCategory: RequestCategory | null;

  // Unit mode
  hasUnitRequestFields: boolean;
  canCurrentDepartmentRequestUnit: boolean;
  requestedUnitCount: number;
  requestedProjectCode?: string;

  // Non Unit mode
  shouldUseDefaultBranchProject: boolean;
  isMarisonProjectReady: boolean;
  firstNonUnitError?: string;

  // Non Aset (Fund) mode
  fundWithoutProject: boolean;
  fundType: string;
  firstFundIssue?: string;

  // Manual fields & Recommendation
  missingField?: MissingFieldSnapshot;
  firstRecommendationError?: string;

  // Signers
  signerAssignments: SignerAssignmentSnapshot[];
}

export interface SuratSubmitValidationResult {
  valid: boolean;
  errorTitle?: string;
  errorDescription?: string;
}

const ok: SuratSubmitValidationResult = { valid: true };
function fail(title: string, description?: string): SuratSubmitValidationResult {
  return { valid: false, errorTitle: title, errorDescription: description };
}

// ── Final submit validation ──────────────────────────────────────────────────
// Order matches original validateRegistration exactly (lines 1972-2085 at Pass K1 base).

export function validateSuratSubmit(input: SuratSubmitValidationInput): SuratSubmitValidationResult {
  const isUnitMode = input.requestCategory === "unit";
  const isNonUnitMode = input.requestCategory === "non_unit";
  const isFundMode = input.requestCategory === "non_asset";

  if (input.uploadingRequirement || input.uploadingRecommendationAttachment) {
    return fail("Upload Belum Selesai", "Tunggu sampai seluruh lampiran selesai disimpan.");
  }
  if (!input.generatedNoSurat || !input.activeDraftId) {
    return fail("Nomor Surat Belum Siap", "Pesan nomor surat terlebih dahulu.");
  }
  if (!input.requestPlace.trim()) {
    return fail("Tempat Wajib Diisi");
  }
  if (!input.requestDate) {
    return fail("Tanggal Wajib Diisi");
  }
  if (input.missingInitialAttachmentLabels.length > 0) {
    return fail("Lampiran Wajib", `Lengkapi: ${input.missingInitialAttachmentLabels.join(", ")}.`);
  }

  // ── Unit ──────────────────────────────────────────────────────────────
  if (isUnitMode) {
    if (!input.hasUnitRequestFields) {
      return fail("Matrix Unit Tidak Valid", "Pilih matrix/template yang mendukung permohonan unit.");
    }
    if (!input.canCurrentDepartmentRequestUnit) {
      return fail("Mode Unit Tidak Diizinkan", "Departemen ini tidak termasuk konfigurasi pengaju unit.");
    }
    if (!input.requestedProjectCode) {
      return fail("Proyek Wajib Dipilih", "Pilih proyek untuk permohonan unit.");
    }
    if (!Number.isFinite(input.requestedUnitCount) || input.requestedUnitCount < 1) {
      return fail("Jumlah Unit Wajib Diisi", "Jumlah unit minimal 1.");
    }
  }

  // ── Non Unit ──────────────────────────────────────────────────────────
  if (isNonUnitMode && !input.shouldUseDefaultBranchProject) {
    if (!input.isMarisonProjectReady) {
      return fail(
        "Proyek Belum Terhubung",
        "Pilih proyek yang memiliki ID proyek dan cabang Marison sebelum mendaftarkan Non Unit.",
      );
    }
    if (input.firstNonUnitError) {
      return fail("Data Non Unit Belum Lengkap", input.firstNonUnitError);
    }
  }

  // ── Non Aset (fund) ──────────────────────────────────────────────────
  if (isFundMode) {
    if (!input.fundWithoutProject && !input.isMarisonProjectReady) {
      return fail(
        "Proyek Belum Terhubung",
        "Pilih proyek yang siap Marison atau centang 'Tanpa Proyek (Dana Umum)' untuk pengajuan dana tanpa proyek.",
      );
    }
    if (!["operational", "production_cost"].includes(input.fundType)) {
      return fail("Jenis Pengajuan Dana Wajib Dipilih", "Pilih Biaya Operasional atau Biaya Produksi.");
    }
    if (input.firstFundIssue) {
      return fail("Rincian Dana Belum Lengkap", input.firstFundIssue);
    }
  }

  // ── Manual input fields ───────────────────────────────────────────────
  if (input.missingField) {
    if (input.missingField.key === "recommendation_items") {
      return fail(
        "Daftar Rekomendasi Belum Lengkap",
        input.firstRecommendationError || `${input.missingField.label} wajib diisi.`,
      );
    }
    return fail("Input Belum Lengkap", `${input.missingField.label} wajib diisi.`);
  }

  // ── Signers ───────────────────────────────────────────────────────────
  if (input.signerAssignments.some(s => !s.user_id)) {
    return fail("Pejabat Belum Lengkap");
  }

  return ok;
}
