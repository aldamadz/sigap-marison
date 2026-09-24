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
  deploymentEnvironment: string;
  readEnv: (name: string) => string | undefined;
  /** Boot-locked cron token; captured at startup and never re-read. */
  cronToken: string;
  sha256Hex: (value: string) => string;
  getBearerToken: (req: unknown) => string;
  requireAdminUser: (token: string) => Promise<{ id: string }>;
  assertSameOrigin: (req: unknown) => void;
  readJsonBody: (req: unknown, maxBytes?: number) => Promise<unknown>;
  /**
   * Availability assertions are the single source of the Supabase client for
   * this runtime. They fail closed when the client or the service-role key is
   * missing and return the validated client, which is captured before any
   * `await` so the executor always receives that exact reference.
   */
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
    environment: string;
  }) => unknown;
};

export type MarisonEmployeeSyncWriteAvailability = {
  supabase: SupabaseClientStructural;
  defaultPassword: string;
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
    const passwordVariable = base.deploymentEnvironment === "production"
      ? "MARISON_PRODUCTION_DEFAULT_USER_PASSWORD"
      : base.deploymentEnvironment === "staging"
        ? "STAGING_DEFAULT_USER_PASSWORD"
        : null;
    if (!passwordVariable) return null;
    const value = base.readEnv(passwordVariable);
    if (typeof value !== "string" || value.length < 8) return null;
    return value;
  };

  const assertMarisonEmployeeSyncWriteAvailable = (): MarisonEmployeeSyncWriteAvailability => {
    const supabase = base.assertMarisonEmployeeSyncInfraAvailable();
    const defaultPassword = marisonDefaultPassword();
    if (base.deploymentEnvironment !== "staging" && base.deploymentEnvironment !== "production") {
      throw errorWithStatus("Environment sinkronisasi karyawan tidak didukung.", 503);
    }
    if (!defaultPassword) {
      throw errorWithStatus("Konfigurasi sinkronisasi karyawan belum lengkap.", 503);
    }
    return { supabase, defaultPassword };
  };

  const syncMarisonBranches = async (req: unknown) => {
    base.assertSameOrigin(req);
    const user = await base.requireAdminUser(base.getBearerToken(req));
    const supabase = base.assertMarisonBranchSyncAvailable();
    const payload = await base.readJsonBody(req, 4096);
    if (!isRecord(payload) || payload.confirm !== true) {
      throw errorWithStatus("Konfirmasi sinkronisasi diperlukan.", 400);
    }
    if (marisonBranchSyncInFlight || marisonEmployeeSyncInFlight || marisonProjectSyncInFlight) {
      throw conflictError();
    }
    marisonBranchSyncInFlight = true;
    try {
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
    const supabase = base.assertMarisonBranchSyncAvailable();
    if (marisonBranchSyncInFlight || marisonEmployeeSyncInFlight || marisonProjectSyncInFlight) {
      throw conflictError();
    }
    marisonProjectSyncInFlight = true;
    try {
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
    const { supabase, defaultPassword } = assertMarisonEmployeeSyncWriteAvailable();
    const payload = await base.readJsonBody(req, 4096);
    if (!isRecord(payload) || payload.confirm !== true) {
      throw errorWithStatus("Konfirmasi sinkronisasi diperlukan.", 400);
    }
    if (marisonEmployeeSyncInFlight || marisonBranchSyncInFlight || marisonProjectSyncInFlight) {
      throw conflictError();
    }
    marisonEmployeeSyncInFlight = true;
    try {
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
          environment: base.deploymentEnvironment,
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
    const { supabase, defaultPassword } = assertMarisonEmployeeSyncWriteAvailable();
    if (marisonEmployeeSyncInFlight || marisonBranchSyncInFlight || marisonProjectSyncInFlight) {
      throw conflictError();
    }
    marisonEmployeeSyncInFlight = true;
    marisonProjectSyncInFlight = true;
    try {
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
          environment: base.deploymentEnvironment,
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
