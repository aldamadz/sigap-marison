import { createHash } from "node:crypto";
import type { LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bootDomainRuntime,
  closeApp,
  fetchCalls,
  stubRuntimeEnv,
  unstubRuntimeEnv,
  type BootedRuntime,
} from "./harness/domain-runtime-harness";

// Top-level mock only (Vitest 4): replaces executors/tracker with spies so no
// real vendor call, DB write, or sync run can occur through the route.
const mocks = vi.hoisted(() => ({
  executeBranch: vi.fn(),
  executeProject: vi.fn(),
  executeEmployee: vi.fn(),
  tracked: vi.fn(),
}));

vi.mock("../../server/marison-employee-sync.mjs", async (original) => ({
  ...await original<object>(),
  executeMarisonBranchSync: mocks.executeBranch,
  executeMarisonProjectSync: mocks.executeProject,
  executeMarisonEmployeeSync: mocks.executeEmployee,
  runTrackedMarisonSync: mocks.tracked,
}));

const PASSWORD = "staging-password-123456";

let booted: BootedRuntime;
let token: string;
let databaseCalls: string[];

const bearer = "test-bearer-token";

beforeEach(async () => {
  vi.clearAllMocks();
  stubRuntimeEnv(vi);
  vi.stubEnv("STAGING_DEFAULT_USER_PASSWORD", PASSWORD);
  vi.stubEnv("MARISON_SYNC_CRON_TOKEN", "");
  token = "";
  databaseCalls = [];

  mocks.executeBranch.mockResolvedValue({ branches: 3, failed: 0 });
  mocks.executeProject.mockResolvedValue({ projects: 2, failed: 0 });
  mocks.executeEmployee.mockResolvedValue({ employees: 5, failed: 0 });
  mocks.tracked.mockImplementation(async ({ operation }: { operation: () => unknown }) => {
    const result = await operation();
    const record = (result ?? {}) as { failed?: unknown; errors?: unknown[] };
    const issues = Array.isArray(record.errors) ? record.errors : [];
    const status = Number(record.failed || 0) > 0 || issues.length > 0 ? "partial" : "success";
    return { ...(result as Record<string, unknown>), runId: "run-id", status };
  });

  booted = await bootRuntime();
}, 30000);

const bootRuntime = async () => {
  const session = "test-session-secret-at-least-32-characters-long";
  vi.stubEnv("SESSION_SECRET", session);
  token = createHash("sha256").update(`marison-directory-sync:${session}`).digest("hex");
  const bootedRuntime = await bootDomainRuntime();
  bootedRuntime.runtime.setDomainRuntimeDependenciesForTest({
    supabase: {
      auth: { getUser: async (supplied: string) => supplied === bearer
        ? { data: { user: { id: "admin-id" } }, error: null }
        : { data: { user: null }, error: { message: "Unauthorized" } } },
      from: (table: string) => {
        databaseCalls.push(table);
        if (table !== "profiles") throw new Error("FAIL-CLOSED: unexpected database dependency");
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { role: "admin", is_active: true, deleted_at: null }, error: null,
        }) }) }) };
      },
      rpc: () => { throw new Error("FAIL-CLOSED: unexpected RPC"); },
    },
    getMarisonBranchSyncSource: async () => [{ id: "b1" }],
    getMarisonProjectSyncSource: async () => ({ branches: [{ id: "b1" }], projects: [{ id: "p1" }] }),
    getMarisonEmployeeSyncSource: async () => ({ branches: [{ id: "b1" }], employees: [{ id: "e1" }] }),
  });
  return bootedRuntime;
};

afterEach(async () => {
  expect(fetchCalls).toEqual([]);
  await closeApp(booted);
  unstubRuntimeEnv(vi);
});

const headers = (kind: "manual" | "cron", auth?: string) => ({
  host: "sigap.test",
  origin: "https://sigap.test",
  ...(kind === "cron"
    ? (auth ? { "x-internal-sync-token": auth } : {})
    : (auth ? { authorization: `Bearer ${auth}` } : {})),
});

const post = async (
  url: string,
  kind: "manual" | "cron",
  auth?: string,
  payload: Record<string, unknown> = { confirm: true },
): Promise<LightMyRequestResponse> => booted.app.inject({ method: "POST", url, headers: headers(kind, auth), payload });

