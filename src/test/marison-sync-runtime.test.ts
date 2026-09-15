import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMarisonSyncRuntime,
  type MarisonSyncDependencies,
} from "../../backend/src/modules/marison/marison-sync-runtime";

const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");

const fakeClient = (marker: string) => ({
  _marker: marker,
  auth: { getUser: vi.fn() },
  from: vi.fn(() => { throw new Error("FAIL-CLOSED: real DB access attempted"); }),
  rpc: vi.fn(() => { throw new Error("FAIL-CLOSED: real RPC attempted"); }),
});

const flush = () => new Promise((resolve) => setImmediate(resolve));

const waitFor = async (predicate: () => boolean) => {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await flush();
  }
  throw new Error("waitFor timeout");
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const VALID_PASSWORD = "staging-password-123";
const CRON_TOKEN = "cron-token-0000000000000000000000000000000000";

type Harness = {
  runtime: ReturnType<typeof createMarisonSyncRuntime>;
  deps: MarisonSyncDependencies;
  order: string[];
  client: ReturnType<typeof fakeClient>;
};

const createHarness = (): Harness => {
  const order: string[] = [];
  const record = (name: string) => { order.push(name); };
  const client = fakeClient("A");

  const deps: MarisonSyncDependencies = {
    getSupabase: vi.fn(() => { record("getSupabase"); return client; }),
    deploymentEnvironment: "staging",
    readEnv: vi.fn((name: string) => (name === "STAGING_DEFAULT_USER_PASSWORD" ? VALID_PASSWORD : undefined)),
    cronToken: CRON_TOKEN,
    sha256Hex,
    getBearerToken: vi.fn(() => { record("getBearerToken"); return "bearer-token"; }),
    requireAdminUser: vi.fn(async () => { record("requireAdminUser"); return { id: "admin-1" }; }),
    assertSameOrigin: vi.fn(() => { record("assertSameOrigin"); }),
    readJsonBody: vi.fn(async () => { record("readJsonBody"); return { confirm: true }; }),
    assertMarisonBranchSyncAvailable: vi.fn(() => { record("assertBranchAvailable"); return client; }),
    assertMarisonEmployeeSyncInfraAvailable: vi.fn(() => { record("assertEmployeeInfra"); return client; }),
    getMarisonBranchSyncSource: vi.fn(async () => { record("source:branches"); return [{ id: "b1" }]; }),
    getMarisonProjectSyncSource: vi.fn(async () => {
      record("source:projects");
      return { branches: [{ id: "b1" }], projects: [{ id: "p1" }] };
    }),
    getMarisonEmployeeSyncSource: vi.fn(async () => {
      record("source:employee");
      return { branches: [{ id: "b1" }], employees: [{ id: "e1" }] };
    }),
    runTrackedMarisonSync: vi.fn(async (args: { operation: () => unknown; scope: string }) => {
      record(`tracked:${args.scope}`);
      const result = await args.operation();
      return { ...(result as Record<string, unknown>), runId: "run-1", status: "success" };
    }),
    executeMarisonBranchSync: vi.fn((args: unknown) => { record("execute:branches"); return { synced: 1, args }; }),
    executeMarisonProjectSync: vi.fn((args: unknown) => { record("execute:projects"); return { synced: 1, args }; }),
    executeMarisonEmployeeSync: vi.fn((args: unknown) => { record("execute:employee"); return { synced: 1, args }; }),
  };

  return { runtime: createMarisonSyncRuntime(deps), deps, order, client };
};

const manualReq = () => ({ headers: { host: "sigap.test", origin: "https://sigap.test" } });

let h: Harness;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network request explicitly forbidden in this test."); }));
  vi.stubEnv("NODE_ENV", "test");
  h = createHarness();
});

afterEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  h.runtime.resetOverrides();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const setPassword = (value: string) => {
  h.deps.readEnv = vi.fn((name: string) => (name === "STAGING_DEFAULT_USER_PASSWORD" ? value : undefined));
};

// --- 3/4/5: Auth/config/confirm status + exact call order + tracked metadata ---

