import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { diagnoseVendorRejection } from "../../server/marison-rejection-diagnosis.mjs";

const source = readFileSync("backend/src/domain-runtime.ts", "utf8");
const handlers = source.slice(source.indexOf("const createMarisonOutboundReplacement ="), source.indexOf("const getAuthorizedSurat ="));

function harness(overrides = {}, forbidden = false) {
  const job = { id: "job", environment: "production", status: "failed_terminal", kind: "asset", error_code: "marison_http_422",
    response: { message: 'SQLSTATE[42703]: column "main_document" does not exist; secret-db-host; nik=1234567890123456' },
    post_started_at: "2026-10-15T03:11:00Z", external_reference: null, ...overrides };
  const rpc = vi.fn();
  const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: job, error: null }) }) }) }));
  const requireAdminUser = vi.fn(async () => {
    if (forbidden) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return { id: "admin" };
  });
  const context = { supabase: { from, rpc }, marisonDeploymentEnvironment: "production", diagnoseVendorRejection,
    assertSameOrigin: vi.fn(), requireAdminUser, getBearerToken: () => "private-test-token",
    readJsonBody: async () => ({ reason: "Periksa diagnosis Aset", confirmProductionSend: true }) };
  const result = vm.runInNewContext(`${handlers}\n({preflightMarisonOutboundReplacement,createMarisonOutboundReplacement});`, context);
  return { ...result, rpc, from, requireAdminUser };
}

describe("production replacement diagnosis remains read-only and fail-closed", () => {
  it("returns sanitized Asset diagnosis instead of throwing a generic preflight error", async () => {
    const h = harness();
    const result = await h.preflightMarisonOutboundReplacement({}, "job");
    expect(result).toMatchObject({ eligible: false, reasonCode: "PRODUCTION_REPLACEMENT_UNSUPPORTED", safeContext: null });
    expect(result.vendorDiagnosis).toBeTruthy();
    expect(JSON.stringify(result)).not.toMatch(/secret-db-host|1234567890123456|SQLSTATE/);
    expect(h.from).toHaveBeenCalledTimes(1);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("rejects an attempted Asset replacement even with explicit production confirmation", async () => {
    const h = harness();
    await expect(h.createMarisonOutboundReplacement({}, "job")).rejects.toMatchObject({ status: 409 });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("requires admin before reading any job", async () => {
    const h = harness({}, true);
    await expect(h.preflightMarisonOutboundReplacement({}, "job")).rejects.toMatchObject({ status: 403 });
    expect(h.from).not.toHaveBeenCalled();
  });

  it.each([{ environment: "staging" }, { status: "sent" }, { error_code: "network_error" }, { kind: "unit", post_started_at: null }])(
    "preserves environment, terminal-422 and production Unit evidence gates: %j", async overrides => {
      const h = harness(overrides);
      await expect(h.preflightMarisonOutboundReplacement({}, "job")).rejects.toMatchObject({ status: 409 });
      expect(h.rpc).not.toHaveBeenCalled();
    },
  );
});
