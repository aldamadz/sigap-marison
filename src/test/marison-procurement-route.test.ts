import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { assertMarisonProcurementRoute, getMarisonProcurementRoute } from "../../backend/src/lib/marison-procurement-route";

describe("procurement routing is decided by trusted database form identity", () => {
  it.each(["finance_not_connected", "form_not_procurement", "form_identity_unavailable", "internal_goods"])("blocks %s before payload/identity/file work", async code => {
    const rpc = vi.fn(async () => ({ data: code, error: null }));
    await expect(assertMarisonProcurementRoute({ rpc }, "letter")).rejects.toMatchObject({ status: 409, code });
    expect(rpc).toHaveBeenCalledWith("marison_procurement_routing_block", { p_surat_id: "letter" });
  });
  it("permits only a verified PGD response and reports internal finance accurately", async () => {
    const client = { rpc: vi.fn(async () => ({ data: null, error: null })) };
    await expect(assertMarisonProcurementRoute(client, "letter")).resolves.toBeUndefined();
    expect(await getMarisonProcurementRoute({ rpc: async () => ({ data: "finance_not_connected", error: null }) }, "letter"))
      .toMatchObject({ eligible: false, destination: "sigap_finance_pending", reason: expect.stringContaining("tidak dikirim ke Pengadaan") });
  });
  it.each([undefined, false, {}, "unknown"])("fails closed on an invalid RPC response %j", async data => {
    await expect(assertMarisonProcurementRoute({ rpc: async () => ({ data, error: null }) }, "letter")).rejects.toThrow();
  });
  it("does not convert a missing migration/database error into permission to send", async () => {
    await expect(assertMarisonProcurementRoute({ rpc: async () => ({ data: null, error: Error("missing RPC") }) }, "letter")).rejects.toThrow("missing RPC");
  });
});

describe("backend entrypoints cannot bypass the procurement boundary", () => {
  const runtime = readFileSync("backend/src/domain-runtime.ts", "utf8");
  it("checks canonical form identity before resolving identities or building any payload", async () => {
    const start = runtime.indexOf("const buildMarisonDispatchPayload =");
    const end = runtime.indexOf("const getMarisonDispatchQueueStatus =", start);
    const identity = vi.fn();
    const build = vm.runInNewContext(runtime.slice(start, end) + "\nbuildMarisonDispatchPayload", {
      supabase: {}, assertMarisonProcurementRoute: async () => { throw Error("KEU blocked"); },
      getMarisonDispatchInput: identity, resolveMarisonOutboundIdentity: identity,
    });
    await expect(build({ id: "keu", form_input_data: { request_category: "asset" } }, null)).rejects.toThrow("KEU blocked");
    expect(identity).not.toHaveBeenCalled();
  });
  it("guards cached transport bodies before materializing recommendation tokens", () => {
    const build = runtime.slice(runtime.indexOf("const buildMarisonOutboundJob ="), runtime.indexOf("const listMarisonOutboundDispatches ="));
    expect(build.indexOf("assertMarisonProcurementRoute(supabase, job.surat_id)")).toBeLessThan(build.indexOf("if (job.payload_body)"));
  });
  it("retains stored payload evidence while blocking latest/Postman/replacement paths", () => {
    const preview = runtime.slice(runtime.indexOf("const getMarisonOutboundPayloadPreview ="), runtime.indexOf("const preflightMarisonOutboundRecovery ="));
    expect(preview.indexOf('if (view === "stored") return stored')).toBeLessThan(preview.indexOf("assertMarisonProcurementRoute"));
    const replacement = runtime.slice(runtime.indexOf("const preflightMarisonOutboundReplacement ="));
    expect(replacement.indexOf("assertMarisonProcurementRoute")).toBeLessThan(replacement.indexOf('if (job.kind === "fund")'));
    expect(runtime).not.toContain("items: keu1 || keu10");
  });
});