describe("syncMarisonBranches", () => {
  it("memenuhi exact call order dan metadata tracked sync", async () => {
    const result = await h.runtime.syncMarisonBranches(manualReq());
    expect(h.order).toEqual([
      "assertSameOrigin",
      "getBearerToken",
      "requireAdminUser",
      "assertBranchAvailable",
      "readJsonBody",
      "getSupabase",
      "source:branches",
      "tracked:branches",
      "execute:branches",
    ]);
    expect(h.deps.runTrackedMarisonSync).toHaveBeenCalledTimes(1);
    const meta = vi.mocked(h.deps.runTrackedMarisonSync).mock.calls[0][0];
    expect(meta.supabase).toBe(h.client);
    expect(meta.environment).toBe("staging");
    expect(meta.triggerType).toBe("manual");
    expect(meta.scope).toBe("branches");
    expect(meta.initiatedBy).toBe("admin-1");
    expect(h.deps.executeMarisonBranchSync).toHaveBeenCalledWith({
      supabase: h.client,
      branches: [{ id: "b1" }],
      environment: "staging",
    });
    expect(result).toMatchObject({ synced: 1, runId: "run-1" });
  });

  it("confirm body limit 4096 byte", async () => {
    await h.runtime.syncMarisonBranches(manualReq());
    expect(h.deps.readJsonBody).toHaveBeenCalledWith(expect.anything(), 4096);
  });

  it("same-origin ditolak sebelum auth -> 403, tanpa source", async () => {
    const err = Object.assign(new Error("Cross-site request ditolak."), { status: 403 });
    vi.mocked(h.deps.assertSameOrigin).mockImplementation(() => { throw err; });
    await expect(h.runtime.syncMarisonBranches(manualReq())).rejects.toMatchObject({
      message: "Cross-site request ditolak.",
      status: 403,
    });
    expect(h.deps.requireAdminUser).not.toHaveBeenCalled();
    expect(h.deps.readJsonBody).not.toHaveBeenCalled();
    expect(h.deps.getMarisonBranchSyncSource).not.toHaveBeenCalled();
    expect(h.deps.getSupabase).not.toHaveBeenCalled();
  });

  it("auth gagal -> error diteruskan, tanpa confirm/source", async () => {
    const err = Object.assign(new Error("Unauthorized"), { status: 401 });
    vi.mocked(h.deps.requireAdminUser).mockRejectedValue(err);
    await expect(h.runtime.syncMarisonBranches(manualReq())).rejects.toBe(err);
    expect(h.deps.readJsonBody).not.toHaveBeenCalled();
    expect(h.deps.getMarisonBranchSyncSource).not.toHaveBeenCalled();
    expect(h.deps.getSupabase).not.toHaveBeenCalled();
  });

  it("infra gagal -> 500 sebelum confirm/source", async () => {
    const err = Object.assign(new Error("Service role environment ini belum dikonfigurasi."), { status: 500 });
    vi.mocked(h.deps.assertMarisonBranchSyncAvailable).mockImplementation(() => { throw err; });
    await expect(h.runtime.syncMarisonBranches(manualReq())).rejects.toMatchObject({
      message: "Service role environment ini belum dikonfigurasi.",
      status: 500,
    });
    expect(h.deps.readJsonBody).not.toHaveBeenCalled();
    expect(h.deps.getMarisonBranchSyncSource).not.toHaveBeenCalled();
  });

  it("confirm bukan true -> 400, tanpa source", async () => {
    vi.mocked(h.deps.readJsonBody).mockResolvedValue({ confirm: false });
    await expect(h.runtime.syncMarisonBranches(manualReq())).rejects.toMatchObject({
      message: "Konfirmasi sinkronisasi diperlukan.",
      status: 400,
    });
    expect(h.deps.getMarisonBranchSyncSource).not.toHaveBeenCalled();
    expect(h.deps.runTrackedMarisonSync).not.toHaveBeenCalled();
  });

  it("confirm body non-record -> 400", async () => {
    vi.mocked(h.deps.readJsonBody).mockResolvedValue(null);
    await expect(h.runtime.syncMarisonBranches(manualReq())).rejects.toMatchObject({
      message: "Konfirmasi sinkronisasi diperlukan.",
      status: 400,
    });
  });
});

