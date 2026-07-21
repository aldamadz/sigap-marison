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
};
