import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Docker runtime modules", () => {
  it("copies every local module required by the server and PDF worker", () => {
    const dockerfile = read("Dockerfile");

    for (const runtimeModule of [
      "storage-path-policy.mjs",
      "server/marison-outbound-contract.mjs",
      "server/marison-outbound-identity.mjs",
    ]) {
      expect(dockerfile).toContain(
        `COPY ${runtimeModule} ./${runtimeModule}`,
      );
    }
  });
});
