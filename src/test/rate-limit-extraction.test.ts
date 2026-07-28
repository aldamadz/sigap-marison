import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("rate-limit extraction", () => {
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
    expect(runtime).toContain("enforceRateLimit");
    expect(runtime).toContain("recordRateLimit");
  });
});
