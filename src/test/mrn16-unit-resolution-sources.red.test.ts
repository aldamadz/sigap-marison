import { describe, expect, it } from "vitest";
import {
  classifyMarisonRecoveryIssue,
  isPrePostRecoveryEligible,
  normalizePayloadResolutionSources,
} from "../../server/marison-payload-identity.mjs";

describe("MRN-16 canonical resolution sources", () => {
  it("normalizes legacy requester nik to canonical requesterNik", () => {
    expect(normalizePayloadResolutionSources({ nik: "external_source", branchId: "external_source", projectId: "external_source", "approval:1:signer": "external_source" }, { kind: "unit", approvalCount: 1 })).toEqual({
      requesterNik: "external_source",
      branchId: "external_source",
      projectId: "external_source",
      "approval:1:signer": "external_source",
    });
  });

  it.each(["unit", "non_unit", "asset"])("validates %s required sources", (kind) => {
    const sources: Record<string, string> = { requesterNik: "external_source", branchId: "staging_mapping", "approval:1:signer": "external_source" };
    if (kind !== "asset") sources.projectId = "external_source";
    expect(normalizePayloadResolutionSources(sources, { kind, approvalCount: 1 })).toEqual(sources);
  });

  it("rejects unavailable sources and mismatched approval count", () => {
    expect(() => normalizePayloadResolutionSources({ requesterNik: "unavailable", branchId: "external_source", "approval:1:signer": "external_source" }, { kind: "asset", approvalCount: 1 })).toThrow();
    expect(() => normalizePayloadResolutionSources({ requesterNik: "external_source", branchId: "external_source", "approval:1:signer": "external_source" }, { kind: "asset", approvalCount: 2 })).toThrow();
  });

  it("requires only project and signer sources for Fund Submission", () => {
    expect(normalizePayloadResolutionSources({
      projectId: "external_source",
      requesterNik: "unavailable",
      branchId: "unavailable",
      "approval:1:signer": "staging_mapping",
    }, { kind: "fund", approvalCount: 1 })).toEqual({
      projectId: "external_source",
      "approval:1:signer": "staging_mapping",
    });
    expect(() => normalizePayloadResolutionSources({
      "approval:1:signer": "external_source",
    }, { kind: "fund", approvalCount: 1 })).toThrow("Metadata sumber payload belum lengkap");
  });

  it("drops projectId from Asset metadata because the vendor Asset contract does not use projects", () => {
    expect(normalizePayloadResolutionSources({
      requesterNik: "external_source",
      branchId: "external_source",
      projectId: "unavailable",
      "approval:1:signer": "external_source",
    }, { kind: "asset", approvalCount: 1 })).toEqual({
      requesterNik: "external_source",
      branchId: "external_source",
      "approval:1:signer": "external_source",
    });
  });

  it("allows only failed pre-POST staging jobs to recover", () => {
    const base = { environment: "staging", status: "failed_terminal", post_started_at: null, response: null, external_reference: null };
    expect(isPrePostRecoveryEligible(base, "staging")).toBe(true);
    expect(isPrePostRecoveryEligible({ ...base, environment: "production" }, "staging")).toBe(false);
    expect(isPrePostRecoveryEligible({ ...base, post_started_at: "2026-08-03T00:00:00Z" }, "staging")).toBe(false);
    expect(isPrePostRecoveryEligible(base, "production")).toBe(false);
    expect(isPrePostRecoveryEligible(null, "staging")).toBe(false);
  });

  it.each([
    ["Penandatangan tahap 2 belum memiliki mapping.", "SIGNER_IDENTITY_MISSING"],
    ["Pemohon belum memiliki mapping.", "REQUESTER_IDENTITY_MISSING"],
    ["Effective branch ID outbound tidak tervalidasi.", "BRANCH_IDENTITY_MISSING"],
    ["Effective project ID outbound tidak tervalidasi.", "PROJECT_IDENTITY_MISSING"],
    ["Effective project dan branch outbound tidak cocok.", "PROJECT_BRANCH_MISMATCH"],
  ])("classifies recovery issue %s", (message, reasonCode) => {
    expect(classifyMarisonRecoveryIssue(message)).toMatchObject({ reasonCode });
  });
});
