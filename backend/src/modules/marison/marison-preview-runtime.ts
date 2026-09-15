
export type SupabaseClientStructural = {
  auth: { getUser(token: string): Promise<{ data: { user: unknown }, error: unknown }> };
  from(table: string): unknown;
  rpc(fn: string, args?: unknown): unknown;
};

export type MarisonPreviewDependencies = {
  getSupabase: () => SupabaseClientStructural | null;
  getServiceRoleKey: () => string;
  deploymentEnvironment: string;
  getBearerToken: (req: unknown) => string;
  requireAdminUser: (token: string) => Promise<{ id: string }>;
  getAllMarisonCollection: (environment: string, pathname: string) => Promise<unknown[]>;
  previewMarisonBranchSync: (args: { supabase: SupabaseClientStructural; branches: unknown[]; environment: string }) => unknown;
  previewMarisonProjectSync: (args: { supabase: SupabaseClientStructural; branches: unknown[]; projects: unknown[]; environment: string }) => unknown;
  previewMarisonEmployeeSync: (args: { supabase: SupabaseClientStructural; branches: unknown[]; employees: unknown[] }) => unknown;
};

export type MarisonPreviewTestOverrides = {
  getMarisonEmployeeSyncSource?: () => Promise<{ branches: unknown[]; employees: unknown[] }>;
  getMarisonProjectSyncSource?: () => Promise<{ branches: unknown[]; projects: unknown[] }>;
};

export function createMarisonPreviewRuntime(deps: MarisonPreviewDependencies) {
  let overrideEmployeeSource: (() => Promise<{ branches: unknown[]; employees: unknown[] }>) | null = null;
  let overrideProjectSource: (() => Promise<{ branches: unknown[]; projects: unknown[] }>) | null = null;

  const setDependencies = (overrides: MarisonPreviewTestOverrides) => {
    if (process.env.NODE_ENV !== "test") return;
    if (overrides.getMarisonEmployeeSyncSource) {
      overrideEmployeeSource = overrides.getMarisonEmployeeSyncSource;
    }
    if (overrides.getMarisonProjectSyncSource) {
      overrideProjectSource = overrides.getMarisonProjectSyncSource;
    }
  };

  const assertMarisonBranchSyncAvailable = () => {
    if (!deps.getSupabase() || !deps.getServiceRoleKey()) {
      const err = new Error("Service role environment ini belum dikonfigurasi.");
      Object.assign(err, { status: 500 });
      throw err;
    }
  };

  const assertMarisonEmployeeSyncInfraAvailable = () => {
    if (deps.deploymentEnvironment !== "staging") {
      const err = new Error("Sinkronisasi karyawan external hanya tersedia di staging.");
      Object.assign(err, { status: 403 });
      throw err;
    }
    if (!deps.getSupabase() || !deps.getServiceRoleKey()) {
      const err = new Error("Layanan sinkronisasi tidak tersedia.");
      Object.assign(err, { status: 500 });
      throw err;
    }
  };

  const getMarisonBranchSyncSource = async () => {
    return deps.getAllMarisonCollection(deps.deploymentEnvironment, "/branches");
  };

  const getMarisonProjectSyncSource = async () => {
    if (overrideProjectSource) return overrideProjectSource();
    const [branches, projects] = await Promise.all([
      deps.getAllMarisonCollection(deps.deploymentEnvironment, "/branches"),
      deps.getAllMarisonCollection(deps.deploymentEnvironment, "/projects"),
    ]);
    return { branches, projects };
  };

  const getMarisonEmployeeSyncSource = async () => {
    if (overrideEmployeeSource) return overrideEmployeeSource();
    const branches = await deps.getAllMarisonCollection("staging", "/branches");
    const employees = await deps.getAllMarisonCollection("staging", "/employees");
    return { branches, employees };
  };

  const previewMarisonBranches = async (req: unknown) => {
    await deps.requireAdminUser(deps.getBearerToken(req));
    assertMarisonBranchSyncAvailable();
    const branches = await getMarisonBranchSyncSource();
    return deps.previewMarisonBranchSync({
      supabase: deps.getSupabase()!,
      branches,
      environment: deps.deploymentEnvironment,
    });
  };

  const previewMarisonProjects = async (req: unknown) => {
    await deps.requireAdminUser(deps.getBearerToken(req));
    assertMarisonBranchSyncAvailable();
    const source = await getMarisonProjectSyncSource();
    return deps.previewMarisonProjectSync({
      supabase: deps.getSupabase()!,
      ...source,
      environment: deps.deploymentEnvironment,
    });
  };

  const previewMarisonEmployees = async (req: unknown) => {
    await deps.requireAdminUser(deps.getBearerToken(req));
    assertMarisonEmployeeSyncInfraAvailable();
    const source = await getMarisonEmployeeSyncSource();
    return deps.previewMarisonEmployeeSync({
      supabase: deps.getSupabase()!,
      ...source,
    });
  };

  return {
    setDependencies,
    assertMarisonBranchSyncAvailable,
    assertMarisonEmployeeSyncInfraAvailable,
    getMarisonBranchSyncSource,
    getMarisonProjectSyncSource,
    getMarisonEmployeeSyncSource,
    previewMarisonBranches,
    previewMarisonProjects,
    previewMarisonEmployees,
  };
}
