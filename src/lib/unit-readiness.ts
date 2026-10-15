export const unitReadinessIssue = (requested: number, allocated: number, note: string): string | null => {
  if (!Number.isSafeInteger(requested) || requested < 1) return "Jumlah unit pengajuan tidak valid.";
  if (!Number.isSafeInteger(allocated) || allocated < 1) return "Pilih minimal 1 unit.";
  if (allocated > requested) return `Pilih maksimal ${requested} unit sesuai permintaan.`;
  if (allocated < requested && note.trim().length < 5) {
    return "Catatan minimal 5 karakter wajib diisi untuk alokasi unit kurang dari permintaan.";
  }
  if (note.length > 2000) return "Catatan pemeriksaan maksimal 2000 karakter.";
  return null;
};
