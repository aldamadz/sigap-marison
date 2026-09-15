import type { SupabaseClientStructural } from "./marison-preview-runtime.js";

export type { SupabaseClientStructural };

export type MarisonProjectSyncSource = { branches: unknown[]; projects: unknown[] };
export type MarisonEmployeeSyncSource = { branches: unknown[]; employees: unknown[] };

export type MarisonTrackedSyncResult = Record<string, unknown> & { status?: string };

export type MarisonTrackedSyncArgs = {
  supabase: SupabaseClientStructural;
  environment: string;
  triggerType: string;
  scope: string;
  initiatedBy?: string | null;
  operation: () => unknown;
};

export type MarisonSyncDependencies = {
  /**
   * Returns the Supabase client for the current deployment. Callers must run
   * the matching availability assertion first, which fails closed when the
   * client or the service-role key is missing. The client is captured once per
   * request before any `await` so the validated reference is what the executor
   * receives.
   */
  getSupabase: () => SupabaseClientStructural;
  deploymentEnvironment: string;
  readEnv: (name: string) => string | undefined;
  /** Boot-locked cron token; captured at startup and never re-read. */
  cronToken: string;
  sha256Hex: (value: string) => string;
  getBearerToken: (req: unknown) => string;
  requireAdminUser: (token: string) => Promise<{ id: string }>;
  assertSameOrigin: (req: unknown) => void;
  readJsonBody: (req: unknown, maxBytes?: number) => Promise<unknown>;
  assertMarisonBranchSyncAvailable: () => SupabaseClientStructural;
  assertMarisonEmployeeSyncInfraAvailable: () => SupabaseClientStructural;
  getMarisonBranchSyncSource: () => Promise<unknown[]>;
  getMarisonProjectSyncSource: () => Promise<MarisonProjectSyncSource>;
  getMarisonEmployeeSyncSource: () => Promise<MarisonEmployeeSyncSource>;
  runTrackedMarisonSync: (args: MarisonTrackedSyncArgs) => Promise<MarisonTrackedSyncResult>;
  executeMarisonBranchSync: (args: {
    supabase: SupabaseClientStructural;
    branches: unknown[];
    environment: string;
  }) => unknown;
  executeMarisonProjectSync: (args: {
    supabase: SupabaseClientStructural;
    branches: unknown[];
    projects: unknown[];
    environment: string;
  }) => unknown;
  executeMarisonEmployeeSync: (args: {
    supabase: SupabaseClientStructural;
    branches: unknown[];
    employees: unknown[];
    defaultPassword: string;
  }) => unknown;
};

/**
 * Test-only overrides for the four mutation seams. The shared in-flight mutex
 * state intentionally stays owned by this factory and cannot be overridden.
 */
