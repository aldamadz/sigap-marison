import { describe, expect, it, vi } from "vitest";
import { createMarisonOutboundWorker } from "../../server/marison-outbound-worker.mjs";
import { returnedUnitFixture } from "./fixtures/unit-external-revision";

describe("verified revision transport preserves durable POST semantics", () => {
  it.each(["accepted", "timeout", "server-error", "rejected"])("sends once and records %s without automatic business retry", async mode => {
    const payloadBody = JSON.stringify(returnedUnitFixture().previous.payload);
    let posts = 0;
    const completed: Record<string, unknown>[] = [];
    const worker = createMarisonOutboundWorker({ config: { supabaseUrl: "https://database.test", serviceRoleKey: "fixture-key",
      marisonBaseUrl: "https://vendor.test/api", bffBaseUrl: "https://bff.test", internalToken: "i".repeat(32),
      marisonClientId: "fixture-client", marisonClientSecret: "fixture-secret", databaseTimeoutMs: 1000,
      tokenTimeoutMs: 1000, buildTimeoutMs: 1000, postTimeoutMs: 1000 }, logger: { info: vi.fn(), error: vi.fn() },
      fetchImpl: async (input: unknown, init: RequestInit) => {
        const url = String(input);
        let result: unknown = true;
        if (url.endsWith("/access-token")) result = { data: { access_token: "fixture-token", expires_in: 900 } };
        else if (url.includes("/api/internal/")) result = { kind: "unit", endpoint: "/unit-submissions", contractVersion: "fixture",
          payloadBody, payloadHash: "a".repeat(64), transportHash: "a".repeat(64), materializationAttemptId: "attempt" };
        else if (url.includes("mark_marison_outbound_post_started")) result = { post_started: true };
        else if (url.includes("complete_marison_outbound_after_post")) completed.push(JSON.parse(String(init.body)));
        else if (url.endsWith("/unit-submissions")) {
          posts++; expect(init.redirect).toBe("error"); expect(JSON.parse(String(init.body)).submission_number).toBe("051/UAI/MKT.1.SGN/X/2026");
          if (mode === "timeout") throw Object.assign(Error("fixture timeout"), { name: "TimeoutError" });
          return new Response(JSON.stringify({ data: { submission_id: 2 } }), { status: mode === "server-error" ? 503 : mode === "rejected" ? 422 : 200 });
        }
        return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
      } });
    await worker.processJob({ job_id: "80200000-0000-4000-8000-000000000003", lease_token: "80200000-0000-4000-8000-000000000001",
      kind: "unit", generation: 3, replacement_of_dispatch_id: "previous", endpoint: "/unit-submissions",
      payload_body: payloadBody, payload_hash: "a".repeat(64), contract_version: "fixture" });
    expect(posts).toBe(1); expect(completed).toHaveLength(1);
    expect(completed[0].p_status).toBe(mode === "accepted" ? "succeeded" : mode === "rejected" ? "failed_terminal" : "outcome_unknown");
    if (mode === "accepted") expect(completed[0].p_external_reference).toBe("2");
  });
});
