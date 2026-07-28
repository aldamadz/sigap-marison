import Fastify from "fastify";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeGitSha, registerHealthRoutes } from "../../backend/src/routes/health.routes.ts";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("runtime revision metadata", () => {
  it("returns only the validated Git SHA without caching", async () => {
    const app = Fastify();
    const revision = "0123456789abcdef0123456789abcdef01234567";
    await registerHealthRoutes(app, revision);

    const response = await app.inject({ method: "GET", url: "/health/version" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({ gitSha: revision });
    await app.close();
  });

  it("fails closed to unknown for malformed metadata", () => {
    expect(normalizeGitSha(undefined)).toBe("unknown");
    expect(normalizeGitSha("staging;SESSION_SECRET=value")).toBe("unknown");
  });

  it("wires the revision into every primary image build", () => {
    const dockerfile = read("dockerfile");
    expect(dockerfile).toContain("ARG GIT_SHA=unknown");
    expect(dockerfile).toContain("LABEL org.opencontainers.image.revision=$GIT_SHA");
    expect(dockerfile).toContain("ENV GIT_SHA=$GIT_SHA");

    for (const composePath of [
      "docker-compose.yml",
      "docker-compose.staging.yml",
      "docker-compose.prod.yml",
      "docker-compose.worker.yml",
    ]) {
      expect(read(composePath)).toContain('GIT_SHA: "${GIT_SHA:-unknown}"');
    }
  });
});
