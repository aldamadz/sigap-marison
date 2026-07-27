export type MarisonEnvironment = "staging" | "production";

export type MarisonEnvironmentStatus = {
  environment: MarisonEnvironment;
  isStaging: boolean;
  canManage: boolean;
  locked: boolean;
  source: "deployment";
  updatedAt: string | null;
  environments?: Partial<Record<MarisonEnvironment, { configured: boolean; host: string }>>;
};

export type MarisonProbeResult = {
  ok: boolean;
  count?: number;
  durationMs: number;
  status?: number;
  message?: string;
  sample?: Array<{ value: string; label: string; raw: Record<string, unknown> }>;
};

export type MarisonEnvironmentTest = {
  environment: MarisonEnvironment;
  testedAt: string;
  projectId: number | null;
  allHealthy: boolean;
  checks: {
    projects: MarisonProbeResult;
    units: MarisonProbeResult;
    nonUnits: MarisonProbeResult;
  };
};

export type MarisonEmployeeSyncIssue = {
  externalId?: number | null;
  nik?: string;
  name?: string;
  names?: string[];
  reason: string;
};

export type MarisonBranchSyncPreview = {
  environment: MarisonEnvironment;
  generatedAt: string;
  source: number;
  matched: number;
  toCreate: number;
  toUpdate: number;
  blocked: number;
  issues: MarisonEmployeeSyncIssue[];
};

export type MarisonBranchSyncResult = {
  environment: MarisonEnvironment;
  completedAt: string;
  source: number;
  created: number;
  updated: number;
  matched: number;
  failed: number;
  errors: MarisonEmployeeSyncIssue[];
};

export type MarisonProjectSyncPreview = {
  environment: MarisonEnvironment;
  generatedAt: string;
  source: { projects: number; branches: number };
  matched: number;
  toCreate: number;
  toUpdate: number;
  blocked: number;
  issues: MarisonEmployeeSyncIssue[];
};

export type MarisonProjectSyncResult = {
  environment: MarisonEnvironment;
  completedAt: string;
  source: number;
  created: number;
  updated: number;
  matched: number;
  failed: number;
  errors: MarisonEmployeeSyncIssue[];
};

export type MarisonEmployeeSyncPreview = {
  environment: "staging";
  generatedAt: string;
  source: { employees: number; branches: number };
  branches: { matched: number; toCreate: number; toUpdate: number; blocked: number };
  employees: {
    ready: number;
    toCreate: number;
    toUpdate: number;
    blocked: number;
    missingNik: number;
    conflictingNik: number;
    mergedDuplicates: number;
    resolvedConflicts: number;
  };
  issues: MarisonEmployeeSyncIssue[];
};

export type MarisonEmployeeSyncResult = {
  environment: "staging";
  completedAt: string;
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  branchesCreated: number;
  branchesUpdated: number;
  errors: MarisonEmployeeSyncIssue[];
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Permintaan integrasi Marison gagal.");
  return payload as T;
};

export const marisonIntegrationService = {
  getStatus: () => request<MarisonEnvironmentStatus>("/api/integrations/marison/status"),
  test: () => request<MarisonEnvironmentTest>("/api/integrations/marison/test", {
    method: "POST",
    body: JSON.stringify({}),
  }),
  previewEmployeeSync: () => request<MarisonEmployeeSyncPreview>(
    "/api/integrations/marison/employees/preview"
  ),
  syncEmployees: () => request<MarisonEmployeeSyncResult>(
    "/api/integrations/marison/employees/sync",
    {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    }
  ),
  previewBranches: () => request<MarisonBranchSyncPreview>(
    "/api/integrations/marison/branches/preview"
  ),
  syncBranches: () => request<MarisonBranchSyncResult>(
    "/api/integrations/marison/branches/sync",
    {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    }
  ),
  previewProjects: () => request<MarisonProjectSyncPreview>(
    "/api/integrations/marison/projects/preview"
  ),
  syncProjects: () => request<MarisonProjectSyncResult>(
    "/api/integrations/marison/projects/sync",
    {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    }
  ),
};
