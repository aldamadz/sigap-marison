import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  VERIFIER_OPTIONAL_ATTACHMENT_KEY,
  hasValidOptionalFileSignature,
  validateVerifierOptionalUpload,
} from "../../backend/src/lib/verifier-optional-attachment";
import { VERIFIER_ADDITIONAL_ATTACHMENT_KEY } from "@/lib/optional-surat-attachments";

const input = () => ({
  stage: "approval",
  metadata: [{ key: VERIFIER_OPTIONAL_ATTACHMENT_KEY }],
  files: [{ name: "bukti.pdf", type: "application/pdf", size: 100 }],
  actorId: "verifier",
  verifierIds: ["verifier"],
  verificationRequired: true,
  verificationStatus: "pending",
});

describe("verifier optional attachment boundary", () => {
  it("keeps frontend and backend keys identical", () => {
    expect(VERIFIER_OPTIONAL_ATTACHMENT_KEY).toBe(VERIFIER_ADDITIONAL_ATTACHMENT_KEY);
  });
  it("allows the active verifier only", () => {
    expect(() => validateVerifierOptionalUpload(input())).not.toThrow();
    expect(() => validateVerifierOptionalUpload({ ...input(), actorId: "signer" })).toThrow(/tim pemeriksa/);
    expect(() => validateVerifierOptionalUpload({ ...input(), verificationStatus: "verified" })).toThrow(/tugas aktif/);
    expect(() => validateVerifierOptionalUpload({ ...input(), stage: "initial" })).toThrow(/tim pemeriksa/);
  });
  it("rejects oversized, unsupported and mismatched payloads", () => {
    expect(() => validateVerifierOptionalUpload({ ...input(), files: [{ name: "x.exe", type: "application/x-msdownload", size: 10 }] })).toThrow(/PDF/);
    expect(() => validateVerifierOptionalUpload({ ...input(), files: [{ name: "x.pdf", type: "application/pdf", size: 5 * 1024 * 1024 }] })).toThrow(/4 MB/);
    expect(() => validateVerifierOptionalUpload({ ...input(), files: [] })).toThrow(/Jumlah/);
  });
  it("checks file signatures rather than trusting MIME alone", () => {
    expect(hasValidOptionalFileSignature("application/pdf", new TextEncoder().encode("%PDF-1.7"))).toBe(true);
    expect(hasValidOptionalFileSignature("application/pdf", new TextEncoder().encode("<html>"))).toBe(false);
    expect(hasValidOptionalFileSignature("image/png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
    expect(hasValidOptionalFileSignature("image/jpeg", new Uint8Array([255, 216, 255]))).toBe(true);
  });
  it("validates identity and bytes before touching old rows, then appends optional files", () => {
    const source = readFileSync(resolve("backend/src/domain-runtime.ts"), "utf8");
    const handler = source.slice(source.indexOf("const replaceSignatureAttachmentFiles ="), source.indexOf("const fillEndpointTemplate ="));
    expect(handler.indexOf("validateVerifierOptionalUpload(")).toBeGreaterThan(0);
    expect(handler.indexOf("hasValidOptionalFileSignature(")).toBeGreaterThan(handler.indexOf("validateVerifierOptionalUpload("));
    expect(handler).toContain('supabase.rpc("is_inbox_task_active"');
    expect(handler.indexOf('supabase.rpc("is_inbox_task_active"')).toBeLessThan(handler.indexOf("const { data: oldRows"));
    expect(handler.indexOf("hasValidOptionalFileSignature(")).toBeLessThan(handler.indexOf("const { data: oldRows"));
    expect(handler).toContain('supabase.rpc("replace_signature_attachment_metadata"');
    expect(handler).toContain("p_expected: oldRows || [], p_files: rows");
    expect(handler.indexOf('.upload(filePath')).toBeLessThan(handler.indexOf('supabase.rpc("replace_signature_attachment_metadata"'));
    expect(handler).not.toContain('.remove(');
    expect(handler).not.toContain('.delete()');
  });
});
