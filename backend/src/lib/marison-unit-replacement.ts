type UnitReference = { id: number; type: string; hasSubmitted: unknown };

export const verifiedUnitReplacementReceipt = (projectId: number, references: UnitReference[]) => {
  if (!Number.isSafeInteger(projectId) || projectId < 1 || references.length < 1
    || new Set(references.map((unit) => unit.id)).size !== references.length) {
    throw Object.assign(new Error("Referensi proyek/kavling pengiriman pengganti tidak valid."), { status: 422 });
  }
  for (const unit of references) {
    if (!Number.isSafeInteger(unit.id) || unit.id < 1 || !unit.type.trim()
      || unit.type.length > 100 || unit.hasSubmitted !== false) {
      throw Object.assign(new Error("Kavling sudah dikirim atau status pengirimannya belum dapat dipastikan dari Marison."), { status: 422 });
    }
  }
  return {
    project_id: projectId,
    observed_at: new Date().toISOString(),
    units: references.map((unit) => ({ unit_id: unit.id, type: unit.type, has_submitted: false })),
  };
};