export type MarisonSyncTestOverrides = {
  runTrackedMarisonSync?: MarisonSyncDependencies["runTrackedMarisonSync"];
  executeMarisonBranchSync?: MarisonSyncDependencies["executeMarisonBranchSync"];
  executeMarisonProjectSync?: MarisonSyncDependencies["executeMarisonProjectSync"];
  executeMarisonEmployeeSync?: MarisonSyncDependencies["executeMarisonEmployeeSync"];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readHeader = (req: unknown, name: string): string => {
  if (!isRecord(req)) return "";
  const headers: unknown = Reflect.get(req, "headers");
  if (!isRecord(headers)) return "";
  const value: unknown = Reflect.get(headers, name);
  return typeof value === "string" ? value : String(value ?? "");
};

const errorWithStatus = (message: string, status: number): Error =>
  Object.assign(new Error(message), { status });

const conflictError = () => errorWithStatus("Sinkronisasi data external sedang berjalan.", 409);

export function createMarisonSyncRuntime(baseDependencies: MarisonSyncDependencies) {
  const base = baseDependencies;

  let runTrackedMarisonSync = base.runTrackedMarisonSync;
  let executeMarisonBranchSync = base.executeMarisonBranchSync;
  let executeMarisonProjectSync = base.executeMarisonProjectSync;
  let executeMarisonEmployeeSync = base.executeMarisonEmployeeSync;

  // Shared mutex: a single factory owns all three in-flight flags so manual and
  // cron sync paths can never run concurrently across scopes.
  let marisonEmployeeSyncInFlight = false;
  let marisonBranchSyncInFlight = false;
  let marisonProjectSyncInFlight = false;

  const setDependencies = (overrides: MarisonSyncTestOverrides) => {
    if (process.env.NODE_ENV !== "test") {
      throw new Error("Test dependencies can only be set in test environment.");
    }
    if (overrides.runTrackedMarisonSync) runTrackedMarisonSync = overrides.runTrackedMarisonSync;
    if (overrides.executeMarisonBranchSync) executeMarisonBranchSync = overrides.executeMarisonBranchSync;
    if (overrides.executeMarisonProjectSync) executeMarisonProjectSync = overrides.executeMarisonProjectSync;
    if (overrides.executeMarisonEmployeeSync) executeMarisonEmployeeSync = overrides.executeMarisonEmployeeSync;
  };

  const resetOverrides = () => {
    if (process.env.NODE_ENV !== "test") {
      throw new Error("Test dependencies can only be reset in test environment.");
    }
    runTrackedMarisonSync = base.runTrackedMarisonSync;
    executeMarisonBranchSync = base.executeMarisonBranchSync;
    executeMarisonProjectSync = base.executeMarisonProjectSync;
    executeMarisonEmployeeSync = base.executeMarisonEmployeeSync;
  };

  const marisonDefaultPassword = () => {
    const value = base.readEnv("STAGING_DEFAULT_USER_PASSWORD");
    if (typeof value !== "string" || value.length < 8) return null;
    return value;
  };

  const assertMarisonEmployeeSyncWriteAvailable = (): string => {
    base.assertMarisonEmployeeSyncInfraAvailable();
    const defaultPassword = marisonDefaultPassword();
    if (!defaultPassword) {
      throw errorWithStatus("Konfigurasi sinkronisasi karyawan belum lengkap.", 503);
    }
    return defaultPassword;
  };

  const syncMarisonBranches = async (req: unknown) => {
    base.assertSameOrigin(req);
    const user = await base.requireAdminUser(base.getBearerToken(req));
    base.assertMarisonBranchSyncAvailable();
    const payload = await base.readJsonBody(req, 4096);
    if (!isRecord(payload) || payload.confirm !== true) {
      throw errorWithStatus("Konfirmasi sinkronisasi diperlukan.", 400);
    }
    if (marisonBranchSyncInFlight || marisonEmployeeSyncInFlight || marisonProjectSyncInFlight) {
      throw conflictError();
    }
    marisonBranchSyncInFlight = true;
    try {
      const supabase = base.getSupabase();
      const branches = await base.getMarisonBranchSyncSource();
      return await runTrackedMarisonSync({
        supabase,
        environment: base.deploymentEnvironment,
        triggerType: "manual",
        scope: "branches",
        initiatedBy: user.id,
        operation: () => executeMarisonBranchSync({
          supabase,
          branches,
          environment: base.deploymentEnvironment,
        }),
      });
    } finally {
      marisonBranchSyncInFlight = false;
    }
  };

  const syncMarisonProjects = async (req: unknown) => {
    const user = await base.requireAdminUser(base.getBearerToken(req));
    const body = await base.readJsonBody(req);
    if (!isRecord(body) || body.confirm !== true) {
      throw errorWithStatus("Konfirmasi sinkronisasi proyek wajib dikirim.", 400);
    }
    base.assertMarisonBranchSyncAvailable();
    if (marisonBranchSyncInFlight || marisonEmployeeSyncInFlight || marisonProjectSyncInFlight) {
      throw conflictError();
    }
    marisonProjectSyncInFlight = true;
    try {
      const supabase = base.getSupabase();
      const source = await base.getMarisonProjectSyncSource();
      return await runTrackedMarisonSync({
        supabase,
        environment: base.deploymentEnvironment,
        triggerType: "manual",
        scope: "projects",
        initiatedBy: user.id,
        operation: () => executeMarisonProjectSync({
          supabase,
          ...source,
          environment: base.deploymentEnvironment,
        }),
      });
    } finally {
      marisonProjectSyncInFlight = false;
    }
  };

  const syncMarisonEmployees = async (req: unknown) => {
    base.assertSameOrigin(req);
    const user = await base.requireAdminUser(base.getBearerToken(req));
    const defaultPassword = assertMarisonEmployeeSyncWriteAvailable();
    const payload = await base.readJsonBody(req, 4096);
    if (!isRecord(payload) || payload.confirm !== true) {
      throw errorWithStatus("Konfirmasi sinkronisasi diperlukan.", 400);
    }
    if (marisonEmployeeSyncInFlight || marisonBranchSyncInFlight || marisonProjectSyncInFlight) {
      throw conflictError();
    }
    marisonEmployeeSyncInFlight = true;
    try {
      const supabase = base.getSupabase();
      const source = await base.getMarisonEmployeeSyncSource();
      return await runTrackedMarisonSync({
        supabase,
        environment: base.deploymentEnvironment,
        triggerType: "manual",
        scope: "directory",
        initiatedBy: user.id,
        operation: () => executeMarisonEmployeeSync({
          supabase,
          ...source,
          defaultPassword,
        }),
      });
    } finally {
      marisonEmployeeSyncInFlight = false;
    }
  };

  const syncMarisonDirectoryFromCron = async (req: unknown) => {
    base.assertMarisonEmployeeSyncInfraAvailable();
    if (base.cronToken.length < 32) {
      throw errorWithStatus("Layanan sinkronisasi tidak tersedia.", 503);
    }
    const suppliedToken = readHeader(req, "x-internal-sync-token");
    if (!suppliedToken || base.sha256Hex(suppliedToken) !== base.sha256Hex(base.cronToken)) {
      throw errorWithStatus("Unauthorized", 401);
    }
    const defaultPassword = assertMarisonEmployeeSyncWriteAvailable();
    if (marisonEmployeeSyncInFlight || marisonBranchSyncInFlight || marisonProjectSyncInFlight) {
      throw conflictError();
    }
    marisonEmployeeSyncInFlight = true;
    marisonProjectSyncInFlight = true;
    try {
      const supabase = base.getSupabase();
      const source = await base.getMarisonEmployeeSyncSource();
      const directory = await runTrackedMarisonSync({
        supabase,
        environment: base.deploymentEnvironment,
        triggerType: "cron",
        scope: "directory",
        operation: () => executeMarisonEmployeeSync({
          supabase,
          ...source,
          defaultPassword,
        }),
      });
      const projectSource = await base.getMarisonProjectSyncSource();
      const projects = await runTrackedMarisonSync({
        supabase,
        environment: base.deploymentEnvironment,
        triggerType: "cron",
        scope: "projects",
        operation: () => executeMarisonProjectSync({
          supabase,
          ...projectSource,
          environment: base.deploymentEnvironment,
        }),
      });
      return {
        status: directory.status === "success" && projects.status === "success" ? "success" : "partial",
        directory,
        projects,
      };
    } finally {
      marisonEmployeeSyncInFlight = false;
      marisonProjectSyncInFlight = false;
    }
  };

  return {
    setDependencies,
    resetOverrides,
    marisonDefaultPassword,
    assertMarisonEmployeeSyncWriteAvailable,
    syncMarisonBranches,
    syncMarisonProjects,
    syncMarisonEmployees,
    syncMarisonDirectoryFromCron,
  };
}
