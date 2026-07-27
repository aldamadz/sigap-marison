import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("local development runtime", () => {
  it("starts the local BFF and Vite together", () => {
    const packageJson = JSON.parse(read("package.json"));
    const runner = read("scripts/dev.mjs");

    expect(packageJson.scripts.dev).toBe("node scripts/dev.mjs");
    expect(runner).toContain('"--env-file=.env.local", backendEntry, "backend/src/index.ts"');
    expect(runner).toContain('node_modules", "vite", "bin", "vite.js"');
  });

  it("proxies development API calls to the local BFF without rewriting the host", () => {
    const viteConfig = read("vite.config.ts");

    expect(viteConfig).toContain('env.DEV_API_PROXY_TARGET || `http://127.0.0.1:${env.APP_PORT || "3010"}`');
    expect(viteConfig).toContain('changeOrigin: mode !== "development"');
  });

  it("documents localhost as the development application origin", () => {
    const envExample = read(".env.example");

    expect(envExample).toContain("APP_PUBLIC_URL=http://localhost:8080");
    expect(envExample).toContain("DEV_API_PROXY_TARGET=http://127.0.0.1:3010");
    expect(read("backend/src/config/env.ts")).toContain("process.env.PORT || process.env.APP_PORT");
  });
});
