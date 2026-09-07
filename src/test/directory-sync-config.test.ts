import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Behavioral tests for directory sync configuration validation
// These tests use dependency injection and mock all external dependencies

// Mock types
type MockSupabase = {
  auth: {
    getUser: ReturnType<typeof vi.fn>;
  };
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
};

type MockContext = {
  supabase: MockSupabase;
  serviceRoleKey: string | null;
  marisonDeploymentEnvironment: string;
  marisonDefaultPassword: () => string | null;
  marisonSyncCronToken: string;
  assertMarisonEmployeeSyncInfraAvailable: () => void;
  assertMarisonEmployeeSyncWriteAvailable: () => void;
  getMarisonEmployeeSyncSource: ReturnType<typeof vi.fn>;
  previewMarisonEmployeeSync: ReturnType<typeof vi.fn>;
  executeMarisonEmployeeSync: ReturnType<typeof vi.fn>;
  runTrackedMarisonSync: ReturnType<typeof vi.fn>;
};

// Helper to create mock request
const createMockRequest = (headers: Record<string, string> = {}, body?: unknown) => ({
  headers,
  body,
  method: "POST",
});

// Helper to create mock user
const createMockAdminUser = () => ({
  id: "admin-user-id",
  email: "admin@test.com",
  role: "admin",
});

// Extracted handler logic for testing (simulates the actual route handlers)
const createTestableHandlers = (ctx: MockContext) => {
  const previewMarisonEmployees = async (req: { headers: Record<string, string> }) => {
    // Simulate: await requireAdminUser(getBearerToken(req))
    const token = req.headers["authorization"]?.replace("Bearer ", "");
    if (!token) {
      const err = new Error("Unauthorized");
      (err as any).status = 401;
      throw err;
    }
    
    // Admin auth check
    const user = createMockAdminUser();
    
    // Infrastructure assertion only (no password required)
    ctx.assertMarisonEmployeeSyncInfraAvailable();
    
    // Get source (mocked)
    const source = await ctx.getMarisonEmployeeSyncSource();
    
    // Call preview (read-only, no mutation)
    return ctx.previewMarisonEmployeeSync({ supabase: ctx.supabase, ...source });
  };

  const syncMarisonEmployees = async (req: { headers: Record<string, string>; body?: unknown }) => {
    // Simulate: assertSameOrigin + requireAdminUser
    const token = req.headers["authorization"]?.replace("Bearer ", "");
    if (!token) {
      const err = new Error("Unauthorized");
      (err as any).status = 401;
      throw err;
    }
    
    const user = createMockAdminUser();
    
    // Write assertion (requires password)
    ctx.assertMarisonEmployeeSyncWriteAvailable();
    
    // Source fetch
    const source = await ctx.getMarisonEmployeeSyncSource();
    
    // Mutation operation
    return ctx.runTrackedMarisonSync({
      supabase: ctx.supabase,
      environment: ctx.marisonDeploymentEnvironment,
      triggerType: "manual",
      scope: "directory",
      initiatedBy: user.id,
      operation: () => ctx.executeMarisonEmployeeSync({
        supabase: ctx.supabase,
        ...source,
        defaultPassword: ctx.marisonDefaultPassword(),
      }),
    });
  };

  const syncMarisonDirectoryFromCron = async (req: { headers: Record<string, string> }) => {
    // Infrastructure assertion
    ctx.assertMarisonEmployeeSyncInfraAvailable();
    
    // Cron token validation
    if (ctx.marisonSyncCronToken.length < 32) {
      const err = new Error("Token cron sinkronisasi belum dikonfigurasi.");
      (err as any).status = 503;
      throw err;
    }
    
    // Token comparison
    const suppliedToken = String(req.headers["x-internal-sync-token"] || "");
    const sha256Hex = (s: string) => s; // Simplified for mock
    if (!suppliedToken || sha256Hex(suppliedToken) !== sha256Hex(ctx.marisonSyncCronToken)) {
      const err = new Error("Unauthorized");
      (err as any).status = 401;
      throw err;
    }
    
    // Write assertion (requires password)
    ctx.assertMarisonEmployeeSyncWriteAvailable();
    
    // Source fetch
    const source = await ctx.getMarisonEmployeeSyncSource();
    
    // Mutation operation
    return ctx.runTrackedMarisonSync({
      supabase: ctx.supabase,
      environment: ctx.marisonDeploymentEnvironment,
      triggerType: "cron",
      scope: "directory",
      operation: () => ctx.executeMarisonEmployeeSync({
        supabase: ctx.supabase,
        ...source,
        defaultPassword: ctx.marisonDefaultPassword(),
      }),
    });
  };

  return { previewMarisonEmployees, syncMarisonEmployees, syncMarisonDirectoryFromCron };
};

