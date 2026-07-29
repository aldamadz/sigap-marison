import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Marison outbound submission dispatch", () => {
  it("keeps submission POST credentials and HMAC signing in the dedicated worker", () => {
    const server = read("backend/src/domain-runtime.ts");
    const worker = read("server/marison-outbound-worker.mjs");
    const client = read("src/services/surat.service.ts");

    expect(server).toContain("MARISON_SUBMISSION_DISPATCH_ENABLED");
    expect(worker).toContain('["POST", url.pathname, accessToken, prepared.payloadHash, timestamp].join(":")');
    expect(worker).toContain("mark_marison_outbound_post_started");
    expect(worker).toContain("complete_marison_outbound_after_post");
    expect(server).not.toContain("postMarisonProtectedJson");
    expect(server).toContain('assertMarisonOutboundContract("unit", payload)');
    expect(server).toContain('assertMarisonOutboundContract("non_unit", {');
    expect(server).toContain('assertMarisonOutboundContract("asset", payload)');
    expect(server).toContain("project_id: projectId");
    expect(server).toContain("branch_id: branchId");
    expect(server).toContain("addendum_atas_label");
    expect(server).toContain("request_number: firstString(");
    expect(server).toContain('name: "Dokumen Rekomendasi Aset"');
    expect(server).toContain("p_contract_version: dispatch.contractVersion");
    expect(server).toContain("p_payload_hash: payloadHash");
    expect(server).toContain("marisonOutboundNik(profile.nik, signerSnapshot.nik, signature.nik)");
    expect(server).toContain("marisonOutboundNik(surat.requester_snapshot?.nik, surat.data_snapshot?.requester?.nik)");
    expect(server).toContain("submitted_by: marisonOutboundNik(surat.requester_snapshot?.nik, surat.data_snapshot?.requester?.nik)");
    expect(client).not.toContain("MARISON_STAGING_CLIENT_SECRET");
    expect(client).not.toContain("MARISON_PRODUCTION_CLIENT_SECRET");
    expect(client).not.toContain("client_secret");
  });

  it("does not depend on a browser fire-and-forget request after final approval", () => {
    const service = read("src/services/surat.service.ts");
    const migration = read("supabase/migrations/20260729103000_durable_marison_outbound_dispatch.sql");

    expect(service).toContain('supabase.rpc("handle_approve_surat_v2"');
    expect(service).not.toContain("this.dispatchCompletedSuratToMarison(suratId).catch");
    expect(migration).toContain("enqueue_marison_outbound_after_completion");
  });

  it("uses the outbox as source of truth and keeps a compatible snapshot summary", () => {
    const migration = read("supabase/migrations/20260729103000_durable_marison_outbound_dispatch.sql");

    expect(migration).toContain("create table public.marison_outbound_dispatches");
    expect(migration).toContain("unique (surat_id, environment)");
    expect(migration).toContain("sync_marison_outbound_snapshot");
  });

  it("accepts the database final status and skips recommendation child documents", () => {
    const server = read("backend/src/domain-runtime.ts");

    expect(server).toContain('["SELESAI", "DONE"]');
    expect(server).toContain('dispatchInput.linked_parent_surat_id');
    expect(server).toContain("Dokumen rekomendasi tidak boleh dikirim terpisah");
    expect(server).toContain("signed_at, catatan, signer_snapshot");
    expect(server).toContain("firstString(signature.catatan, signature.note, signature.notes)");
  });

  it("uses persistent application-domain links without exposing storage URLs", () => {
    const server = read("backend/src/domain-runtime.ts");
    const migration = read("supabase/migrations/20260721223000_persistent_marison_external_file_links.sql");

    expect(server).toContain('purpose: "external_marison"');
    expect(server).toContain('expires_at: null');
    expect(server).toContain('`${appUrl}/api/files/view/${rawToken}/${filename}`');
    expect(server).toContain("buildPersistentMarisonFileLink(surat, attachment.file_url, actorId)");
    expect(migration).toContain("fvt.expires_at is null or fvt.expires_at > now()");
    expect(migration).toContain("v_token.purpose not in ('email', 'external_marison')");
  });
});
