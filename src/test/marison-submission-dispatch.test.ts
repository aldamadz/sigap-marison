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
    expect(worker).toContain('["POST", url.pathname, accessToken, prepared.transportHash || prepared.payloadHash, timestamp].join(":")');
    expect(worker).toContain("mark_marison_outbound_post_started");
    expect(worker).toContain("complete_marison_outbound_after_post");
    expect(server).not.toContain("postMarisonProtectedJson");
    expect(server).toContain('assertMarisonOutboundContract("unit", payload)');
    expect(server).toContain('assertMarisonOutboundContract("non_unit", {');
    expect(server).toContain("assertMarisonOutboundContract(job.kind, materialized.payload)");
    expect(server).toContain('normalizeMarisonSubmissionApprovals("unit", overrides.approvals)');
    expect(server).toContain('normalizeMarisonSubmissionApprovals("non_unit", overrides.approvals)');
    expect(server).not.toContain('normalizeMarisonSubmissionApprovals("asset", overrides.approvals)');
    expect(server).toContain("project_id: projectId");
    expect(server).toContain("branch_id: branchId");
    expect(server).toContain("addendum_atas_label");
    expect(server).toContain("request_number: surat.no_surat");
    expect(server).not.toContain("submission_number: surat.no_surat,\n    branch_id: branchId,\n    submitted_by: overrides.nik");
    expect(server).not.toContain("record.request_number,");
    expect(server).not.toContain("sharedRequestAttachments");
    expect(server).toContain("recommendationFileReference(recommendationDocument.id)");
    expect(server).toContain("p_contract_version: dispatch.contractVersion");
    expect(server).toContain("p_payload_hash: payloadHash");
    expect(server).toContain("submitted_by: overrides.nik");
    expect(server).toContain("getMarisonOutboundMappings(surat, job.kind)");
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

  it("routes Non Aset through the strict Fund Submission contract", () => {
    const server = read("backend/src/domain-runtime.ts");
    const worker = read("server/marison-outbound-worker.mjs");
    const form = read("src/components/surat/SuratForm.tsx");
    const migration = read("supabase/migrations/20260811153000_fund_submission_outbound.sql");

    expect(server).toContain("buildMarisonFundPayload");
    expect(server).toContain('category === "non_asset" || category === "nonasset"');
    expect(server).toContain('/employees?search=${encodeURIComponent(overrides.nik)}');
    expect(server).toContain("resolveMarisonFundDivision");
    expect(server).not.toContain("division: department.name");
    expect(worker).toContain('fund: "/fund-submissions"');
    expect(form).toContain('setInputValue("fund_type", value)');
    expect(form).toContain('<SelectItem value="operational">Biaya Operasional</SelectItem>');
    expect(form).toContain('<SelectItem value="production_cost">Biaya Produksi</SelectItem>');
    expect(migration).toContain("v_kind := 'fund'; v_endpoint := '/fund-submissions';");
    expect(migration).not.toContain("update public.surat_registrasi");
  });
});
