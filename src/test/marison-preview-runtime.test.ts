import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMarisonPreviewRuntime } from "../../backend/src/modules/marison/marison-preview-runtime";

const mockDeps = () => ({
  getSupabase: vi.fn(() => ({
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
  })),
  getServiceRoleKey: vi.fn(() => "secret"),
  deploymentEnvironment: "staging",
  getBearerToken: vi.fn(),
  requireAdminUser: vi.fn(async () => ({ id: "admin-1" })),
  getAllMarisonCollection: vi.fn(),
  previewMarisonBranchSync: vi.fn(),
  previewMarisonProjectSync: vi.fn(),
  previewMarisonEmployeeSync: vi.fn(),
});

const originalFetch = global.fetch;

describe("Marison Preview Runtime", () => {
  let runtime: ReturnType<typeof createMarisonPreviewRuntime>;
  let deps: ReturnType<typeof mockDeps>;

  beforeEach(() => {
    global.fetch = () => { throw new Error("Network request explicitly forbidden in this test."); };
    vi.stubEnv("NODE_ENV", "test");
    deps = mockDeps();
    runtime = createMarisonPreviewRuntime(deps);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
    runtime.resetOverrides();
  });

  it("branch preview auth gagal -> source tidak dipanggil", async () => {
    deps.requireAdminUser.mockRejectedValue(new Error("Auth failed"));
    await expect(runtime.previewMarisonBranches({})).rejects.toThrow("Auth failed");
    expect(deps.getAllMarisonCollection).not.toHaveBeenCalled();
    expect(deps.getSupabase).not.toHaveBeenCalled();
  });

  it("project preview auth gagal -> source tidak dipanggil", async () => {
    deps.requireAdminUser.mockRejectedValue(new Error("Auth failed"));
    await expect(runtime.previewMarisonProjects({})).rejects.toThrow("Auth failed");
    expect(deps.getAllMarisonCollection).not.toHaveBeenCalled();
    expect(deps.getSupabase).not.toHaveBeenCalled();
  });

  it("employee preview auth gagal -> source tidak dipanggil", async () => {
    deps.requireAdminUser.mockRejectedValue(new Error("Auth failed"));
    await expect(runtime.previewMarisonEmployees({})).rejects.toThrow("Auth failed");
    expect(deps.getAllMarisonCollection).not.toHaveBeenCalled();
    expect(deps.getSupabase).not.toHaveBeenCalled();
  });

  it("missing Supabase/service role -> existing error/status", async () => {
    deps.getSupabase.mockReturnValue(null);
    await expect(runtime.previewMarisonBranches({})).rejects.toMatchObject({
      message: "Service role environment ini belum dikonfigurasi.",
      status: 500,
    });
  });

  it("employee preview di production -> 403", async () => {
    deps.deploymentEnvironment = "production";
    await expect(runtime.previewMarisonEmployees({})).rejects.toMatchObject({
      message: "Sinkronisasi karyawan external hanya tersedia di staging.",
      status: 403,
    });
  });

  it("branch loader memakai deployment environment", async () => {
    deps.deploymentEnvironment = "production";
    await runtime.getMarisonBranchSyncSource();
    expect(deps.getAllMarisonCollection).toHaveBeenCalledWith("production", "/branches");
  });

  it("employee loader memakai literal staging", async () => {
    deps.deploymentEnvironment = "production";
    deps.getAllMarisonCollection.mockResolvedValue([]);
    await runtime.getMarisonEmployeeSyncSource();
    expect(deps.getAllMarisonCollection).toHaveBeenCalledWith("staging", "/branches");
    expect(deps.getAllMarisonCollection).toHaveBeenCalledWith("staging", "/employees");
  });

  it("project loader mengambil branches dan projects", async () => {
    deps.deploymentEnvironment = "staging";
    deps.getAllMarisonCollection.mockResolvedValue([]);
    await runtime.getMarisonProjectSyncSource();
    expect(deps.getAllMarisonCollection).toHaveBeenCalledWith("staging", "/branches");
    expect(deps.getAllMarisonCollection).toHaveBeenCalledWith("staging", "/projects");
  });

  it("project source Promise.all behavior dipertahankan", async () => {
    deps.deploymentEnvironment = "staging";
    let bResolve: (value: unknown[]) => void;
    let pResolve: (value: unknown[]) => void;
    const bPromise = new Promise<unknown[]>((r) => { bResolve = r; });
    const pPromise = new Promise<unknown[]>((r) => { pResolve = r; });
    deps.getAllMarisonCollection.mockImplementation(async (env, path) => {
      if (path === "/branches") return bPromise;
      if (path === "/projects") return pPromise;
      return [];
    });
    let resolved = false;
    const resultPromise = runtime.getMarisonProjectSyncSource().then(r => { resolved = true; return r; });
    expect(resolved).toBe(false);
    bResolve!([{ id: "b1" }]);
    await Promise.resolve(); // flush microtasks
    expect(resolved).toBe(false);
    pResolve!([{ id: "p1" }]);
    const result = await resultPromise;
    expect(result.branches).toEqual([{ id: "b1" }]);
    expect(result.projects).toEqual([{ id: "p1" }]);
  });

  it("existing test source override masih bekerja", async () => {
    runtime.setDependencies({
      getMarisonEmployeeSyncSource: async () => ({ branches: [{ id: "mock-b" }], employees: [{ id: "mock-e" }] }),
    });
    const res = await runtime.getMarisonEmployeeSyncSource();
    expect(res.employees).toEqual([{ id: "mock-e" }]);
    expect(deps.getAllMarisonCollection).not.toHaveBeenCalled();
  });

  it("fails loudly if dependencies mutated outside test env", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => runtime.setDependencies({})).toThrow("Test dependencies can only be set in test environment.");
    expect(() => runtime.resetOverrides()).toThrow("Test dependencies can only be reset in test environment.");
  });

  it("memanggil getSupabase tepat sekali pada request", async () => {
    deps.getAllMarisonCollection.mockResolvedValue([]);
    deps.previewMarisonBranchSync.mockReturnValue({ ok: true });
    await runtime.previewMarisonBranches({});
    expect(deps.getSupabase).toHaveBeenCalledTimes(1);
  });
});