describe("syncMarisonProjects", () => {
  it("memenuhi exact call order dan metadata tracked sync", async () => {
    const result = await h.runtime.syncMarisonProjects(manualReq());
    expect(h.order).toEqual([
      "getBearerToken",
      "requireAdminUser",
      "readJsonBody",
      "assertBranchAvailable",
      "getSupabase",
      "source:projects",
      "tracked:projects",
      "execute:projects",
    ]);
    const meta = vi.mocked(h.deps.runTrackedMarisonSync).mock.calls[0][0];
    expect(meta.supabase).toBe(h.client);
    expect(meta.triggerType).toBe("manual");
    expect(meta.scope).toBe("projects");
    expect(meta.initiatedBy).toBe("admin-1");
    expect(h.deps.executeMarisonProjectSync).toHaveBeenCalledWith({
      supabase: h.client,
      branches: [{ id: "b1" }],
      projects: [{ id: "p1" }],
      environment: "staging",
    });
    expect(result).toMatchObject({ synced: 1, runId: "run-1" });
  });

  it("tidak memakai assertSameOrigin (sesuai kontrak saat ini)", async () => {
    await h.runtime.syncMarisonProjects(manualReq());
    expect(h.deps.assertSameOrigin).not.toHaveBeenCalled();
  });

  it("confirm body tanpa limit eksplisit", async () => {
    await h.runtime.syncMarisonProjects(manualReq());
    expect(h.deps.readJsonBody).toHaveBeenCalledWith(expect.anything());
    expect(vi.mocked(h.deps.readJsonBody).mock.calls[0]).toHaveLength(1);
  });

  it("auth gagal -> error diteruskan, tanpa confirm/source", async () => {
    const err = Object.assign(new Error("Unauthorized"), { status: 401 });
    vi.mocked(h.deps.requireAdminUser).mockRejectedValue(err);
    await expect(h.runtime.syncMarisonProjects(manualReq())).rejects.toBe(err);
    expect(h.deps.readJsonBody).not.toHaveBeenCalled();
    expect(h.deps.getMarisonProjectSyncSource).not.toHaveBeenCalled();
  });

  it("confirm gagal -> 400 sebelum infra/source (urutan khusus project)", async () => {
    vi.mocked(h.deps.readJsonBody).mockResolvedValue({ confirm: false });
    await expect(h.runtime.syncMarisonProjects(manualReq())).rejects.toMatchObject({
      message: "Konfirmasi sinkronisasi proyek wajib dikirim.",
      status: 400,
    });
    expect(h.deps.assertMarisonBranchSyncAvailable).not.toHaveBeenCalled();
    expect(h.deps.getMarisonProjectSyncSource).not.toHaveBeenCalled();
  });

  it("infra gagal -> 500 setelah confirm, sebelum source", async () => {
    const err = Object.assign(new Error("Service role environment ini belum dikonfigurasi."), { status: 500 });
    vi.mocked(h.deps.assertMarisonBranchSyncAvailable).mockImplementation(() => { throw err; });
    await expect(h.runtime.syncMarisonProjects(manualReq())).rejects.toMatchObject({ status: 500 });
    expect(h.deps.readJsonBody).toHaveBeenCalledTimes(1);
    expect(h.deps.getMarisonProjectSyncSource).not.toHaveBeenCalled();
  });
});