const BRANCH = "/api/integrations/marison/branches/sync";
const PROJECT = "/api/integrations/marison/projects/sync";
const EMPLOYEE = "/api/integrations/marison/employees/sync";
const CRON = "/api/internal/marison/directory-sync";

const noMutation = () => {
  expect(mocks.tracked).not.toHaveBeenCalled();
  expect(mocks.executeBranch).not.toHaveBeenCalled();
  expect(mocks.executeProject).not.toHaveBeenCalled();
  expect(mocks.executeEmployee).not.toHaveBeenCalled();
};

describe("Marison Sync Route Characterization", () => {
  it("tanpa auth -> 401 di ketiga route manual, tanpa mutasi", async () => {
    expect((await post(BRANCH, "manual")).statusCode).toBe(401);
    expect((await post(PROJECT, "manual")).statusCode).toBe(401);
    expect((await post(EMPLOYEE, "manual")).statusCode).toBe(401);
    noMutation();
  });

  it("non-admin -> 403 di ketiga route manual", async () => {
    booted.runtime.setDomainRuntimeDependenciesForTest({
      supabase: {
        auth: { getUser: async () => ({ data: { user: { id: "admin-id" } }, error: null }) },
        from: (table: string) => {
          databaseCalls.push(table);
          if (table !== "profiles") throw new Error("FAIL-CLOSED");
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({
            data: { role: "user", is_active: true, deleted_at: null }, error: null,
          }) }) }) };
        },
        rpc: () => { throw new Error("FAIL-CLOSED"); },
      },
    });
    expect((await post(BRANCH, "manual", bearer)).statusCode).toBe(403);
    expect((await post(PROJECT, "manual", bearer)).statusCode).toBe(403);
    expect((await post(EMPLOYEE, "manual", bearer)).statusCode).toBe(403);
    noMutation();
  });

  it("confirm bukan true -> 400 dengan message identik", async () => {
    const branch = await post(BRANCH, "manual", bearer, { confirm: false });
    expect(branch.statusCode).toBe(400);
    expect(branch.json().error).toBe("Konfirmasi sinkronisasi diperlukan.");

    const project = await post(PROJECT, "manual", bearer, { confirm: false });
    expect(project.statusCode).toBe(400);
    expect(project.json().error).toBe("Konfirmasi sinkronisasi proyek wajib dikirim.");

    const employee = await post(EMPLOYEE, "manual", bearer, { confirm: false });
    expect(employee.statusCode).toBe(400);
    expect(employee.json().error).toBe("Konfirmasi sinkronisasi diperlukan.");
    noMutation();
  });

  it("cross-site origin ditolak sebelum mutasi", async () => {
    const res = await booted.app.inject({
      method: "POST",
      url: EMPLOYEE,
      headers: { host: "sigap.test", origin: "https://evil.test", authorization: `Bearer ${bearer}` },
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(403);
    noMutation();
  });

  it("branch manual admin -> 200 dan memakai metadata tracked yang benar", async () => {
    const res = await post(BRANCH, "manual", bearer);
    expect(res.statusCode).toBe(200);
    expect(mocks.tracked).toHaveBeenCalledTimes(1);
    const meta = mocks.tracked.mock.calls[0][0];
    expect(meta).toMatchObject({ triggerType: "manual", scope: "branches", initiatedBy: "admin-id", environment: "staging" });
    expect(mocks.executeBranch).toHaveBeenCalledWith(expect.objectContaining({ branches: [{ id: "b1" }] }));
    expect(res.json()).toMatchObject({ runId: "run-id", status: "success" });
    expect(databaseCalls.every((t) => t === "profiles")).toBe(true);
  });

  it("project manual admin -> 200 meski handler tidak memanggil assertSameOrigin (dijaga dispatcher)", async () => {
    const res = await post(PROJECT, "manual", bearer);
    expect(res.statusCode).toBe(200);
    const meta = mocks.tracked.mock.calls[0][0];
    expect(meta).toMatchObject({ scope: "projects", initiatedBy: "admin-id" });
    expect(mocks.executeProject).toHaveBeenCalledTimes(1);
  });

  it("cross-site origin ditolak global untuk semua POST /api", async () => {
    const res = await booted.app.inject({
      method: "POST",
      url: PROJECT,
      headers: { host: "sigap.test", origin: "https://evil.test", authorization: `Bearer ${bearer}` },
      payload: { confirm: true },
    });
    expect(res.statusCode).toBe(403);
    noMutation();
  });

  it("employee manual admin -> 200 dengan defaultPassword dari env", async () => {
    const res = await post(EMPLOYEE, "manual", bearer);
    expect(res.statusCode).toBe(200);
    const meta = mocks.tracked.mock.calls[0][0];
    expect(meta).toMatchObject({ scope: "directory", initiatedBy: "admin-id" });
    expect(mocks.executeEmployee).toHaveBeenCalledWith(expect.objectContaining({ defaultPassword: PASSWORD }));
  });

  it("employee manual tanpa password -> 503 sebelum mutasi", async () => {
    vi.stubEnv("STAGING_DEFAULT_USER_PASSWORD", "");
    const res = await post(EMPLOYEE, "manual", bearer);
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("Konfigurasi sinkronisasi karyawan belum lengkap.");
    noMutation();
  });

  it("cron tanpa token -> 401 sebelum mutasi", async () => {
    const res = await post(CRON, "cron");
    expect(res.statusCode).toBe(401);
    noMutation();
  });

  it("cron token salah -> 401", async () => {
    const res = await post(CRON, "cron", "wrong-token-value-that-is-long-enough-000");
    expect(res.statusCode).toBe(401);
    noMutation();
  });

  it("cron token benar -> 200 directory lalu projects, combined status", async () => {
    const res = await post(CRON, "cron", token);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ status: "success" });
    expect(body).toHaveProperty("directory");
    expect(body).toHaveProperty("projects");
    expect(mocks.tracked).toHaveBeenCalledTimes(2);
    expect(mocks.tracked.mock.calls[0][0]).toMatchObject({ triggerType: "cron", scope: "directory" });
    expect(mocks.tracked.mock.calls[1][0]).toMatchObject({ triggerType: "cron", scope: "projects" });
    expect(mocks.executeEmployee).toHaveBeenCalledTimes(1);
    expect(mocks.executeProject).toHaveBeenCalledTimes(1);
  });

  it("cron partial -> status partial", async () => {
    mocks.executeEmployee.mockResolvedValue({ employees: 5, failed: 1 });
    const res = await post(CRON, "cron", token);
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("partial");
  });

  it("tracker error 409 diteruskan sebagai 409", async () => {
    mocks.tracked.mockRejectedValueOnce(Object.assign(new Error("Sinkronisasi data external sedang berjalan."), { status: 409 }));
    const res = await post(BRANCH, "manual", bearer);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("Sinkronisasi data external sedang berjalan.");
  });

  it("executor error diteruskan tanpa wrapping", async () => {
    mocks.executeProject.mockRejectedValueOnce(Object.assign(new Error("Project sync gagal"), { status: 422 }));
    const res = await post(PROJECT, "manual", bearer);
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("Project sync gagal");
  });

  it("concurrent same-scope -> salah satu 409", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    mocks.tracked.mockImplementationOnce(async ({ operation }: { operation: () => unknown }) => {
      await gate;
      const result = await operation();
      return { ...(result as Record<string, unknown>), runId: "run-id", status: "success" };
    });

    const first = post(PROJECT, "manual", bearer);
    await new Promise((resolve) => setImmediate(resolve));
    const second = await post(PROJECT, "manual", bearer);
    expect(second.statusCode).toBe(409);
    release();
    const firstRes = await first;
    expect(firstRes.statusCode).toBe(200);
  });

  it("cron mengunci employee+project terhadap manual", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    mocks.tracked.mockImplementationOnce(async ({ operation }: { operation: () => unknown }) => {
      await gate;
      const result = await operation();
      return { ...(result as Record<string, unknown>), runId: "run-id", status: "success" };
    });

    const cron = post(CRON, "cron", token);
    await new Promise((resolve) => setImmediate(resolve));
    expect((await post(PROJECT, "manual", bearer)).statusCode).toBe(409);
    expect((await post(EMPLOYEE, "manual", bearer)).statusCode).toBe(409);
    release();
    expect((await cron).statusCode).toBe(200);
  });

  it("tidak ada request vendor dalam bentuk apa pun", async () => {
    await post(BRANCH, "manual", bearer);
    await post(PROJECT, "manual", bearer);
    await post(EMPLOYEE, "manual", bearer);
    await post(CRON, "cron", token);
    expect(fetchCalls).toEqual([]);
  });
});
