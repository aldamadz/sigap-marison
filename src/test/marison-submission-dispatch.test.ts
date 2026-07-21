import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Marison outbound submission dispatch", () => {
  it("keeps submission POST credentials and HMAC signing on the server", () => {
    const server = read("server.mjs");
    const client = read("src/services/surat.service.ts");

    expect(server).toContain("MARISON_SUBMISSION_DISPATCH_ENABLED");
    expect(server).toContain("/asset-purchase-requests");
    expect(server).toContain("/unit-submissions");
    expect(server).toContain("/non-unit-submissions");
    expect(server).toContain('["POST", url.pathname, token, bodyHash, timestamp].join(":")');
    expect(server).toContain("dispatchCompletedSuratToMarison");
    expect(client).not.toContain("MARISON_STAGING_CLIENT_SECRET");
    expect(client).not.toContain("MARISON_PRODUCTION_CLIENT_SECRET");
    expect(client).not.toContain("client_secret");
  });

  it("dispatches only after final approval succeeds", () => {
    const service = read("src/services/surat.service.ts");

    expect(service).toContain("rpcResult?.isDone");
    expect(service).toContain("this.dispatchCompletedSuratToMarison(suratId).catch");
    expect(service).toContain("/api/integrations/marison/surat/${suratId}/dispatch");
  });

  it("stores dispatch result in the surat snapshot for idempotency", () => {
    const server = read("server.mjs");

    expect(server).toContain("marison_dispatch");
    expect(server).toContain('previous.status === "success"');
    expect(server).toContain('status: "failed"');
  });
});