describe("syncMarisonEmployees", () => {
  it("memenuhi exact call order dan metadata tracked sync", async () => {
    const result = await h.runtime.syncMarisonEmployees(manualReq());
    expect(h.order).toEqual([
      "assertSameOrigin",
      "getBearerToken",
      "requireAdminUser",
      "assertEmployeeInfra",
      "readJsonBody",
      "getSupabase",
      "source:employee",
      "tracked:directory",
      "execute:employee",
    ]);
    const meta = vi.mocked(h.deps.runTrackedMarisonSync).mock.calls[0][0];
    expect(meta.supabase).toBe(h.client);
    expect(meta.triggerType).toBe("manual");
    expect(meta.scope).toBe("directory");
    expect(meta.initiatedBy).toBe("admin-1");
    expect(h.deps.executeMarisonEmployeeSync).toHaveBeenCalledWith({
      supabase: h.client,
      branches: [{ id: "b1" }],
      employees: [{ id: "e1" }],
      defaultPassword: VALID_PASSWORD,
    });
    expect(result).toMatchObject({ synced: 1, runId: "run-1" });
  });

  it("password hilang -> 503 sebelum confirm/source", async () => {
    setPassword("");
    await expect(h.runtime.syncMarisonEmployees(manualReq())).rejects.toMatchObject({
      message: "Konfigurasi sinkronisasi karyawan belum lengkap.",
      status: 503,
    });
    expect(h.deps.readJsonBody).not.toHaveBeenCalled();
    expect(h.deps.getMarisonEmployeeSyncSource).not.toHaveBeenCalled();
    expect(h.deps.executeMarisonEmployeeSync).not.toHaveBeenCalled();
  });

  it("password terlalu pendek -> 503", async () => {
    setPassword("short");
    await expect(h.runtime.syncMarisonEmployees(manualReq())).rejects.toMatchObject({ status: 503 });
  });

  it("infra non-staging -> error diteruskan sebelum password/confirm", async () => {
    const err = Object.assign(new Error("Sinkronisasi karyawan external hanya tersedia di staging."), { status: 403 });
    vi.mocked(h.deps.assertMarisonEmployeeSyncInfraAvailable).mockImplementation(() => { throw err; });
    await expect(h.runtime.syncMarisonEmployees(manualReq())).rejects.toMatchObject({ status: 403 });
    expect(h.deps.readJsonBody).not.toHaveBeenCalled();
    expect(h.deps.getMarisonEmployeeSyncSource).not.toHaveBeenCalled();
  });

  it("same-origin ditolak -> 403", async () => {
    const err = Object.assign(new Error("Origin request ditolak."), { status: 403 });
    vi.mocked(h.deps.assertSameOrigin).mockImplementation(() => { throw err; });
    await expect(h.runtime.syncMarisonEmployees(manualReq())).rejects.toMatchObject({ status: 403 });
    expect(h.deps.getMarisonEmployeeSyncSource).not.toHaveBeenCalled();
  });

  it("confirm gagal -> 400 sebelum source", async () => {
    vi.mocked(h.deps.readJsonBody).mockResolvedValue({ confirm: false });
    await expect(h.runtime.syncMarisonEmployees(manualReq())).rejects.toMatchObject({
      message: "Konfirmasi sinkronisasi diperlukan.",
      status: 400,
    });
    expect(h.deps.getMarisonEmployeeSyncSource).not.toHaveBeenCalled();
  });
});

// --- 9/10: cron ---

