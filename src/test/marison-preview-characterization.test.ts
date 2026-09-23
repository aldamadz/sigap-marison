import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  stubRuntimeEnv,
  unstubRuntimeEnv,
  bootDomainRuntime,
  closeApp,
  type BootedRuntime,
} from "./harness/domain-runtime-harness";

let booted: BootedRuntime | null = null;

beforeEach(async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
    throw new Error("Network request explicitly forbidden in this test.");
  }));
  stubRuntimeEnv(vi);
  booted = await bootDomainRuntime();
});

afterEach(async () => {
  await closeApp(booted);
  booted = null;
  unstubRuntimeEnv(vi);
  vi.unstubAllGlobals();
});

const createMockSupabase = (role: string) => ({
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" } }, error: null }),
    admin: {
      listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
    },
  },
  from: vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { role, is_active: true, deleted_at: null }, error: null }),
      };
    }
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  }),
  rpc: vi.fn(),
});

describe("Marison Preview Characterization", () => {
  it("preview employee tanpa auth -> 401, source tidak dipanggil", async () => {
    const sourceSpy = vi.fn();
    booted!.runtime.setDomainRuntimeDependenciesForTest({
      getMarisonEmployeeSyncSource: sourceSpy,
    });
    const res = await booted!.app.inject({
      method: "GET",
      url: "/api/integrations/marison/employees/preview",
    });
    expect(res.statusCode).toBe(401);
    expect(sourceSpy).not.toHaveBeenCalled();
  });

  it("preview branch tanpa auth -> 401, source tidak dipanggil", async () => {
    const sourceSpy = vi.fn();
    booted!.runtime.setDomainRuntimeDependenciesForTest({
      getMarisonBranchSyncSource: sourceSpy,
    });
    const res = await booted!.app.inject({
      method: "GET",
      url: "/api/integrations/marison/branches/preview",
    });
    expect(res.statusCode).toBe(401);
    expect(sourceSpy).not.toHaveBeenCalled();
  });

  it("preview project tanpa auth -> 401, source tidak dipanggil", async () => {
    const sourceSpy = vi.fn();
    booted!.runtime.setDomainRuntimeDependenciesForTest({
      getMarisonProjectSyncSource: sourceSpy,
    });
    const res = await booted!.app.inject({
      method: "GET",
      url: "/api/integrations/marison/projects/preview",
    });
    expect(res.statusCode).toBe(401);
    expect(sourceSpy).not.toHaveBeenCalled();
  });

  it("non-admin -> 403", async () => {
    booted!.runtime.setDomainRuntimeDependenciesForTest({
      supabase: createMockSupabase("user"),
    });
    const res = await booted!.app.inject({
      method: "GET",
      url: "/api/integrations/marison/branches/preview",
      headers: { authorization: "Bearer fake-token" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("admin employee/branch/project -> 200", async () => {
    booted!.runtime.setDomainRuntimeDependenciesForTest({
      supabase: createMockSupabase("admin"),
      getMarisonEmployeeSyncSource: async () => ({ branches: [], employees: [] }),
      getMarisonProjectSyncSource: async () => ({ branches: [], projects: [] }),
      getMarisonBranchSyncSource: async () => [],
    });

    const r1 = await booted!.app.inject({
      method: "GET",
      url: "/api/integrations/marison/employees/preview",
      headers: { authorization: "Bearer fake-token" },
    });
    expect(r1.statusCode).toBe(200);

    const r2 = await booted!.app.inject({
      method: "GET",
      url: "/api/integrations/marison/branches/preview",
      headers: { authorization: "Bearer fake-token" },
    });
    expect(r2.statusCode).toBe(200);

    const r3 = await booted!.app.inject({
      method: "GET",
      url: "/api/integrations/marison/projects/preview",
      headers: { authorization: "Bearer fake-token" },
    });
    expect(r3.statusCode).toBe(200);
  });

  it("source error diteruskan dengan status/message yang sama", async () => {
    booted!.runtime.setDomainRuntimeDependenciesForTest({
      supabase: createMockSupabase("admin"),
      getMarisonEmployeeSyncSource: async () => {
        const err = new Error("Source error");
        Object.assign(err, { status: 502 });
        throw err;
      },
    });
    const res = await booted!.app.inject({
      method: "GET",
      url: "/api/integrations/marison/employees/preview",
      headers: { authorization: "Bearer fake-token" },
    });
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.payload).error).toBe("Source error");
  });

  it("tidak ada mutation sync yang dipanggil", async () => {
    const mockDb = createMockSupabase("admin");
    booted!.runtime.setDomainRuntimeDependenciesForTest({
      supabase: mockDb,
      getMarisonEmployeeSyncSource: async () => ({ branches: [], employees: [] }),
    });
    await booted!.app.inject({
      method: "GET",
      url: "/api/integrations/marison/employees/preview",
      headers: { authorization: "Bearer fake-token" },
    });
    expect(mockDb.rpc).not.toHaveBeenCalled();
  });
});
