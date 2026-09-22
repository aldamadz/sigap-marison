/**
 * Kapasitas unit Marison per proyek (fail-closed).
 *
 * `count === null` = belum ada hasil lookup yang sukses. UI tidak boleh
 * menganggap null/kosong sebagai "0 unit yang valid" maupun "bebas mengajukan".
 */

export type UnitAvailabilityState = {
  loading: boolean;
  /** null = lookup belum selesai/gagal; selain itu hasil aktual Marison. */
  count: number | null;
  error: string | null;
};

export const EMPTY_UNIT_AVAILABILITY: UnitAvailabilityState = {
  loading: false,
  count: null,
  error: null,
};

export type UnitAvailabilityIssue = {
  title: string;
  description?: string;
};

/**
 * Semua kondisi di sini memblokir pembuatan nomor/submit. Tidak ada jalur
 * "tetap lanjut" untuk lookup gagal, loading, nol, atau permintaan melebihi
 * kapasitas aktual yang sudah termuat.
 */
export function unitAvailabilityIssues(
  state: UnitAvailabilityState | null,
  requestedCount: number,
): UnitAvailabilityIssue[] {
  const availability = state ?? EMPTY_UNIT_AVAILABILITY;

  if (availability.loading) {
    return [{
      title: "Kapasitas Unit Sedang Dimuat",
      description: "Tunggu sampai jumlah unit tersedia untuk proyek ini selesai dimuat.",
    }];
  }
  if (availability.error || availability.count === null) {
    return [{
      title: "Kapasitas Unit Belum Termuat",
      description: availability.error || "Gagal memastikan jumlah unit tersedia untuk proyek ini.",
    }];
  }
  if (availability.count === 0) {
    return [{
      title: "Proyek Belum Punya Unit Tersedia",
      description: "Pilih proyek lain atau hubungi perencanaan sebelum mengajukan SPK Unit.",
    }];
  }
  if (!Number.isFinite(requestedCount) || requestedCount < 1) {
    return [{
      title: "Jumlah Unit Wajib Diisi",
      description: "Jumlah unit minimal 1 dan tidak boleh melebihi kapasitas proyek.",
    }];
  }
  if (requestedCount > availability.count) {
    return [{
      title: "Jumlah Melebihi Kapasitas",
      description: `Kapasitas tersedia ${availability.count} unit, jumlah diajukan ${requestedCount} unit.`,
    }];
  }
  return [];
}