describe("syncMarisonDirectoryFromCron", () => {
  const cronReq = (token?: string) => ({
    headers: { host: "sigap.test", "x-internal-sync-token": token ?? CRON_TOKEN },
  });

  it("menjalankan directory lalu projects dengan kedua lock dan metadata cron", async () => {
    const result = await h.runtime.syncMarisonDirectoryFromCron(cronReq());
    expect(h.order).toEqual([
      "assertEmployeeInfra",
      "assertEmployeeInfra",
      "getSupabase",
      "source:employee",
      "tracked:directory",
      "execute:employee",
      "source:projects",
      "tracked:projects",
      "execute:projects",
    ]);
    const metas = vi.mocked(h.deps.runTrackedMarisonSync).mock.calls.map((c) => c[0]);
    expect(metas[0]).toMatchObject({ scope: "directory", triggerType: "cron", environment: "staging" });
    expect(metas[0].initiatedBy).toBeUndefined();
    expect(metas[1]).toMatchObject({ scope: "projects", triggerType: "cron", environment: "staging" });
    expect(result).toMatchObject({ status: "success" });
    expect(result).toHaveProperty("directory");
    expect(result).toHaveProperty("projects");
  });

  it.each([
    ["success", "success", "success"],
    ["success", "partial", "partial"],
    ["partial", "success", "partial"],
    ["partial", "partial", "partial"],
  ] as const)("directory=%s projects=%s -> status=%s", async (directoryStatus, projectStatus, expected) => {
    vi.mocked(h.deps.runTrackedMarisonSync)
      .mockResolvedValueOnce({ runId: "d", status: directoryStatus })
      .mockResolvedValueOnce({ runId: "p", status: projectStatus });
    const result = await h.runtime.syncMarisonDirectoryFromCron(cronReq());
    expect(result.status).toBe(expected);
    expect(result.directory).toMatchObject({ status: directoryStatus });
    expect(result.projects).toMatchObject({ status: projectStatus });
  });

  it("cron token salah -> 401 sebelum password/source", async () => {
    await expect(h.runtime.syncMarisonDirectoryFromCron(cronReq("wrong-token"))).rejects.toMatchObject({
      message: "Unauthorized",
      status: 401,
    });
    expect(h.deps.getMarisonEmployeeSyncSource).not.toHaveBeenCalled();
    expect(h.deps.runTrackedMarisonSync).not.toHaveBeenCalled();
  });

  it("cron token kosong -> 401", async () => {
    await expect(h.runtime.syncMarisonDirectoryFromCron({ headers: {} })).rejects.toMatchObject({ status: 401 });
  });

  it("cron token boot terlalu pendek -> 503 sebelum compare", async () => {
    h.deps.cronToken = "short";
    await expect(h.runtime.syncMarisonDirectoryFromCron(cronReq())).rejects.toMatchObject({
      message: "Layanan sinkronisasi tidak tersedia.",
      status: 503,
    });
    expect(h.deps.getMarisonEmployeeSyncSource).not.toHaveBeenCalled();
  });

  it("infra gagal -> error sebelum token check", async () => {
    const err = Object.assign(new Error("Layanan sinkronisasi tidak tersedia."), { status: 500 });
    vi.mocked(h.deps.assertMarisonEmployeeSyncInfraAvailable).mockImplementation(() => { throw err; });
    await expect(h.runtime.syncMarisonDirectoryFromCron(cronReq("wrong"))).rejects.toBe(err);
  });

  it("password hilang -> 503 sebelum source", async () => {
    setPassword("");
    await expect(h.runtime.syncMarisonDirectoryFromCron(cronReq())).rejects.toMatchObject({
      message: "Konfigurasi sinkronisasi karyawan belum lengkap.",
      status: 503,
    });
    expect(h.deps.getMarisonEmployeeSyncSource).not.toHaveBeenCalled();
  });

  it("error pada project sync tetap melepas kedua lock", async () => {
    const boom = new Error("project tracker boom");
    vi.mocked(h.deps.runTrackedMarisonSync)
      .mockResolvedValueOnce({ runId: "d", status: "success" })
      .mockRejectedValueOnce(boom);
    await expect(h.runtime.syncMarisonDirectoryFromCron(cronReq())).rejects.toBe(boom);
    // Lock harus bebas: manual employee berikutnya tidak 409.
    await expect(h.runtime.syncMarisonEmployees(manualReq())).resolves.toBeDefined();
  });
});

// --- 6/7/8: concurrency & lock ---

