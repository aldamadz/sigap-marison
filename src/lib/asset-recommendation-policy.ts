type DepartmentIdentity = {
  code?: unknown;
  name?: unknown;
};

export function canUseAssetRecommendation(department: DepartmentIdentity | null | undefined): boolean {
  void department;
  return true;
}