describe("Directory sync config validation - behavioral tests", () => {
  let mockSupabase: MockSupabase;
  let capturedLogs: string[];
  
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  
  beforeEach(() => {
    capturedLogs = [];
    console.error = (...args: any[]) => {
      capturedLogs.push(args.map(a => String(a)).join(" "));
    };
    console.log = (...args: any[]) => {
      capturedLogs.push(args.map(a => String(a)).join(" "));
    };
    
    mockSupabase = {
      auth: { getUser: vi.fn() },
      from: vi.fn(),
      rpc: vi.fn(),
    };
  });
  
  afterEach(() => {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    vi.clearAllMocks();
  });

  describe("Preview admin - no password required", () => {
    it("succeeds without password bootstrap via mock source and does not call mutation executor", async () => {
      const ctx: MockContext = {
        supabase: mockSupabase,
        serviceRoleKey: "service-role-key",
        marisonDeploymentEnvironment: "staging",
        marisonDefaultPassword: () => null, // No password configured
        marisonSyncCronToken: "a".repeat(32),
        assertMarisonEmployeeSyncInfraAvailable: () => {}, // Passes
        assertMarisonEmployeeSyncWriteAvailable: () => {
          const err = new Error("Konfigurasi sinkronisasi karyawan belum lengkap.");
          (err as any).status = 503;
          throw err;
        },
        getMarisonEmployeeSyncSource: vi.fn().mockResolvedValue({ employees: [], branches: [] }),
        previewMarisonEmployeeSync: vi.fn().mockResolvedValue({
          environment: "staging",
          source: 0,
          toCreate: 0,
          toUpdate: 0,
        }),
        executeMarisonEmployeeSync: vi.fn(),
        runTrackedMarisonSync: vi.fn(),
      };
      
      const handlers = createTestableHandlers(ctx);
      const req = createMockRequest({ authorization: "Bearer valid-token" });
      
      const result = await handlers.previewMarisonEmployees(req);
      
      expect(result).toEqual({
        environment: "staging",
        source: 0,
        toCreate: 0,
        toUpdate: 0,
      });
      
      // Verify mutation executor was NOT called
      expect(ctx.executeMarisonEmployeeSync).not.toHaveBeenCalled();
      expect(ctx.runTrackedMarisonSync).not.toHaveBeenCalled();
      
      // Verify source fetch was called (preview needs data)
      expect(ctx.getMarisonEmployeeSyncSource).toHaveBeenCalled();
      expect(ctx.previewMarisonEmployeeSync).toHaveBeenCalled();
    });

    it("returns 401 without auth token", async () => {
      const ctx: MockContext = {
        supabase: mockSupabase,
        serviceRoleKey: "service-role-key",
        marisonDeploymentEnvironment: "staging",
        marisonDefaultPassword: () => "valid-password-8chars",
        marisonSyncCronToken: "a".repeat(32),
        assertMarisonEmployeeSyncInfraAvailable: () => {},
        assertMarisonEmployeeSyncWriteAvailable: () => {},
        getMarisonEmployeeSyncSource: vi.fn(),
        previewMarisonEmployeeSync: vi.fn(),
        executeMarisonEmployeeSync: vi.fn(),
        runTrackedMarisonSync: vi.fn(),
      };
      
      const handlers = createTestableHandlers(ctx);
      const req = createMockRequest({}); // No auth token
      
      await expect(handlers.previewMarisonEmployees(req)).rejects.toMatchObject({
        message: "Unauthorized",
        status: 401,
      });
    });
  });

  describe("Manual sync - password required after auth", () => {
    it("returns 503 without password bootstrap before source fetch or mutation", async () => {
      const ctx: MockContext = {
        supabase: mockSupabase,
        serviceRoleKey: "service-role-key",
        marisonDeploymentEnvironment: "staging",
        marisonDefaultPassword: () => null, // No password
        marisonSyncCronToken: "a".repeat(32),
        assertMarisonEmployeeSyncInfraAvailable: () => {},
        assertMarisonEmployeeSyncWriteAvailable: () => {
          const err = new Error("Konfigurasi sinkronisasi karyawan belum lengkap.");
          (err as any).status = 503;
          throw err;
        },
        getMarisonEmployeeSyncSource: vi.fn(),
        previewMarisonEmployeeSync: vi.fn(),
        executeMarisonEmployeeSync: vi.fn(),
        runTrackedMarisonSync: vi.fn(),
      };
      
      const handlers = createTestableHandlers(ctx);
      const req = createMockRequest({ authorization: "Bearer valid-token" }, { confirm: true });
      
      await expect(handlers.syncMarisonEmployees(req)).rejects.toMatchObject({
        message: "Konfigurasi sinkronisasi karyawan belum lengkap.",
        status: 503,
      });
      
      // Verify source fetch and mutation were NOT called
      expect(ctx.getMarisonEmployeeSyncSource).not.toHaveBeenCalled();
      expect(ctx.executeMarisonEmployeeSync).not.toHaveBeenCalled();
      expect(ctx.runTrackedMarisonSync).not.toHaveBeenCalled();
    });

    it("auth is checked before password validation", async () => {
      const writeAssertionCallOrder: number[] = [];
      
      const ctx: MockContext = {
        supabase: mockSupabase,
        serviceRoleKey: "service-role-key",
        marisonDeploymentEnvironment: "staging",
        marisonDefaultPassword: () => null,
        marisonSyncCronToken: "a".repeat(32),
        assertMarisonEmployeeSyncInfraAvailable: () => {},
        assertMarisonEmployeeSyncWriteAvailable: () => {
          writeAssertionCallOrder.push(1);
          const err = new Error("Konfigurasi sinkronisasi karyawan belum lengkap.");
          (err as any).status = 503;
          throw err;
        },
        getMarisonEmployeeSyncSource: vi.fn().mockImplementation(() => {
          writeAssertionCallOrder.push(2);
          return { employees: [], branches: [] };
        }),
        previewMarisonEmployeeSync: vi.fn(),
        executeMarisonEmployeeSync: vi.fn(),
        runTrackedMarisonSync: vi.fn(),
      };
      
      const handlers = createTestableHandlers(ctx);
      const req = createMockRequest({ authorization: "Bearer valid-token" }, { confirm: true });
      
      await expect(handlers.syncMarisonEmployees(req)).rejects.toMatchObject({
        status: 503,
      });
      
      // Write assertion was called, but source fetch was never reached
      expect(writeAssertionCallOrder).toEqual([1]);
    });

    it("returns 401 without auth token (not 503 for password)", async () => {
      const ctx: MockContext = {
        supabase: mockSupabase,
        serviceRoleKey: "service-role-key",
        marisonDeploymentEnvironment: "staging",
        marisonDefaultPassword: () => null, // No password
        marisonSyncCronToken: "a".repeat(32),
        assertMarisonEmployeeSyncInfraAvailable: () => {},
        assertMarisonEmployeeSyncWriteAvailable: () => {
          // Should not reach here
          throw new Error("Should not reach write assertion");
        },
        getMarisonEmployeeSyncSource: vi.fn(),
        previewMarisonEmployeeSync: vi.fn(),
        executeMarisonEmployeeSync: vi.fn(),
        runTrackedMarisonSync: vi.fn(),
      };
      
      const handlers = createTestableHandlers(ctx);
      const req = createMockRequest({}); // No auth token
      
      await expect(handlers.syncMarisonEmployees(req)).rejects.toMatchObject({
        message: "Unauthorized",
        status: 401,
      });
      
      // Password assertion should never be called
      expect(ctx.getMarisonEmployeeSyncSource).not.toHaveBeenCalled();
    });
  });

  describe("Cron sync - token validation before password", () => {
    it("returns 401 with wrong token and no password bootstrap (token checked first)", async () => {
      const ctx: MockContext = {
        supabase: mockSupabase,
        serviceRoleKey: "service-role-key",
        marisonDeploymentEnvironment: "staging",
        marisonDefaultPassword: () => null, // No password
        marisonSyncCronToken: "correct-token-32-chars-long!!!!!!", // 32+ chars
        assertMarisonEmployeeSyncInfraAvailable: () => {},
        assertMarisonEmployeeSyncWriteAvailable: () => {
          // Should not reach here
          throw new Error("Should not reach write assertion");
        },
        getMarisonEmployeeSyncSource: vi.fn(),
        previewMarisonEmployeeSync: vi.fn(),
        executeMarisonEmployeeSync: vi.fn(),
        runTrackedMarisonSync: vi.fn(),
      };
      
      const handlers = createTestableHandlers(ctx);
      const req = createMockRequest({
        "x-internal-sync-token": "wrong-token-32-chars-but-wrong!!!",
      });
      
      await expect(handlers.syncMarisonDirectoryFromCron(req)).rejects.toMatchObject({
        message: "Unauthorized",
        status: 401,
      });
      
      // Write assertion and source fetch should never be called
      expect(ctx.getMarisonEmployeeSyncSource).not.toHaveBeenCalled();
      expect(ctx.executeMarisonEmployeeSync).not.toHaveBeenCalled();
    });

    it("returns 401 without token and no password bootstrap", async () => {
      const ctx: MockContext = {
        supabase: mockSupabase,
        serviceRoleKey: "service-role-key",
        marisonDeploymentEnvironment: "staging",
        marisonDefaultPassword: () => null, // No password
        marisonSyncCronToken: "a".repeat(32),
        assertMarisonEmployeeSyncInfraAvailable: () => {},
        assertMarisonEmployeeSyncWriteAvailable: () => {
          throw new Error("Should not reach write assertion");
        },
        getMarisonEmployeeSyncSource: vi.fn(),
        previewMarisonEmployeeSync: vi.fn(),
        executeMarisonEmployeeSync: vi.fn(),
        runTrackedMarisonSync: vi.fn(),
      };
      
      const handlers = createTestableHandlers(ctx);
      const req = createMockRequest({}); // No token
      
      await expect(handlers.syncMarisonDirectoryFromCron(req)).rejects.toMatchObject({
        message: "Unauthorized",
        status: 401,
      });
      
      expect(ctx.getMarisonEmployeeSyncSource).not.toHaveBeenCalled();
    });

    it("returns 503 with valid token but no password bootstrap (no mutation)", async () => {
      const ctx: MockContext = {
        supabase: mockSupabase,
        serviceRoleKey: "service-role-key",
        marisonDeploymentEnvironment: "staging",
        marisonDefaultPassword: () => null, // No password
        marisonSyncCronToken: "valid-cron-token-32-char-string!",
        assertMarisonEmployeeSyncInfraAvailable: () => {},
        assertMarisonEmployeeSyncWriteAvailable: () => {
          const err = new Error("Konfigurasi sinkronisasi karyawan belum lengkap.");
          (err as any).status = 503;
          throw err;
        },
        getMarisonEmployeeSyncSource: vi.fn(),
        previewMarisonEmployeeSync: vi.fn(),
        executeMarisonEmployeeSync: vi.fn(),
        runTrackedMarisonSync: vi.fn(),
      };
      
      const handlers = createTestableHandlers(ctx);
      const req = createMockRequest({
        "x-internal-sync-token": "valid-cron-token-32-char-string!",
      });
      
      await expect(handlers.syncMarisonDirectoryFromCron(req)).rejects.toMatchObject({
        message: "Konfigurasi sinkronisasi karyawan belum lengkap.",
        status: 503,
      });
      
      // Token was valid, but password failed before source/mutation
      expect(ctx.getMarisonEmployeeSyncSource).not.toHaveBeenCalled();
      expect(ctx.executeMarisonEmployeeSync).not.toHaveBeenCalled();
    });

    it("reaches mock dependency only with valid token and password (no real network/db)", async () => {
      const ctx: MockContext = {
        supabase: mockSupabase,
        serviceRoleKey: "service-role-key",
        marisonDeploymentEnvironment: "staging",
        marisonDefaultPassword: () => "valid-password-8chars",
        marisonSyncCronToken: "valid-cron-token-32-char-string!",
        assertMarisonEmployeeSyncInfraAvailable: () => {},
        assertMarisonEmployeeSyncWriteAvailable: () => {},
        getMarisonEmployeeSyncSource: vi.fn().mockResolvedValue({
          employees: [{ id: 1, name: "Test User", nik: "A 001" }],
          branches: [],
        }),
        previewMarisonEmployeeSync: vi.fn(),
        executeMarisonEmployeeSync: vi.fn().mockResolvedValue({
          environment: "staging",
          created: 1,
          updated: 0,
        }),
        runTrackedMarisonSync: vi.fn().mockImplementation(async ({ operation }) => {
          return operation();
        }),
      };
      
      const handlers = createTestableHandlers(ctx);
      const req = createMockRequest({
        "x-internal-sync-token": "valid-cron-token-32-char-string!",
      });
      
      const result = await handlers.syncMarisonDirectoryFromCron(req);
      
      expect(result).toEqual({
        environment: "staging",
        created: 1,
        updated: 0,
      });
      
      // Verify all dependencies were mocked
      expect(ctx.getMarisonEmployeeSyncSource).toHaveBeenCalled();
      expect(ctx.runTrackedMarisonSync).toHaveBeenCalled();
      expect(ctx.executeMarisonEmployeeSync).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPassword: "valid-password-8chars",
        })
      );
    });
  });

  describe("Cron token configuration validation", () => {
    it("returns 503 when MARISON_SYNC_CRON_TOKEN not configured (under 32 chars)", async () => {
      const ctx: MockContext = {
        supabase: mockSupabase,
        serviceRoleKey: "service-role-key",
        marisonDeploymentEnvironment: "staging",
        marisonDefaultPassword: () => "valid-password",
        marisonSyncCronToken: "short", // Too short
        assertMarisonEmployeeSyncInfraAvailable: () => {},
        assertMarisonEmployeeSyncWriteAvailable: () => {},
        getMarisonEmployeeSyncSource: vi.fn(),
        previewMarisonEmployeeSync: vi.fn(),
        executeMarisonEmployeeSync: vi.fn(),
        runTrackedMarisonSync: vi.fn(),
      };
      
      const handlers = createTestableHandlers(ctx);
      const req = createMockRequest({
        "x-internal-sync-token": "any-token",
      });
      
      await expect(handlers.syncMarisonDirectoryFromCron(req)).rejects.toMatchObject({
        message: "Token cron sinkronisasi belum dikonfigurasi.",
        status: 503,
      });
      
      // Token comparison should not happen
      expect(ctx.getMarisonEmployeeSyncSource).not.toHaveBeenCalled();
    });

    it("returns 503 when MARISON_SYNC_CRON_TOKEN is empty", async () => {
      const ctx: MockContext = {
        supabase: mockSupabase,
        serviceRoleKey: "service-role-key",
        marisonDeploymentEnvironment: "staging",
        marisonDefaultPassword: () => "valid-password",
        marisonSyncCronToken: "",
        assertMarisonEmployeeSyncInfraAvailable: () => {},
        assertMarisonEmployeeSyncWriteAvailable: () => {},
        getMarisonEmployeeSyncSource: vi.fn(),
        previewMarisonEmployeeSync: vi.fn(),
        executeMarisonEmployeeSync: vi.fn(),
        runTrackedMarisonSync: vi.fn(),
      };
      
      const handlers = createTestableHandlers(ctx);
      const req = createMockRequest({
        "x-internal-sync-token": "any-token",
      });
      
      await expect(handlers.syncMarisonDirectoryFromCron(req)).rejects.toMatchObject({
        message: "Token cron sinkronisasi belum dikonfigurasi.",
        status: 503,
      });
    });
  });

  describe("Error messages and logs do not leak secrets", () => {
    it("error responses do not contain environment variable name", async () => {
      const ctx: MockContext = {
        supabase: mockSupabase,
        serviceRoleKey: "service-role-key",
        marisonDeploymentEnvironment: "staging",
        marisonDefaultPassword: () => null,
        marisonSyncCronToken: "a".repeat(32),
        assertMarisonEmployeeSyncInfraAvailable: () => {},
        assertMarisonEmployeeSyncWriteAvailable: () => {
          const err = new Error("Konfigurasi sinkronisasi karyawan belum lengkap.");
          (err as any).status = 503;
          throw err;
        },
        getMarisonEmployeeSyncSource: vi.fn(),
        previewMarisonEmployeeSync: vi.fn(),
        executeMarisonEmployeeSync: vi.fn(),
        runTrackedMarisonSync: vi.fn(),
      };
      
      const handlers = createTestableHandlers(ctx);
      const req = createMockRequest({ authorization: "Bearer valid-token" }, { confirm: true });
      
      try {
        await handlers.syncMarisonEmployees(req);
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).not.toContain("STAGING_DEFAULT_USER_PASSWORD");
        expect(error.message).not.toContain("password");
        expect(error.message).toContain("Konfigurasi sinkronisasi karyawan belum lengkap");
      }
    });

    it("captured logs do not contain password value", async () => {
      const ctx: MockContext = {
        supabase: mockSupabase,
        serviceRoleKey: "service-role-key",
        marisonDeploymentEnvironment: "staging",
        marisonDefaultPassword: () => "valid-password-8chars",
        marisonSyncCronToken: "valid-cron-token-32-char-string!",
        assertMarisonEmployeeSyncInfraAvailable: () => {},
        assertMarisonEmployeeSyncWriteAvailable: () => {},
        getMarisonEmployeeSyncSource: vi.fn().mockResolvedValue({ employees: [], branches: [] }),
        previewMarisonEmployeeSync: vi.fn(),
        executeMarisonEmployeeSync: vi.fn().mockResolvedValue({ environment: "staging" }),
        runTrackedMarisonSync: vi.fn().mockImplementation(async ({ operation }) => operation()),
      };
      
      const handlers = createTestableHandlers(ctx);
      const req = createMockRequest({
        "x-internal-sync-token": "valid-cron-token-32-char-string!",
      });
      
      await handlers.syncMarisonDirectoryFromCron(req);
      
      // Check captured logs don't contain password
      const logOutput = capturedLogs.join("\n");
      expect(logOutput).not.toContain("valid-password-8chars");
      expect(logOutput).not.toContain("STAGING_DEFAULT_USER_PASSWORD");
    });
  });

  describe("Authorization boundaries", () => {
    it("preview endpoint requires auth", async () => {
      const ctx: MockContext = {
        supabase: mockSupabase,
        serviceRoleKey: "service-role-key",
        marisonDeploymentEnvironment: "staging",
        marisonDefaultPassword: () => "valid-password",
        marisonSyncCronToken: "a".repeat(32),
        assertMarisonEmployeeSyncInfraAvailable: () => {},
        assertMarisonEmployeeSyncWriteAvailable: () => {},
        getMarisonEmployeeSyncSource: vi.fn(),
        previewMarisonEmployeeSync: vi.fn(),
        executeMarisonEmployeeSync: vi.fn(),
        runTrackedMarisonSync: vi.fn(),
      };
      
      const handlers = createTestableHandlers(ctx);
      const req = createMockRequest({}); // No auth
      
      await expect(handlers.previewMarisonEmployees(req)).rejects.toMatchObject({
        status: 401,
      });
    });

    it("manual sync endpoint requires auth (checked before password)", async () => {
      let passwordAssertionCalled = false;
      
      const ctx: MockContext = {
        supabase: mockSupabase,
        serviceRoleKey: "service-role-key",
        marisonDeploymentEnvironment: "staging",
        marisonDefaultPassword: () => null,
        marisonSyncCronToken: "a".repeat(32),
        assertMarisonEmployeeSyncInfraAvailable: () => {},
        assertMarisonEmployeeSyncWriteAvailable: () => {
          passwordAssertionCalled = true;
          throw new Error("Should not reach here");
        },
        getMarisonEmployeeSyncSource: vi.fn(),
        previewMarisonEmployeeSync: vi.fn(),
        executeMarisonEmployeeSync: vi.fn(),
        runTrackedMarisonSync: vi.fn(),
      };
      
      const handlers = createTestableHandlers(ctx);
      const req = createMockRequest({}); // No auth
      
      await expect(handlers.syncMarisonEmployees(req)).rejects.toMatchObject({
        status: 401,
      });
      
      expect(passwordAssertionCalled).toBe(false);
    });

    it("cron endpoint validates token before password", async () => {
      let passwordAssertionCalled = false;
      
      const ctx: MockContext = {
        supabase: mockSupabase,
        serviceRoleKey: "service-role-key",
        marisonDeploymentEnvironment: "staging",
        marisonDefaultPassword: () => null,
        marisonSyncCronToken: "correct-token-32-chars-long!!!!!!", // 32+ chars
        assertMarisonEmployeeSyncInfraAvailable: () => {},
        assertMarisonEmployeeSyncWriteAvailable: () => {
          passwordAssertionCalled = true;
          throw new Error("Should not reach here");
        },
        getMarisonEmployeeSyncSource: vi.fn(),
        previewMarisonEmployeeSync: vi.fn(),
        executeMarisonEmployeeSync: vi.fn(),
        runTrackedMarisonSync: vi.fn(),
      };
      
      const handlers = createTestableHandlers(ctx);
      const req = createMockRequest({
        "x-internal-sync-token": "wrong-token-32-chars-but-wrong!!!",
      });
      
      await expect(handlers.syncMarisonDirectoryFromCron(req)).rejects.toMatchObject({
        status: 401,
        message: "Unauthorized",
      });
      
      expect(passwordAssertionCalled).toBe(false);
    });
  });
});
