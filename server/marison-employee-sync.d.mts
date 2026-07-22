export type MarisonEmployee = Record<string, unknown> & {
  id?: number;
  user_id?: number;
  nik?: string | null;
  name?: string | null;
};

export function normalizeMarisonName(value: unknown): string;
export function normalizeMarisonNik(value: unknown): string;
export function marisonNikKey(value: unknown): string;
export function buildMarisonStagingEmail(employee: MarisonEmployee, duplicateName?: boolean): string;
export function deduplicateMarisonEmployees(rows: MarisonEmployee[], options?: { knownNames?: string[] }): {
  employees: MarisonEmployee[];
  missingNik: MarisonEmployee[];
  conflictingNik: Array<{ nik: string; names: string[]; externalIds: number[] }>;
  mergedDuplicates: Array<{ nik: string; name: string; merged: number }>;
  resolvedConflicts: Array<{ nik: string; selectedName: string; ignoredNames: string[] }>;
};
export function previewMarisonEmployeeSync(options: {
  supabase: unknown;
  employees: MarisonEmployee[];
  branches: Array<Record<string, unknown>>;
}): Promise<Record<string, unknown>>;
export function executeMarisonEmployeeSync(options: {
  supabase: unknown;
  employees: MarisonEmployee[];
  branches: Array<Record<string, unknown>>;
  defaultPassword: string;
}): Promise<Record<string, unknown>>;
