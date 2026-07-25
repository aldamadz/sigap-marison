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
    expect(server).toContain('assertMarisonOutboundContract("unit", payload)');
    expect(server).toContain('assertMarisonOutboundContract("non_unit", {');
    expect(server).toContain('assertMarisonOutboundContract("asset", payload)');
    expect(server).toContain("project_id: projectId");
    expect(server).toContain("branch_id: branchId");
    expect(server).toContain("addendum_atas_label");
    expect(server).toContain("request_number: firstString(");
    expect(server).toContain('name: "Dokumen Rekomendasi Aset"');
    expect(server).toContain("contract_version: dispatch.contractVersion");
    expect(server).toContain("payload_hash: sha256Hex");
    expect(server).toContain("marisonOutboundNik(profile.nik, signerSnapshot.nik, signature.nik)");
    expect(server).toContain("marisonOutboundNik(surat.requester_snapshot?.nik, surat.data_snapshot?.requester?.nik)");
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

  it("accepts the database final status and skips recommendation child documents", () => {
    const server = read("server.mjs");

    expect(server).toContain('["SELESAI", "DONE"]');
    expect(server).toContain('dispatchInput.linked_parent_surat_id');
    expect(server).toContain("Dokumen rekomendasi mengikuti pengajuan induk");
    expect(server).toContain("signed_at, catatan, signer_snapshot");
    expect(server).toContain("firstString(signature.catatan, signature.note, signature.notes)");
  });

  it("uses persistent application-domain links without exposing storage URLs", () => {
    const server = read("server.mjs");
    const migration = read("supabase/migrations/20260721223000_persistent_marison_external_file_links.sql");

    expect(server).toContain('purpose: "external_marison"');
    expect(server).toContain('expires_at: null');
    expect(server).toContain('`${appUrl}/api/files/view/${rawToken}/${filename}`');
    expect(server).toContain("buildPersistentMarisonFileLink(surat, attachment.file_url, actorId)");
    expect(migration).toContain("fvt.expires_at is null or fvt.expires_at > now()");
    expect(migration).toContain("v_token.purpose not in ('email', 'external_marison')");
  });
});
