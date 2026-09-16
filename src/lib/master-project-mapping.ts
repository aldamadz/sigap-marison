export type ManualProjectMappingInput = {
  projectId: string;
  projectCode: string;
};

export type ManualProjectMapping = {
  marison_project_id: number | null;
  marison_project_code: string | null;
};

export type ExistingMarisonProject = {
  id: string;
  name: string;
  marison_project_code: string | null;
  marison_synced_at: string | null;
  marison_review_required: boolean | null;
  master_offices: {
    marison_branch_id: number | null;
    marison_synced_at: string | null;
    marison_review_required: boolean | null;
  } | null;
};

export const planManualProjectMapping = (
  requested: ManualProjectMapping,
  existing: ExistingMarisonProject | null,
  sourceBranchId: number | null,
): { projectMapping: ManualProjectMapping; targetRecordId: string | null } => {
  if (!existing) return { projectMapping: requested, targetRecordId: null };

  if (
    !existing.marison_synced_at || existing.marison_review_required
    || !existing.master_offices?.marison_synced_at
    || existing.master_offices.marison_review_required
    || !existing.master_offices.marison_branch_id
  ) {
    throw new Error(`Proyek ${existing.name} belum tervalidasi dari Marison. Selesaikan review/sinkronisasi sebelum memakai ID ini bersama.`);
  }
  if (!sourceBranchId || sourceBranchId !== existing.master_offices.marison_branch_id) {
    throw new Error("Kantor proyek belum memakai branch Marison yang sama. Lengkapi mapping kantor terlebih dahulu.");
  }
  if (
    requested.marison_project_code
    && requested.marison_project_code !== existing.marison_project_code?.trim().toUpperCase()
  ) {
    throw new Error(`Kode Proyek Marison harus sama dengan proyek ${existing.name}, atau kosongkan kolom kode.`);
  }

  return {
    projectMapping: { marison_project_id: null, marison_project_code: null },
    targetRecordId: existing.id,
  };
};

export const normalizeManualProjectMapping = (
  input: ManualProjectMappingInput,
): ManualProjectMapping => {
  const projectId = input.projectId.trim();
  const projectCode = input.projectCode.trim().toUpperCase();

  if (!projectId) {
    if (projectCode) {
      throw new Error("Isi ID Proyek Marison sebelum mengisi kode external.");
    }
    return {
      marison_project_id: null,
      marison_project_code: null,
    };
  }

  const parsedProjectId = Number(projectId);
  if (!Number.isSafeInteger(parsedProjectId) || parsedProjectId <= 0) {
    throw new Error("ID Proyek Marison harus berupa angka bulat lebih dari 0.");
  }

  return {
    marison_project_id: parsedProjectId,
    marison_project_code: projectCode || null,
  };
};
