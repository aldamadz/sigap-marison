export function verifiedUnitTitle(title: unknown, count: number): string {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("Jumlah Unit terverifikasi tidak valid.");
  const text = typeof title === "string" ? title.trim() : "";
  if (!text) return `Pengajuan SPK Unit: ${count} Unit`;
  return /\b[0-9]+\s+Unit\b/i.test(text)
    ? text.replace(/\b[0-9]+\s+Unit\b/i, `${count} Unit`)
    : `${text} (${count} Unit)`;
}

export function verifiedUnitDescription(
  title: unknown, count: number, requested: unknown, requesterNote: unknown, review: unknown,
): string {
  const sections = [verifiedUnitTitle(title, count)];
  const requestedCount = Number(requested);
  if (Number.isSafeInteger(requestedCount) && requestedCount >= count) {
    sections.push(`Diajukan: ${requestedCount} unit; siap bangun: ${count} unit; belum dipenuhi: ${requestedCount - count} unit.`);
  }
  if (typeof requesterNote === "string" && requesterNote.trim()) {
    sections.push(`Catatan pemohon:\n${requesterNote.trim()}`);
  }
  // This object comes only from get_verified_unit_allocation, never caller JSON.
  const receipt = review && typeof review === "object" ? review as Record<string, unknown> : {};
  if (typeof receipt.note === "string" && receipt.note.trim()) {
    const name = typeof receipt.actor_name === "string" ? receipt.actor_name.trim() : "";
    sections.push(`Catatan pemeriksa${name ? ` (${name})` : ""}:\n${receipt.note.trim()}`);
  }
  return sections.join("\n\n");
}
