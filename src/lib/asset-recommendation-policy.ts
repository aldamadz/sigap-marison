type DepartmentIdentity = {
  code?: unknown;
  name?: unknown;
};

export function canUseAssetRecommendation(department: DepartmentIdentity | null | undefined): boolean {
  const code = String(department?.code || "").trim().toUpperCase();
  const name = String(department?.name || "").trim().toLocaleLowerCase("id-ID");
  return code === "PBO" || name === "pengembangan organisasi" || name === "po";
}
