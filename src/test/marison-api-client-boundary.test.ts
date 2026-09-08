import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Marison API client boundary", () => {
  it("keeps Marison API primitives in typed leaf module", () => {
    const runtime = read("backend/src/domain-runtime.ts");
    const client = read("backend/src/modules/marison/marison-api-client.ts");
    expect(runtime).toContain('import { createMarisonApiClient } from "./modules/marison/marison-api-client.js";');
    expect(runtime).toContain("const marisonApiClient = createMarisonApiClient(");
    expect(runtime).not.toContain("const getMarisonAccessToken = async");
    expect(runtime).not.toContain("const getMarisonProtectedJson = async");
    expect(client).toContain("export const createMarisonApiClient");
    expect(client).not.toMatch(/\bany\b|@ts-/);
    expect(client).not.toContain("domain-runtime");
  });
});
