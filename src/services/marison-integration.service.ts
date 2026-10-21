export type MarisonEnvironment = "staging" | "production";

export type MarisonEnvironmentStatus = {
  environment: MarisonEnvironment;
  isStaging: boolean;
  canManage: boolean;
  locked: boolean;
  source: "deployment";
  updatedAt: string | null;
  outbound?: {
    runtimeEnabled: boolean;
    databaseEnabled: boolean;
    databaseEnvironment: MarisonEnvironment | null;
    ready: boolean;
    updatedAt: string | null;
    overrideNikConfigured?: boolean;
    overrideNikMasked?: string | null;
    overrideBranchId?: number | null;
    overrideProjectId?: number | null;
  };
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

export type VendorDiagnosisSpecificity = "field" | "area" | "generic";

export type VendorDiagnosisIssue = {
  path: string;
  label: string;
  message: string;
  specificity: VendorDiagnosisSpecificity;
};

export type VendorDiagnosis = {
  reasonCode?: "VENDOR_MAIN_DOCUMENT_SCHEMA_MISSING";
  detailsAvailable: boolean;
  specificity: VendorDiagnosisSpecificity;
  summary: string;
  issues: VendorDiagnosisIssue[];
};

export type ReplacementPreflight = {
  eligible: boolean;
  vendorDiagnosis: VendorDiagnosis;
  payloadBodyInvariantViolated: boolean;
  safeContext: {
    roles?: string[];
    unitTypes?: string[];
    itemNames?: string[];
    hasProjectId?: boolean;
    hasBranchId?: boolean;
    attachmentCount?: number;
  } | null;
  localValidationIssues: string | null;
  changedAreas: string[] | null;
  sigapChanged: boolean;
  noSigapChangesNote?: string;
  reasonCode?: string | null;
};

export type MarisonDispatchStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed_retryable"
  | "failed_terminal"
  | "outcome_unknown"
  | "skipped";
export type MarisonDispatchFilter = MarisonDispatchStatus | "attention" | "all";

export type MarisonDispatchRow = {
  id: string;
  suratId: string;
  noSurat: string;
  title: string;
  environment: MarisonEnvironment;
  generation: number;
  replacementOfDispatchId: string | null;
  kind: "unit" | "non_unit" | "asset" | "fund" | null;
  status: MarisonDispatchStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  postStartedAt: string | null;
  completedAt: string | null;
  externalReference: string | null;
  errorCode: string | null;
  failureReason: string | null;
  lastVendorDiagnosis?: VendorDiagnosis | null;
  reconciliationCount: number;
  createdAt: string;
  updatedAt: string;
};

export type MarisonPayloadPreview = {
  dispatchId: string;
  environment: MarisonEnvironment;
  generation: number;
  method: "POST";
  endpoint: string | null;
  postStartedAt: string | null;
  payloadHash: string | null;
  source: "frozen" | "snapshot" | "unavailable" | "postman";
  payload: Record<string, unknown> | null;
  redacted: boolean;
  sourcePayloadHash?: string;
  changes?: string[];
};

export type MarisonDispatchPage = {
  environment: MarisonEnvironment;
  page: number;
  pageSize: number;
  total: number;
  items: MarisonDispatchRow[];
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
  saveOutboundOverrides: (payload: { overrideNik?: string; overrideBranchId?: number | null; overrideProjectId?: number | null; reason: string }) =>
    request<{ success: true; configuration: unknown }>("/api/integrations/marison/outbound-overrides", {
      method: "POST",
      body: JSON.stringify(payload),
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
  listDispatches: (status: MarisonDispatchFilter = "all", page = 1, pageSize = 20) => {
    const search = new URLSearchParams({ status, page: String(page), pageSize: String(pageSize) });
    return request<MarisonDispatchPage>(`/api/integrations/marison/dispatches?${search}`);
  },
  reconcileDispatch: (
    dispatchId: string,
    payload: {
      action: "mark_succeeded" | "reopen_confirmed_not_received" | "reopen_terminal_pre_post";
      reason: string;
      externalReference?: string;
      confirmDuplicateRisk?: boolean;
      confirmProductionSend?: boolean;
    }
  ) => request<{ success: true }>(`/api/integrations/marison/dispatches/${dispatchId}/reconcile`, {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  preflightDispatch: (dispatchId: string) => request<{ eligible: boolean; reasonCode?: string | null; reason?: string | null; blockedStage?: number }>(
    `/api/integrations/marison/dispatches/${dispatchId}/preflight`
  ),
  preflightReplacement: (dispatchId: string) => request<ReplacementPreflight>(`/api/integrations/marison/dispatches/${dispatchId}/replacement-preflight`),
  getPayload: (dispatchId: string) => request<MarisonPayloadPreview>(`/api/integrations/marison/dispatches/${encodeURIComponent(dispatchId)}/payload`, { cache: "no-store" }),
  getPostmanPayload: (dispatchId: string) => request<MarisonPayloadPreview>(`/api/integrations/marison/dispatches/${encodeURIComponent(dispatchId)}/payload?view=postman`, { cache: "no-store" }),
  createReplacement: (dispatchId: string, reason: string, confirmProductionSend = false, fundConfirmation?: { confirmNotReceived: boolean; confirmVendorFixed: boolean }) => request<{ replacementId: string | null; skipped?: boolean; code?: string | null }>(`/api/integrations/marison/dispatches/${dispatchId}/replacement`, {
    method: "POST",
    body: JSON.stringify({ reason, ...(confirmProductionSend ? { confirmProductionSend: true } : {}), ...fundConfirmation }),
  }),
};