describe("concurrency & lock", () => {
  it("same-scope branch dua request bersamaan -> 409", async () => {
    const gate = deferred<unknown[]>();
    vi.mocked(h.deps.getMarisonBranchSyncSource).mockReturnValueOnce(gate.promise);
    const first = h.runtime.syncMarisonBranches(manualReq());
    await waitFor(() => vi.mocked(h.deps.getMarisonBranchSyncSource).mock.calls.length === 1);
    await expect(h.runtime.syncMarisonBranches(manualReq())).rejects.toMatchObject({
      message: "Sinkronisasi data external sedang berjalan.",
      status: 409,
    });
    gate.resolve([{ id: "b1" }]);
    await expect(first).resolves.toBeDefined();
  });

  it.each([
    ["branches", "projects"],
    ["branches", "directory"],
    ["projects", "branches"],
    ["projects", "directory"],
    ["directory", "branches"],
    ["directory", "projects"],
  ] as const)("cross-scope %s in-flight -> %s 409", async (held, attempted) => {
    const gate = deferred<unknown>();
    const holdHandler = () => {
      if (held === "branches") {
        vi.mocked(h.deps.getMarisonBranchSyncSource).mockReturnValueOnce(gate.promise as Promise<unknown[]>);
        return h.runtime.syncMarisonBranches(manualReq());
      }
      if (held === "projects") {
        vi.mocked(h.deps.getMarisonProjectSyncSource).mockReturnValueOnce(gate.promise as never);
        return h.runtime.syncMarisonProjects(manualReq());
      }
      vi.mocked(h.deps.getMarisonEmployeeSyncSource).mockReturnValueOnce(gate.promise as never);
      return h.runtime.syncMarisonEmployees(manualReq());
    };
    const attemptHandler = () => {
      if (attempted === "branches") return h.runtime.syncMarisonBranches(manualReq());
      if (attempted === "projects") return h.runtime.syncMarisonProjects(manualReq());
      return h.runtime.syncMarisonEmployees(manualReq());
    };
    const pending = holdHandler();
    const sourceMock = held === "branches"
      ? h.deps.getMarisonBranchSyncSource
      : held === "projects" ? h.deps.getMarisonProjectSyncSource : h.deps.getMarisonEmployeeSyncSource;
    await waitFor(() => vi.mocked(sourceMock).mock.calls.length === 1);

    await expect(attemptHandler()).rejects.toMatchObject({
      message: "Sinkronisasi data external sedang berjalan.",
      status: 409,
    });

    gate.resolve(held === "branches" ? [{ id: "b1" }] : held === "projects"
      ? { branches: [], projects: [] }
      : { branches: [], employees: [] });
    await expect(pending).resolves.toBeDefined();
  });

  it("lock tetap aktif selama promise pending (bukan hanya sesaat)", async () => {
    const gate = deferred<unknown[]>();
    vi.mocked(h.deps.getMarisonBranchSyncSource).mockReturnValueOnce(gate.promise);
    const pending = h.runtime.syncMarisonBranches(manualReq());
    await waitFor(() => vi.mocked(h.deps.getMarisonBranchSyncSource).mock.calls.length === 1);
    for (let i = 0; i < 3; i += 1) {
      await flush();
      await expect(h.runtime.syncMarisonBranches(manualReq())).rejects.toMatchObject({ status: 409 });
    }
    gate.resolve([{ id: "b1" }]);
    await pending;
  });

  it("lock dilepas setelah success", async () => {
    await h.runtime.syncMarisonBranches(manualReq());
    await expect(h.runtime.syncMarisonBranches(manualReq())).resolves.toBeDefined();
    expect(vi.mocked(h.deps.getMarisonBranchSyncSource)).toHaveBeenCalledTimes(2);
  });

  it("lock dilepas setelah source rejection", async () => {
    const boom = Object.assign(new Error("source boom"), { status: 502 });
    vi.mocked(h.deps.getMarisonBranchSyncSource).mockRejectedValueOnce(boom);
    await expect(h.runtime.syncMarisonBranches(manualReq())).rejects.toBe(boom);
    await expect(h.runtime.syncMarisonBranches(manualReq())).resolves.toBeDefined();
  });

  it("lock dilepas setelah tracker rejection", async () => {
    const boom = Object.assign(new Error("tracker boom"), { status: 500 });
    vi.mocked(h.deps.runTrackedMarisonSync).mockRejectedValueOnce(boom);
    await expect(h.runtime.syncMarisonProjects(manualReq())).rejects.toBe(boom);
    await expect(h.runtime.syncMarisonProjects(manualReq())).resolves.toBeDefined();
  });

  it("lock dilepas setelah executor rejection", async () => {
    const boom = new Error("executor boom");
    vi.mocked(h.deps.executeMarisonEmployeeSync).mockImplementationOnce(() => { throw boom; });
    await expect(h.runtime.syncMarisonEmployees(manualReq())).rejects.toBe(boom);
    await expect(h.runtime.syncMarisonEmployees(manualReq())).resolves.toBeDefined();
  });

  it("cron mengunci employee+project selama pending", async () => {
    const gate = deferred<unknown>();
    vi.mocked(h.deps.getMarisonEmployeeSyncSource).mockReturnValueOnce(gate.promise as never);
    const cron = h.runtime.syncMarisonDirectoryFromCron({ headers: { "x-internal-sync-token": CRON_TOKEN } });
    await waitFor(() => vi.mocked(h.deps.getMarisonEmployeeSyncSource).mock.calls.length === 1);
    await expect(h.runtime.syncMarisonProjects(manualReq())).rejects.toMatchObject({ status: 409 });
    await expect(h.runtime.syncMarisonEmployees(manualReq())).rejects.toMatchObject({ status: 409 });
    await expect(h.runtime.syncMarisonBranches(manualReq())).rejects.toMatchObject({ status: 409 });
    gate.resolve({ branches: [], employees: [] });
    await cron;
  });
});

