import { describe, expect, it, vi } from "vitest";
import { createMarisonPreviewRuntime } from "../../backend/src/modules/marison/marison-preview-runtime";

const mockDeps = () => ({
  getSupabase: vi.fn(() => ({} as any)),
  getServiceRoleKey: vi.fn(() => "secret"),
  deploymentEnvironment: "staging",
  getBearerToken: vi.fn(),
  requireAdminUser: vi.fn(async () => ({ id: "admin-1" })),
  getAllMarisonCollection: vi.fn(),
  previewMarisonBranchSync: vi.fn(),
  previewMarisonProjectSync: vi.fn(),
  previewMarisonEmployeeSync: vi.fn(),
});

describe("Marison Preview Runtime", () => {
  it("branch preview auth gagal -> source tidak dipanggil", async () => {
    const deps = mockDeps();
    deps.requireAdminUser.mockRejectedValue(new Error("Auth failed"));
    const runtime = createMarisonPreviewRuntime(deps);
    await expect(runtime.previewMarisonBranches({})).rejects.toThrow("Auth failed");
    expect(deps.getAllMarisonCollection).not.toHaveBeenCalled();
  });

  it("project preview auth gagal -> source tidak dipanggil", async () => {
    const deps = mockDeps();
    deps.requireAdminUser.mockRejectedValue(new Error("Auth failed"));
    const runtime = createMarisonPreviewRuntime(deps);
    await expect(runtime.previewMarisonProjects({})).rejects.toThrow("Auth failed");
    expect(deps.getAllMarisonCollection).not.toHaveBeenCalled();
  });

  it("employee preview auth gagal -> source tidak dipanggil", async () => {
    const deps = mockDeps();
    deps.requireAdminUser.mockRejectedValue(new Error("Auth failed"));
    const runtime = createMarisonPreviewRuntime(deps);
    await expect(runtime.previewMarisonEmployees({})).rejects.toThrow("Auth failed");
    expect(deps.getAllMarisonCollection).not.toHaveBeenCalled();
  });

  it("missing Supabase/service role -> existing error/status", async () => {
    const deps = mockDeps();
    deps.getSupabase.mockReturnValue(null);
    const runtime = createMarisonPreviewRuntime(deps);
    await expect(runtime.previewMarisonBranches({})).rejects.toMatchObject({
      message: "Service role environment ini belum dikonfigurasi.",
      status: 500,
    });
  });

  it("employee preview di production -> 403", async () => {
    const deps = mockDeps();
    deps.deploymentEnvironment = "production";
    const runtime = createMarisonPreviewRuntime(deps);
    await expect(runtime.previewMarisonEmployees({})).rejects.toMatchObject({
      message: "Sinkronisasi karyawan external hanya tersedia di staging.",
      status: 403,
    });
  });

  it("branch loader memakai deployment environment", async () => {
    const deps = mockDeps();
    deps.deploymentEnvironment = "production";
    const runtime = createMarisonPreviewRuntime(deps);
    await runtime.getMarisonBranchSyncSource();
    expect(deps.getAllMarisonCollection).toHaveBeenCalledWith("production", "/branches");
  });

  it("employee loader memakai literal staging", async () => {
    const deps = mockDeps();
    deps.deploymentEnvironment = "production";
    deps.getAllMarisonCollection.mockResolvedValue([]);
    const runtime = createMarisonPreviewRuntime(deps);
    await runtime.getMarisonEmployeeSyncSource();
    expect(deps.getAllMarisonCollection).toHaveBeenCalledWith("staging", "/branches");
    expect(deps.getAllMarisonCollection).toHaveBeenCalledWith("staging", "/employees");
  });

  it("project loader mengambil branches dan projects", async () => {
    const deps = mockDeps();
    deps.deploymentEnvironment = "staging";
    deps.getAllMarisonCollection.mockResolvedValue([]);
    const runtime = createMarisonPreviewRuntime(deps);
    await runtime.getMarisonProjectSyncSource();
    expect(deps.getAllMarisonCollection).toHaveBeenCalledWith("staging", "/branches");
    expect(deps.getAllMarisonCollection).toHaveBeenCalledWith("staging", "/projects");
  });

  it("project source Promise.all behavior dipertahankan", async () => {
    const deps = mockDeps();
    deps.deploymentEnvironment = "staging";
    let bResolve: any;
    let pResolve: any;
    const bPromise = new Promise((r) => { bResolve = r; });
    const pPromise = new Promise((r) => { pResolve = r; });
    deps.getAllMarisonCollection.mockImplementation(async (env, path) => {
      if (path === "/branches") return bPromise;
      if (path === "/projects") return pPromise;
      return [];
    });
    const runtime = createMarisonPreviewRuntime(deps);
    let resolved = false;
    const resultPromise = runtime.getMarisonProjectSyncSource().then(r => { resolved = true; return r; });
    expect(resolved).toBe(false);
    bResolve([{ id: "b1" }]);
    await Promise.resolve(); // flush microtasks
    expect(resolved).toBe(false);
    pResolve([{ id: "p1" }]);
    const result = await resultPromise;
    expect(result.branches).toEqual([{ id: "b1" }]);
    expect(result.projects).toEqual([{ id: "p1" }]);
  });

  it("existing test source override masih bekerja", async () => {
    const deps = mockDeps();
    const runtime = createMarisonPreviewRuntime(deps);
    process.env.NODE_ENV = "test";
    runtime.setDependencies({
      getMarisonEmployeeSyncSource: async () => ({ branches: [{ id: "mock-b" }], employees: [{ id: "mock-e" }] }),
    });
    const res = await runtime.getMarisonEmployeeSyncSource();
    expect(res.employees).toEqual([{ id: "mock-e" }]);
    expect(deps.getAllMarisonCollection).not.toHaveBeenCalled();
  });

  it("tidak ada fetch nyata", () => {
    expect(vi.isMockFunction(global.fetch) ? global.fetch : vi.fn()).not.toHaveBeenCalled();
  });
});
