import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

// Mock environment and dependencies for behavior tests
const mockEnv = (values: Record<string, string | undefined>) => {
  const original = { ...process.env };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return () => {
    process.env = original;
  };
};

describe("Directory sync configuration validation", () => {
  describe("Code structure and security", () => {
    it("separates infrastructure assertion from write assertion", () => {
      const runtime = read("backend/src/domain-runtime.ts");
      
      // Two separate assertion functions
      expect(runtime).toContain("const assertMarisonEmployeeSyncInfraAvailable = () =>");
      expect(runtime).toContain("const assertMarisonEmployeeSyncWriteAvailable = () =>");
      
      // Write assertion calls infra assertion
      expect(runtime).toContain("assertMarisonEmployeeSyncInfraAvailable()");
    });

    it("does not expose secret variable name in error messages", () => {
      const runtime = read("backend/src/domain-runtime.ts");
      const syncService = read("server/marison-employee-sync.mjs");
      
      // Generic error messages
      expect(runtime).toContain("Konfigurasi sinkronisasi karyawan belum lengkap");
      expect(syncService).toContain("Konfigurasi password default belum memenuhi persyaratan keamanan");
      
      // No secret variable name in messages
      expect(runtime).not.toContain("STAGING_DEFAULT_USER_PASSWORD belum dikonfigurasi");
      expect(syncService).not.toContain("STAGING_DEFAULT_USER_PASSWORD belum dikonfigurasi");
    });

    it("uses 503 for config issues and keeps password server-side", () => {
      const runtime = read("backend/src/domain-runtime.ts");
      const client = read("src/services/marison-integration.service.ts");
      
      expect(runtime).toContain("err.status = 503");
      expect(runtime).toContain("marisonDefaultPassword()");
      expect(client).not.toContain("STAGING_DEFAULT_USER_PASSWORD");
      expect(client).not.toContain("defaultPassword");
    });
  });

  describe("Preview behavior", () => {
    it("preview uses infra assertion only (no password requirement)", () => {
      const runtime = read("backend/src/domain-runtime.ts");
      
      const previewFn = runtime.slice(
        runtime.indexOf("const previewMarisonEmployees = async"),
        runtime.indexOf("const syncMarisonEmployees = async")
      );
      
      expect(previewFn).toContain("assertMarisonEmployeeSyncInfraAvailable()");
      expect(previewFn).not.toContain("assertMarisonEmployeeSyncWriteAvailable()");
      expect(previewFn).not.toContain("marisonDefaultPassword()");
    });

    it("preview does not call executeMarisonEmployeeSync mutation", () => {
      const runtime = read("backend/src/domain-runtime.ts");
      
      const previewFn = runtime.slice(
        runtime.indexOf("const previewMarisonEmployees = async"),
        runtime.indexOf("const syncMarisonEmployees = async")
      );
      
      expect(previewFn).toContain("previewMarisonEmployeeSync");
      expect(previewFn).not.toContain("executeMarisonEmployeeSync");
    });
  });

  describe("Manual sync authorization order", () => {
    it("validates write config after auth checks", () => {
      const runtime = read("backend/src/domain-runtime.ts");
      
      const syncFn = runtime.slice(
        runtime.indexOf("const syncMarisonEmployees = async"),
        runtime.indexOf("const syncMarisonDirectoryFromCron = async")
      );
      
      const sameOriginPos = syncFn.indexOf("assertSameOrigin");
      const adminUserPos = syncFn.indexOf("requireAdminUser");
      const writeAvailPos = syncFn.indexOf("assertMarisonEmployeeSyncWriteAvailable");
      
      expect(sameOriginPos).toBeGreaterThan(-1);
      expect(adminUserPos).toBeGreaterThan(-1);
      expect(writeAvailPos).toBeGreaterThan(-1);
      
      // Auth before config check
      expect(sameOriginPos).toBeLessThan(writeAvailPos);
      expect(adminUserPos).toBeLessThan(writeAvailPos);
    });
  });

  describe("Cron sync authorization order", () => {
    it("validates token before password config", () => {
      const runtime = read("backend/src/domain-runtime.ts");
      
      const cronFn = runtime.slice(
        runtime.indexOf("const syncMarisonDirectoryFromCron = async"),
        runtime.indexOf("const queryExternalDataSource = async")
      );
      
      const infraAvailPos = cronFn.indexOf("assertMarisonEmployeeSyncInfraAvailable");
      const tokenCheckPos = cronFn.indexOf('sha256Hex(suppliedToken) !== sha256Hex(marisonSyncCronToken)');
      const writeAvailPos = cronFn.indexOf("assertMarisonEmployeeSyncWriteAvailable");
      
      expect(infraAvailPos).toBeGreaterThan(-1);
      expect(tokenCheckPos).toBeGreaterThan(-1);
      expect(writeAvailPos).toBeGreaterThan(-1);
      
      // Order: infra -> token -> write config
      expect(infraAvailPos).toBeLessThan(tokenCheckPos);
      expect(tokenCheckPos).toBeLessThan(writeAvailPos);
    });

    it("returns 401 for invalid token regardless of password config", () => {
      const runtime = read("backend/src/domain-runtime.ts");
      
      const cronFn = runtime.slice(
        runtime.indexOf("const syncMarisonDirectoryFromCron = async"),
        runtime.indexOf("const queryExternalDataSource = async")
      );
      
      // Token validation returns 401
      const tokenValidationError = cronFn.slice(
        cronFn.indexOf('if (!suppliedToken || sha256Hex'),
        cronFn.indexOf('throw err;', cronFn.indexOf('if (!suppliedToken')) + 20
      );
      
      expect(tokenValidationError).toContain("err.status = 401");
      expect(tokenValidationError).toContain("Unauthorized");
    });
  });

  describe("Password handling", () => {
    it("validates minimum password length", () => {
      const runtime = read("backend/src/domain-runtime.ts");
      
      expect(runtime).toContain('if (typeof value !== "string" || value.length < 8) return null');
    });

    it("uses centralized getter in both sync paths", () => {
      const runtime = read("backend/src/domain-runtime.ts");
      
      const manualSync = runtime.slice(
        runtime.indexOf("const syncMarisonEmployees = async"),
        runtime.indexOf("const syncMarisonDirectoryFromCron = async")
      );
      const cronSync = runtime.slice(
        runtime.indexOf("const syncMarisonDirectoryFromCron = async"),
        runtime.indexOf("const queryExternalDataSource = async")
      );
      
      expect(manualSync).toContain("defaultPassword: marisonDefaultPassword()");
      expect(cronSync).toContain("defaultPassword: marisonDefaultPassword()");
    });
  });
});
