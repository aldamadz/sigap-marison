import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Docker runtime modules", () => {
  it("copies every local module required by the server and PDF worker", () => {
    const dockerfile = read("dockerfile");

    expect(dockerfile).toContain("COPY --from=builder /app/backend/dist ./backend/dist");
    expect(dockerfile.indexOf("RUN apk add --no-cache")).toBeLessThan(
      dockerfile.indexOf("ARG GIT_SHA=unknown"),
    );
    expect(read("backend/src/domain-runtime.ts")).toContain('from "./domain/session-cookie.js"');
    expect(read("backend/src/domain-runtime.ts")).toContain('from "./domain/rate-limit.js"');

    for (const runtimeModule of [
      "storage-path-policy.mjs",
      "server/marison-outbound-contract.mjs",
      "server/marison-outbound-identity.mjs",
      "server/marison-payload-identity.mjs",
      "server/marison-payload-mapping-handler.mjs",
      "server/marison-payload-mapping-request.mjs",
      "server/marison-sync-worker.mjs",
      "server/marison-outbound-worker.mjs",
    ]) {
      expect(dockerfile).toContain(
        `COPY ${runtimeModule} ./${runtimeModule}`,
      );
    }
  });
});
