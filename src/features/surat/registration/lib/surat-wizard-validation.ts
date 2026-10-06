/**
 * Pure validation for wizard step transitions.
 *
 * Pass J2B — extracted from SuratForm.tsx handleGetNumber pre-flight checks.
 * No React hooks, no toast, no fetch, no side effects.
 */

import { isFundSubmissionType, usesFundSubmissionType } from "../usages/fund/fund-types";

type RequestCategory = "asset" | "unit" | "non_unit" | "non_asset";

// ── Input snapshot ──────────────────────────────────────────────────────────

export interface Step1ValidationInput {
  profileLocationReady: boolean;
  requestCategory: RequestCategory | null;
  selectedUsageId: string | null;
  filteredUsageCount: number;
  /** Only relevant when requestCategory === "unit" */
  unitProjectCode: string | undefined;
  /** Only relevant when requestCategory === "unit" */
  unitCount: number;
  branchHasRegisteredProjects: boolean;
  projectId: string;
  /** True if the branch office has no registered projects and fallback applies */
  shouldUseDefaultBranchProject: boolean;
  isMarisonProjectReady: boolean;
  fundWithoutProject: boolean;
  fundType: string;
  formNumber?: string | null;
}

// ── Result ──────────────────────────────────────────────────────────────────

export interface WizardValidationResult {
  valid: boolean;
  errorTitle?: string;
  errorDescription?: string;
}

const ok: WizardValidationResult = { valid: true };

function fail(title: string, description?: string): WizardValidationResult {
  return { valid: false, errorTitle: title, errorDescription: description };
}

// ── Step 1 pre-flight ───────────────────────────────────────────────────────
// Order matches original handleGetNumber exactly (lines 1730-1809 at Pass J2A).

export function validateStep1ForNumberGeneration(
  input: Step1ValidationInput,
): WizardValidationResult {
  if (!input.profileLocationReady) {
    return fail(
      "Profil Sedang Diselaraskan",
      "Tunggu hingga kantor dan departemen pengajuan sesuai dengan profil Anda.",
    );
  }
  if (!input.requestCategory) {
    return fail(
      "Konfigurasi Kegunaan Belum Valid",
      "Kegunaan yang dipilih belum menentukan klasifikasi pengajuan. Hubungi administrator.",
    );
  }
  if (!input.selectedUsageId) {
    return fail(
      "Kegunaan Form Belum Dipilih",
      "Pilih form dan kegunaan sebelum mendapatkan nomor surat.",
    );
  }
  if (input.filteredUsageCount === 0) {
    return fail(
      "Matrix Belum Tersedia",
      "Belum ada matrix yang mendukung klasifikasi, kantor, dan departemen yang dipilih.",
    );
  }

  const cat = input.requestCategory;

  // ── Unit ──────────────────────────────────────────────────────────────
  if (cat === "unit") {
    if (!input.unitProjectCode) {
      return fail("Proyek Unit Wajib Dipilih");
    }
    if (!Number.isFinite(input.unitCount) || input.unitCount < 1) {
      return fail("Jumlah Unit Wajib Diisi", "Jumlah unit minimal 1.");
    }
  } else if (
    input.branchHasRegisteredProjects &&
    !input.projectId &&
    cat !== "non_unit" &&
    !(cat === "non_asset" && input.fundWithoutProject)
  ) {
    return fail(
      "Proyek Cabang Belum Dipilih",
      "Kantor cabang ini memiliki proyek, jadi pilih proyek cabang terlebih dahulu.",
    );
  }

  // ── Non Unit ──────────────────────────────────────────────────────────
  if (cat === "non_unit" && !input.shouldUseDefaultBranchProject && !input.projectId) {
    return fail(
      "Proyek Tujuan Wajib Dipilih",
      "Pilih proyek yang sudah terhubung ke Marison untuk melanjutkan pengajuan Non Unit.",
    );
  }
  if (cat === "non_unit" && !input.shouldUseDefaultBranchProject && !input.isMarisonProjectReady) {
    return fail(
      "Proyek Belum Terhubung",
      "Mapping proyek atau kantor proyek belum lengkap. Minta admin meninjau Master Proyek.",
    );
  }

  // ── Non Aset (fund) ──────────────────────────────────────────────────
  if (cat === "non_asset" && !input.fundWithoutProject && !input.projectId) {
    return fail(
      "Proyek Tujuan Wajib Dipilih",
      "Pilih proyek yang siap Marison atau centang 'Tanpa Proyek (Dana Umum)' untuk pengajuan dana tanpa proyek.",
    );
  }
  if (cat === "non_asset" && !input.fundWithoutProject && !input.isMarisonProjectReady) {
    return fail(
      "Proyek Belum Terhubung",
      "Pilih proyek yang memiliki ID proyek dan kantor external yang valid.",
    );
  }
  if (
    cat === "non_asset" &&
    usesFundSubmissionType({ nomor_form: input.formNumber }) &&
    !isFundSubmissionType(input.fundType)
  ) {
    return fail(
      "Jenis Pengajuan Dana Wajib Dipilih",
      "Pilih Biaya Operasional, Biaya Produksi, atau Biaya Marketing.",
    );
  }

  return ok;
}
