import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Fastify backend architecture", () => {
  it("uses the TypeScript Fastify runtime in development and containers", () => {
    const packageJson = JSON.parse(read("package.json"));
    const dockerfile = read("dockerfile");

    expect(packageJson.scripts.start).toBe("node backend/dist/index.js");
    expect(dockerfile).toContain('CMD ["node", "backend/dist/index.js"]');
    expect(dockerfile).toContain("npm run build:backend");
  });

  it("registers native health, auth, and BFF routes before compatibility routes", () => {
    const app = read("backend/src/app.ts");
    const auth = read("backend/src/routes/auth.routes.ts");
    const bff = read("backend/src/routes/bff.routes.ts");

    expect(app.indexOf("registerAuthRoutes(app)")).toBeLessThan(app.indexOf("registerCompatibilityRoutes(app)"));
    expect(app.indexOf("registerBffRoutes(app)")).toBeLessThan(app.indexOf("registerCompatibilityRoutes(app)"));
    expect(auth).toContain('app.post("/api/auth/login"');
    expect(bff).toContain('app.post("/api/bff/query"');
    expect(read("backend/src/routes/compatibility.routes.ts")).not.toContain('url: "/api/*"');
    expect(read("backend/src/index.ts")).toContain("graceful shutdown started");
  });

  it("does not start the compatibility server when imported", () => {
    const server = read("server.mjs");

    expect(server).toContain("export const handleRequest");
    expect(server).toContain("if (import.meta.url === entryPath) startLegacyServer()");
  });
});
