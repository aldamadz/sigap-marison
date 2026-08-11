import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bootDomainRuntime, closeApp, stubRuntimeEnv, unstubRuntimeEnv, type BootedRuntime,
} from "./harness/domain-runtime-harness";

const jobId = "10000000-0000-4000-8000-000000000001";
const suratId = "20000000-0000-4000-8000-000000000002";
const leaseToken = "30000000-0000-4000-8000-000000000003";
const userId = "40000000-0000-4000-8000-000000000004";
const pdf = Buffer.from("%PDF-1.7\noffline acceptance\n");
const canonicalObjectPath = "pdf/current.pdf";

const payload = {
  request_number: "REQ-1", branch_id: 1, submitted_by: "A 1",
  items: [1, 2].map((number) => ({
    asset_name: `Asset ${number}`, quantity: 1,
    attachments: [{ type: "sigap_recommendation_pdf", surat_id: suratId, name: "Recommendation PDF" }],
  })),
  approvals: [{ role: "Admin", nik: "A 1", action: "approved", actioned_at: "2026-08-11T00:00:00.000Z" }],
};

const query = (result: () => unknown) => {
  const builder: any = {};
  for (const method of ["select", "eq", "order", "limit"]) builder[method] = () => builder;
  builder.maybeSingle = async () => ({ data: result(), error: null });
  return builder;
};

const clients = (role: "admin" | "user" = "admin") => {
  let revoked = false;
  let stale = false;
  let mintCount = 0;
  let tokenId = "";
  const downloadedPaths: string[] = [];
  const mintArgs: any[] = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from: (table: string) => {
      if (table === "profiles") return query(() => ({ role, is_active: true, deleted_at: null }));
      if (table === "marison_outbound_dispatches") return query(() => ({
        id: jobId, surat_id: suratId, environment: "staging", kind: "asset", endpoint: "/asset-purchase-requests",
        contract_version: "test", payload, payload_body: JSON.stringify(payload), payload_hash: "hash", status: "processing",
        lease_token: leaseToken, lease_expires_at: "2099-01-01T00:00:00.000Z", post_started_at: null,
      }));
      if (table === "surat_registrasi") return query(() => ({
        id: suratId, no_surat: "REC-1", judul_surat: "Recommendation", pdf_bucket: "dokumen_surat",
        pdf_object_path: canonicalObjectPath, pdf_storage_origin: "external",
      }));
      throw new Error(`Unexpected table ${table}`);
    },
    rpc: async (name: string, args: any) => {
      if (name === "mint_recommendation_file_view_token") {
        mintArgs.push(args);
        mintCount += 1;
        tokenId = `token-${mintCount}`;
        return { data: { token_id: tokenId, minted: true }, error: null };
      }
      if (name === "consume_file_view_token") return {
        data: revoked || stale ? [] : [{ token_id: tokenId, surat_id: suratId, bucket: "dokumen_surat", object_path: canonicalObjectPath, storage_origin: "external" }], error: null,
      };
      if (name === "revoke_recommendation_file_view_token") { revoked = true; return { data: true, error: null }; }
      if (name === "cleanup_recommendation_file_view_tokens") return { data: 1, error: null };
      throw new Error(`Unexpected RPC ${name}: ${JSON.stringify(args)}`);
    },
  };
  const storageSupabase = { storage: { from: (bucket: string) => ({
    download: async (path: string) => {
      downloadedPaths.push(path);
      if (bucket !== "dokumen_surat" || path !== canonicalObjectPath) throw new Error("Non-canonical storage download");
      return { data: { type: "application/pdf", arrayBuffer: async () => pdf }, error: null };
    },
  }) } };
  return { supabase, storageSupabase, downloadedPaths, mintArgs, get mintCount() { return mintCount; }, set stale(value: boolean) { stale = value; } };
};

let booted: BootedRuntime | null;
beforeEach(async () => { stubRuntimeEnv(vi); booted = await bootDomainRuntime(); });
afterEach(async () => { await closeApp(booted); booted = null; unstubRuntimeEnv(vi); });

describe("recommendation file links offline acceptance", () => {
  it("materializes once, serves canonical PDF, revokes to 410, and rejects stale pointer without storage", async () => {
    const mock = clients();
    booted!.runtime.setDomainRuntimeDependenciesForTest(mock);
    const built = await booted!.app.inject({
      method: "POST", url: `/api/internal/marison/outbound/${jobId}/build`,
      headers: { "x-internal-outbound-token": "test-outbound-internal-token-32-characters-min", origin: "https://sigap.test", host: "sigap.test" },
      payload: { leaseToken, transport: true, materializationAttemptId: "50000000-0000-4000-8000-000000000005" },
    });
    expect(built.statusCode).toBe(200);
    const body = built.json();
    const outgoing = JSON.parse(body.payloadBody);
    const links = outgoing.items.map((item: any) => item.attachments[0].link);
    expect(new Set(links).size).toBe(1);
    expect(mock.mintCount).toBe(1);
    expect(mock.mintArgs[0]).toMatchObject({ p_dispatch_id: jobId, p_lease_token: leaseToken });
    expect(body.mintedTokens).toHaveLength(1);

    const path = new URL(links[0]).pathname;
    const view = await booted!.app.inject({ method: "GET", url: path });
    expect(view.statusCode).toBe(200);
    expect(view.rawPayload).toEqual(pdf);
    expect(mock.downloadedPaths).toEqual([canonicalObjectPath]);

    const revoke = await booted!.app.inject({ method: "POST", url: `/api/admin/recommendation-file-links/${suratId}/revoke`, headers: { authorization: "Bearer session", origin: "https://sigap.test", host: "sigap.test" }, payload: { reason: "Vendor access ended" } });
    expect(revoke.statusCode).toBe(200);
    expect((await booted!.app.inject({ method: "GET", url: path })).statusCode).toBe(410);

    const fresh = clients();
    fresh.stale = true;
    booted!.runtime.setDomainRuntimeDependenciesForTest(fresh);
    expect((await booted!.app.inject({ method: "GET", url: path })).statusCode).toBe(410);
    expect(fresh.downloadedPaths).toEqual([]);
  });

  it("admin revoke route enforces 401, 403, and active admin", async () => {
    expect((await booted!.app.inject({ method: "POST", url: `/api/admin/recommendation-file-links/${suratId}/revoke`, headers: { origin: "https://sigap.test", host: "sigap.test" }, payload: { reason: "x" } })).statusCode).toBe(401);
    booted!.runtime.setDomainRuntimeDependenciesForTest(clients("user"));
    expect((await booted!.app.inject({ method: "POST", url: `/api/admin/recommendation-file-links/${suratId}/revoke`, headers: { authorization: "Bearer session", origin: "https://sigap.test", host: "sigap.test" }, payload: { reason: "x" } })).statusCode).toBe(403);
    booted!.runtime.setDomainRuntimeDependenciesForTest(clients("admin"));
    expect((await booted!.app.inject({ method: "POST", url: `/api/admin/recommendation-file-links/${suratId}/revoke`, headers: { authorization: "Bearer session", origin: "https://sigap.test", host: "sigap.test" }, payload: { reason: "x" } })).statusCode).toBe(200);
  });
});
