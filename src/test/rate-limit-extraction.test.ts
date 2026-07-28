import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("rate-limit extraction", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("moves the rate limit helpers into a typed module", () => {
    const module = read("backend/src/domain/rate-limit.ts");
    expect(module).toContain("enforceRateLimit");
    expect(module).toContain("recordRateLimit");
    expect(module).toContain("clientIp");
    expect(module).toContain("RateLimitStore");
    expect(module).not.toContain("@ts-nocheck");
  });

  it("removes inline rate-limit helpers from domain-runtime.ts", () => {
    const runtime = read("backend/src/domain-runtime.ts");
    expect(runtime).not.toContain("const activeRateLimit = (store, key)");
    expect(runtime).not.toContain("const enforceRateLimit = (store, key, max)");
    expect(runtime).not.toContain("const recordRateLimit = (store, key, windowMs)");
    expect(runtime).not.toContain("const clientIp = (req)");
    expect(runtime).not.toMatch(/const (clientIp|enforceRateLimit|recordRateLimit) = \1/);
    expect(runtime).toContain("enforceRateLimit");
    expect(runtime).toContain("recordRateLimit");
  });

  it("loads domain-runtime without top-level helper binding errors", async () => {
    vi.stubEnv("SUPABASE_URL", "https://database.test");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");
    vi.stubEnv("SESSION_SECRET", "test-session-secret-at-least-32-characters");
    vi.stubEnv("STORAGE_MODE", "self_hosted_supabase");
    vi.stubEnv("STORAGE_SUPABASE_URL", "https://storage.test");
    vi.stubEnv("STORAGE_SUPABASE_SERVICE_ROLE_KEY", "storage-test-key");
    vi.stubEnv("STORAGE_PUBLIC_BASE_URL", "https://storage.test/storage/v1/object/public");
    vi.stubEnv("MARISON_DEPLOYMENT_ENVIRONMENT", "staging");

    const runtime = await import("../../backend/src/domain-runtime.ts");

    expect(runtime.handleRequest).toBeTypeOf("function");
  });
});