// --- 11: errors forwarded unwrapped ---

describe("error passthrough", () => {
  it("source error diteruskan tanpa dibungkus", async () => {
    const boom = Object.assign(new Error("source boom"), { status: 502 });
    vi.mocked(h.deps.getMarisonProjectSyncSource).mockRejectedValueOnce(boom);
    await expect(h.runtime.syncMarisonProjects(manualReq())).rejects.toBe(boom);
  });

  it("tracker error diteruskan tanpa dibungkus", async () => {
    const boom = Object.assign(new Error("tracker boom"), { status: 409 });
    vi.mocked(h.deps.runTrackedMarisonSync).mockRejectedValueOnce(boom);
    await expect(h.runtime.syncMarisonEmployees(manualReq())).rejects.toBe(boom);
  });

  it("executor error diteruskan tanpa dibungkus", async () => {
    const boom = Object.assign(new Error("executor boom"), { status: 422 });
    vi.mocked(h.deps.executeMarisonBranchSync).mockImplementationOnce(() => { throw boom; });
    await expect(h.runtime.syncMarisonBranches(manualReq())).rejects.toBe(boom);
  });

  it("cron directory error diteruskan dan tidak menjalankan projects", async () => {
    const boom = Object.assign(new Error("directory boom"), { status: 500 });
    vi.mocked(h.deps.executeMarisonEmployeeSync).mockImplementationOnce(() => { throw boom; });
    await expect(
      h.runtime.syncMarisonDirectoryFromCron({ headers: { "x-internal-sync-token": CRON_TOKEN } }),
    ).rejects.toBe(boom);
    expect(h.deps.getMarisonProjectSyncSource).not.toHaveBeenCalled();
    expect(h.deps.runTrackedMarisonSync).toHaveBeenCalledTimes(1);
  });
});

// --- 12: no source/executor before auth/config/confirm ---

describe("fail-closed ordering", () => {
  it("tidak ada source/executor saat confirm gagal di semua handler manual", async () => {
    vi.mocked(h.deps.readJsonBody).mockResolvedValue({ confirm: false });
    await expect(h.runtime.syncMarisonBranches(manualReq())).rejects.toMatchObject({ status: 400 });
    await expect(h.runtime.syncMarisonProjects(manualReq())).rejects.toMatchObject({ status: 400 });
    await expect(h.runtime.syncMarisonEmployees(manualReq())).rejects.toMatchObject({ status: 400 });
    expect(h.deps.getMarisonBranchSyncSource).not.toHaveBeenCalled();
    expect(h.deps.getMarisonProjectSyncSource).not.toHaveBeenCalled();
    expect(h.deps.getMarisonEmployeeSyncSource).not.toHaveBeenCalled();
    expect(h.deps.runTrackedMarisonSync).not.toHaveBeenCalled();
    expect(h.deps.executeMarisonBranchSync).not.toHaveBeenCalled();
    expect(h.deps.executeMarisonProjectSync).not.toHaveBeenCalled();
    expect(h.deps.executeMarisonEmployeeSync).not.toHaveBeenCalled();
  });

  it("tidak ada source/executor saat auth gagal di semua handler manual", async () => {
    vi.mocked(h.deps.requireAdminUser).mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));
    await expect(h.runtime.syncMarisonBranches(manualReq())).rejects.toBeDefined();
    await expect(h.runtime.syncMarisonProjects(manualReq())).rejects.toBeDefined();
    await expect(h.runtime.syncMarisonEmployees(manualReq())).rejects.toBeDefined();
    expect(h.deps.runTrackedMarisonSync).not.toHaveBeenCalled();
    expect(h.deps.executeMarisonBranchSync).not.toHaveBeenCalled();
    expect(h.deps.executeMarisonProjectSync).not.toHaveBeenCalled();
    expect(h.deps.executeMarisonEmployeeSync).not.toHaveBeenCalled();
  });
});

