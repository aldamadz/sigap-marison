export type ManualProjectMappingInput = {
  projectId: string;
  projectCode: string;
};

export type ManualProjectMapping = {
  marison_project_id: number | null;
  marison_project_code: string | null;
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
