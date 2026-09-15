import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClientStructural } from "../../backend/src/modules/marison/marison-preview-runtime";
import { createMarisonPreviewRuntime } from "../../backend/src/modules/marison/marison-preview-runtime";

const fakeClient = (): SupabaseClientStructural => ({
  auth: { getUser: vi.fn() },
  from: vi.fn(),
  rpc: vi.fn(),
});

const mockDeps = () => ({
  getSupabase: vi.fn(() => fakeClient()),
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
  let runtime: ReturnType<typeof createMarisonPreviewRuntime>;
  let deps: ReturnType<typeof mockDeps>;

  beforeEach(() => {
    vi.stubGlobal("fetch", () => { throw new Error("Network request explicitly forbidden in this test."); });
    vi.stubEnv("NODE_ENV", "test");
    deps = mockDeps();
    runtime = createMarisonPreviewRuntime(deps);
  });

  afterEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    runtime.resetOverrides();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // --- Auth guard ---

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

  // --- Availability: branch/project (assertMarisonBranchSyncAvailable) ---

  it("Supabase null pada branch -> 500", async () => {
    deps.getSupabase.mockReturnValue(null);
    await expect(runtime.previewMarisonBranches({})).rejects.toMatchObject({
      message: "Service role environment ini belum dikonfigurasi.",
      status: 500,
    });
  });

  it("service-role kosong pada branch -> 500", async () => {
    deps.getServiceRoleKey.mockReturnValue("");
    await expect(runtime.previewMarisonBranches({})).rejects.toMatchObject({
      message: "Service role environment ini belum dikonfigurasi.",
      status: 500,
    });
  });

  it("Supabase null pada project -> 500", async () => {
    deps.getSupabase.mockReturnValue(null);
    await expect(runtime.previewMarisonProjects({})).rejects.toMatchObject({
      message: "Service role environment ini belum dikonfigurasi.",
      status: 500,
    });
  });

  it("service-role kosong pada project -> 500", async () => {
    deps.getServiceRoleKey.mockReturnValue("");
    await expect(runtime.previewMarisonProjects({})).rejects.toMatchObject({
      message: "Service role environment ini belum dikonfigurasi.",
      status: 500,
    });
  });

  // --- Availability: employee (assertMarisonEmployeeSyncInfraAvailable) ---

  it("employee preview di production -> 403", async () => {
    deps.deploymentEnvironment = "production";
    await expect(runtime.previewMarisonEmployees({})).rejects.toMatchObject({
      message: "Sinkronisasi karyawan external hanya tersedia di staging.",
      status: 403,
    });
  });

  it("Supabase null pada employee -> 500", async () => {
    deps.getSupabase.mockReturnValue(null);
    await expect(runtime.previewMarisonEmployees({})).rejects.toMatchObject({
      message: "Layanan sinkronisasi tidak tersedia.",
      status: 500,
    });
  });

  it("service-role kosong pada employee -> 500", async () => {
    deps.getServiceRoleKey.mockReturnValue("");
    await expect(runtime.previewMarisonEmployees({})).rejects.toMatchObject({
      message: "Layanan sinkronisasi tidak tersedia.",
      status: 500,
    });
  });

  // --- Source loaders ---

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
    deps.getAllMarisonCollection.mockResolvedValue([]);
    await runtime.getMarisonProjectSyncSource();
    expect(deps.getAllMarisonCollection).toHaveBeenCalledWith("staging", "/branches");
    expect(deps.getAllMarisonCollection).toHaveBeenCalledWith("staging", "/projects");
  });

  it("project source Promise.all behavior dipertahankan", async () => {
    let bResolve: (value: unknown[]) => void;
    let pResolve: (value: unknown[]) => void;
    const bPromise = new Promise<unknown[]>((r) => { bResolve = r; });
    const pPromise = new Promise<unknown[]>((r) => { pResolve = r; });
    deps.getAllMarisonCollection.mockImplementation(async (_env: string, path: string) => {
      if (path === "/branches") return bPromise;
      if (path === "/projects") return pPromise;
      return [];
    });
    let resolved = false;
    const resultPromise = runtime.getMarisonProjectSyncSource().then(r => { resolved = true; return r; });
    expect(resolved).toBe(false);
    bResolve!([{ id: "b1" }]);
    await Promise.resolve();
    expect(resolved).toBe(false);
    pResolve!([{ id: "p1" }]);
    const result = await resultPromise;
    expect(result.branches).toEqual([{ id: "b1" }]);
    expect(result.projects).toEqual([{ id: "p1" }]);
  });

  // --- Adapter contract ---

  it("branch adapter menerima client, branches, environment", async () => {
    const client = fakeClient();
    deps.getSupabase.mockReturnValue(client);
    deps.getAllMarisonCollection.mockResolvedValue([{ id: "b1" }]);
    deps.previewMarisonBranchSync.mockReturnValue({ synced: 1 });
    deps.deploymentEnvironment = "production";
    const result = await runtime.previewMarisonBranches({});
    expect(deps.previewMarisonBranchSync).toHaveBeenCalledWith({
      supabase: client,
      branches: [{ id: "b1" }],
      environment: "production",
    });
    expect(result).toEqual({ synced: 1 });
  });

  it("project adapter menerima client, branches, projects, environment", async () => {
    const client = fakeClient();
    deps.getSupabase.mockReturnValue(client);
    deps.getAllMarisonCollection.mockResolvedValue([]);
    runtime.setDependencies({
      getMarisonProjectSyncSource: async () => ({ branches: [{ id: "b" }], projects: [{ id: "p" }] }),
    });
    deps.previewMarisonProjectSync.mockReturnValue({ diff: [] });
    const result = await runtime.previewMarisonProjects({});
    expect(deps.previewMarisonProjectSync).toHaveBeenCalledWith({
      supabase: client,
      branches: [{ id: "b" }],
      projects: [{ id: "p" }],
      environment: "staging",
    });
    expect(result).toEqual({ diff: [] });
  });

  it("employee adapter menerima client, branches, employees", async () => {
    const client = fakeClient();
    deps.getSupabase.mockReturnValue(client);
    runtime.setDependencies({
      getMarisonEmployeeSyncSource: async () => ({ branches: [{ id: "b" }], employees: [{ id: "e" }] }),
    });
    deps.previewMarisonEmployeeSync.mockReturnValue({ count: 0 });
    const result = await runtime.previewMarisonEmployees({});
    expect(deps.previewMarisonEmployeeSync).toHaveBeenCalledWith({
      supabase: client,
      branches: [{ id: "b" }],
      employees: [{ id: "e" }],
    });
    expect(result).toEqual({ count: 0 });
  });

  it("adapter return diteruskan tanpa diubah", async () => {
    deps.getAllMarisonCollection.mockResolvedValue([]);
    const sentinel = { complex: { nested: true }, arr: [1, 2] };
    deps.previewMarisonBranchSync.mockReturnValue(sentinel);
    const result = await runtime.previewMarisonBranches({});
    expect(result).toBe(sentinel);
  });

  it("error dari adapter diteruskan tanpa dibungkus ulang", async () => {
    deps.getAllMarisonCollection.mockResolvedValue([]);
    const adapterErr = new Error("adapter boom");
    Object.assign(adapterErr, { status: 502 });
    deps.previewMarisonBranchSync.mockImplementation(() => { throw adapterErr; });
    await expect(runtime.previewMarisonBranches({})).rejects.toBe(adapterErr);
  });

  // --- TOCTOU: deferred source, client A stays ---

  it("TOCTOU: client A diambil sebelum source loader, tetap dipakai setelah await", async () => {
    const clientA = { ...fakeClient(), _marker: "A" };
    const clientB = { ...fakeClient(), _marker: "B" };
    deps.getSupabase.mockReturnValue(clientA);

    // Source loader that swaps getSupabase mid-flight
    runtime.setDependencies({
      getMarisonBranchSyncSource: async () => {
        // At this point, supabase should already be captured as clientA
        deps.getSupabase.mockReturnValue(clientB);
        return [{ id: "x" }];
      },
    });

    await runtime.previewMarisonBranches({});

    // Adapter must have received clientA (captured before source loader ran)
    const call = deps.previewMarisonBranchSync.mock.calls[0][0];
    expect((call.supabase as Record<string, unknown>)._marker).toBe("A");
    expect(deps.getSupabase).toHaveBeenCalledTimes(1);
  });

  // --- Override & reset ---

  it("existing test source override masih bekerja", async () => {
    runtime.setDependencies({
      getMarisonEmployeeSyncSource: async () => ({ branches: [{ id: "mock-b" }], employees: [{ id: "mock-e" }] }),
    });
    const res = await runtime.getMarisonEmployeeSyncSource();
    expect(res.employees).toEqual([{ id: "mock-e" }]);
    expect(deps.getAllMarisonCollection).not.toHaveBeenCalled();
  });

  it("resetOverrides mengembalikan ke production loader", async () => {
    runtime.setDependencies({
      getMarisonBranchSyncSource: async () => [{ id: "override" }],
    });
    const overridden = await runtime.getMarisonBranchSyncSource();
    expect(overridden).toEqual([{ id: "override" }]);
    expect(deps.getAllMarisonCollection).not.toHaveBeenCalled();

    runtime.resetOverrides();
    deps.getAllMarisonCollection.mockResolvedValue([{ id: "prod" }]);
    const restored = await runtime.getMarisonBranchSyncSource();
    expect(restored).toEqual([{ id: "prod" }]);
    expect(deps.getAllMarisonCollection).toHaveBeenCalledWith("staging", "/branches");
  });

  it("fails loudly if dependencies mutated outside test env", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => runtime.setDependencies({})).toThrow("Test dependencies can only be set in test environment.");
    expect(() => runtime.resetOverrides()).toThrow("Test dependencies can only be reset in test environment.");
  });

  // --- Single getSupabase call ---

  it("memanggil getSupabase tepat sekali pada request", async () => {
    deps.getAllMarisonCollection.mockResolvedValue([]);
    deps.previewMarisonBranchSync.mockReturnValue({ ok: true });
    await runtime.previewMarisonBranches({});
    expect(deps.getSupabase).toHaveBeenCalledTimes(1);
  });
});