// --- 13: validated reference stays after await ---

describe("validated reference stability", () => {
  it("client tervalidasi sebelum await tetap dipakai executor meski getSupabase berubah", async () => {
    const clientA = fakeClient("A");
    const clientB = fakeClient("B");
    vi.mocked(h.deps.getSupabase).mockReturnValue(clientA);
    vi.mocked(h.deps.getMarisonBranchSyncSource).mockImplementationOnce(async () => {
      vi.mocked(h.deps.getSupabase).mockReturnValue(clientB);
      return [{ id: "b1" }];
    });
    await h.runtime.syncMarisonBranches(manualReq());
    const meta = vi.mocked(h.deps.runTrackedMarisonSync).mock.calls[0][0];
    expect(meta.supabase).toBe(clientA);
    expect(h.deps.executeMarisonBranchSync).toHaveBeenCalledWith(expect.objectContaining({ supabase: clientA }));
  });

  it("password tervalidasi sebelum await tetap dipakai executor meski env berubah", async () => {
    const readEnv = vi.fn((name: string) => (name === "STAGING_DEFAULT_USER_PASSWORD" ? VALID_PASSWORD : undefined));
    h.deps.readEnv = readEnv;
    vi.mocked(h.deps.getMarisonEmployeeSyncSource).mockImplementationOnce(async () => {
      readEnv.mockReturnValue("changed-password-999");
      return { branches: [], employees: [] };
    });
    await h.runtime.syncMarisonEmployees(manualReq());
    expect(h.deps.executeMarisonEmployeeSync).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPassword: VALID_PASSWORD }),
    );
  });
});

// --- default password helper ---

describe("marisonDefaultPassword", () => {
  it("mengembalikan null untuk nilai kosong atau terlalu pendek", () => {
    setPassword("");
    expect(h.runtime.marisonDefaultPassword()).toBeNull();
    setPassword("short");
    expect(h.runtime.marisonDefaultPassword()).toBeNull();
    setPassword(VALID_PASSWORD);
    expect(h.runtime.marisonDefaultPassword()).toBe(VALID_PASSWORD);
  });
});

// --- 14: overrides/reset isolation ---

describe("overrides & reset", () => {
  it("setDependencies mengganti tracker/executor dan resetOverrides memulihkan", async () => {
    const trackerOverride = vi.fn(async () => ({ runId: "ov", status: "success" }));
    h.runtime.setDependencies({ runTrackedMarisonSync: trackerOverride });
    await h.runtime.syncMarisonBranches(manualReq());
    expect(trackerOverride).toHaveBeenCalledTimes(1);
    expect(h.deps.runTrackedMarisonSync).not.toHaveBeenCalled();

    h.runtime.resetOverrides();
    vi.mocked(h.deps.getMarisonBranchSyncSource).mockResolvedValue([{ id: "b1" }]);
    await h.runtime.syncMarisonBranches(manualReq());
    expect(trackerOverride).toHaveBeenCalledTimes(1);
    expect(h.deps.runTrackedMarisonSync).toHaveBeenCalledTimes(1);
  });

  it("fails loudly di luar test env", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => h.runtime.setDependencies({})).toThrow("Test dependencies can only be set in test environment.");
    expect(() => h.runtime.resetOverrides()).toThrow("Test dependencies can only be reset in test environment.");
  });

  it("tidak ada leak state antar test (lock bersih di awal)", async () => {
    // Test sebelumnya tidak meninggalkan lock; request baru sukses.
    await expect(h.runtime.syncMarisonBranches(manualReq())).resolves.toBeDefined();
  });
});

// --- 15/16: no real network / no real DB write ---

describe("fail-closed infra", () => {
  it("fetch global selalu throw dan tidak pernah dipakai", async () => {
    await h.runtime.syncMarisonBranches(manualReq());
    await h.runtime.syncMarisonProjects(manualReq());
    await h.runtime.syncMarisonEmployees(manualReq());
    await h.runtime.syncMarisonDirectoryFromCron({ headers: { "x-internal-sync-token": CRON_TOKEN } });
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
    expect(h.client.from).not.toHaveBeenCalled();
    expect(h.client.rpc).not.toHaveBeenCalled();
  });
});
