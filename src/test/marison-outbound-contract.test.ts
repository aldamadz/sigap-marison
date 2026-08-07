import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertMarisonOutboundContract,
  MARISON_ASSET_CONTRACT_VERSION,
  marisonAssetPurchaseRequestSchema,
  marisonNonUnitSubmissionSchema,
  marisonUnitSubmissionSchema,
  normalizeMarisonApprovalRole,
  normalizeMarisonSubmissionApprovals,
} from "../../server/marison-outbound-contract.mjs";

const readFixture = (name) => JSON.parse(readFileSync(
  join(process.cwd(), "docs", "contracts", "marison", "v1", name),
  "utf8"
));

describe("Marison outbound contract v1", () => {
  it("maps Unit and Non Unit signer labels to vendor approval roles", () => {
    expect(normalizeMarisonApprovalRole("non_unit", "Spv. Teknik")).toBe("planning");
    expect(normalizeMarisonApprovalRole("non_unit", "Branch Manager")).toBe("planning");
    expect(normalizeMarisonApprovalRole("non_unit", "Mgr. Marketing")).toBe("marketing");
    expect(normalizeMarisonApprovalRole("non_unit", "Direktur Utama")).toBe("director");
    expect(normalizeMarisonApprovalRole("unit", "Direksi")).toBe("director");
  });

  it("preserves approval identity data and Asset role labels", () => {
    const approvals = [{
      role: "Mgr. Marketing",
      nik: "I 001",
      action: "approved",
      actioned_at: "2026-08-07T03:00:00.000Z",
    }];

    expect(normalizeMarisonSubmissionApprovals("non_unit", approvals)).toEqual([
      { ...approvals[0], role: "marketing" },
    ]);
    expect(normalizeMarisonSubmissionApprovals("asset", approvals)).toEqual(approvals);
    expect(approvals[0].role).toBe("Mgr. Marketing");
  });

  it("pins the active Asset OpenAPI revision independently", () => {
    expect(MARISON_ASSET_CONTRACT_VERSION).toBe("vendor-openapi-asset-2026-08-06");
  });
  it("accepts the canonical Unit payload supplied to the vendor", () => {
    const fixture = readFixture("unit-submission.example.json");

    expect(marisonUnitSubmissionSchema.parse(fixture)).toEqual(fixture);
    expect(assertMarisonOutboundContract("unit", fixture)).toEqual(fixture);
  });

  it("accepts the canonical Asset payload supplied to the vendor", () => {
    const fixture = readFixture("asset-purchase-request.example.json");

    expect(fixture.request_number).toBe("001/UAI/PBO.1/VII/2026");
    expect(fixture.submitted_by).toBe("A 114");
    expect(marisonAssetPurchaseRequestSchema.parse(fixture)).toEqual(fixture);
    expect(assertMarisonOutboundContract("asset", fixture)).toEqual(fixture);
  });

  it("accepts the canonical Non Unit payload supplied to the vendor", () => {
    const fixture = readFixture("non-unit-submission.example.json");

    expect(marisonNonUnitSubmissionSchema.parse(fixture)).toEqual(fixture);
    expect(assertMarisonOutboundContract("non_unit", fixture)).toEqual(fixture);
  });

  it("rejects fields from the unpublished nested Unit contract", () => {
    const fixture = readFixture("unit-submission.example.json");
    fixture.project = { id: fixture.project_id };
    delete fixture.project_id;

    expect(() => assertMarisonOutboundContract("unit", fixture)).toThrow(
      "Payload Marison unit tidak sesuai kontrak."
    );
  });

  it("requires one top-level request_number and rejects the legacy item field", () => {
    const fixture = readFixture("asset-purchase-request.example.json");
    const missingRequestNumber = structuredClone(fixture);
    delete missingRequestNumber.request_number;
    expect(() => assertMarisonOutboundContract("asset", missingRequestNumber)).toThrow(
      "Payload Marison asset tidak sesuai kontrak."
    );

    const legacyItemRequestNumber = structuredClone(fixture);
    legacyItemRequestNumber.items[0].request_number = fixture.request_number;
    expect(() => assertMarisonOutboundContract("asset", legacyItemRequestNumber)).toThrow(
      "Payload Marison asset tidak sesuai kontrak."
    );
  });

  it("rejects fields absent from the active vendor Asset OpenAPI", () => {
    const fixture = readFixture("asset-purchase-request.example.json");
    fixture.category = "Pengajuan Pusat";
    expect(() => assertMarisonOutboundContract("asset", fixture)).toThrow(
      "Payload Marison asset tidak sesuai kontrak."
    );
  });
});
