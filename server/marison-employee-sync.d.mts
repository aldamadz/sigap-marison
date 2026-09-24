export type MarisonEmployee = Record<string, unknown> & {
  id?: number;
  user_id?: number;
  nik?: string | null;
  name?: string | null;
};
export type MarisonProject = Record<string, unknown> & {
  id?: number;
  code?: string | null;
  name?: string | null;
  branch?: Record<string, unknown> | null;
};

export function normalizeMarisonName(value: unknown): string;
export function normalizeMarisonNik(value: unknown): string;
export function marisonNikKey(value: unknown): string;
export function canUseMarisonNameFallback(
  employee: { name?: unknown; nik?: unknown },
  profile: { full_name?: unknown; nik?: unknown },
): boolean;
export function buildMarisonStagingEmail(employee: MarisonEmployee, duplicateName?: boolean): string;
export function deriveMarisonOfficeType(branch: Record<string, unknown>): "Pusat" | "KC" | "KCP" | "Kost";
export function resolveMarisonDepartment(
  division: unknown,
  office?: Record<string, unknown> | null,
): { name: string; code: string; deptIndex: number } | null;
export function resolveMarisonEmployeeActive(status: unknown, fallback?: boolean): boolean;
export function deduplicateMarisonEmployees(rows: MarisonEmployee[], options?: { knownNames?: string[] }): {
  employees: MarisonEmployee[];
  missingNik: MarisonEmployee[];
  conflictingNik: Array<{ nik: string; names: string[]; externalIds: number[] }>;
  mergedDuplicates: Array<{ nik: string; name: string; merged: number }>;
  resolvedConflicts: Array<{ nik: string; selectedName: string; ignoredNames: string[] }>;
};
export function previewMarisonBranchSync(options: {
  supabase: unknown;
  branches: Array<Record<string, unknown>>;
  environment?: "staging" | "production";
}): Promise<Record<string, unknown>>;
export function executeMarisonBranchSync(options: {
  supabase: unknown;
  branches: Array<Record<string, unknown>>;
  environment?: "staging" | "production";
}): Promise<Record<string, unknown>>;
export function previewMarisonProjectSync(options: {
  supabase: unknown;
  projects: MarisonProject[];
  branches: Array<Record<string, unknown>>;
  environment?: "staging" | "production";
}): Promise<Record<string, unknown>>;
export function executeMarisonProjectSync(options: {
  supabase: unknown;
  projects: MarisonProject[];
  branches: Array<Record<string, unknown>>;
  environment?: "staging" | "production";
}): Promise<Record<string, unknown>>;
export function previewMarisonEmployeeSync(options: {
  supabase: unknown;
  employees: MarisonEmployee[];
  branches: Array<Record<string, unknown>>;
  environment?: "staging" | "production";
}): Promise<Record<string, unknown>>;
export function chooseProjectLocalCode(
  externalCode: unknown,
  externalId: number,
  projects: Array<Record<string, unknown>>,
  currentId?: string | null,
): string;
export function executeMarisonEmployeeSync(options: {
  supabase: unknown;
  employees: MarisonEmployee[];
  branches: Array<Record<string, unknown>>;
  defaultPassword?: string | null;
  environment?: "staging" | "production";
}): Promise<Record<string, unknown>>;
export function replaceMarisonSyncIssues(options: {
  supabase: unknown;
  environment: "staging" | "production";
  issues: Array<Record<string, unknown>>;
  entityTypes: Array<"branch" | "employee" | "project">;
}): Promise<void>;
export function runTrackedMarisonSync(options: {
  supabase: unknown;
  environment: "staging" | "production";
  triggerType: "manual" | "cron";
  scope: "branches" | "directory" | "projects";
  initiatedBy?: string | null;
  operation: () => Promise<Record<string, unknown>>;
}): Promise<Record<string, unknown>>;
