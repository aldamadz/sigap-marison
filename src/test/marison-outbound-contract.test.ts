import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertMarisonOutboundContract,
  marisonAssetPurchaseRequestSchema,
  marisonNonUnitSubmissionSchema,
  marisonUnitSubmissionSchema,
} from "../../server/marison-outbound-contract.mjs";

const readFixture = (name) => JSON.parse(readFileSync(
  join(process.cwd(), "docs", "contracts", "marison", "v1", name),
  "utf8"
));

describe("Marison outbound contract v1", () => {
  it("accepts the canonical Unit payload supplied to the vendor", () => {
    const fixture = readFixture("unit-submission.example.json");

    expect(marisonUnitSubmissionSchema.parse(fixture)).toEqual(fixture);
    expect(assertMarisonOutboundContract("unit", fixture)).toEqual(fixture);
  });

  it("accepts the canonical Asset payload supplied to the vendor", () => {
    const fixture = readFixture("asset-purchase-request.example.json");

    expect(fixture.submission_number).toBe("001/UAI/PBO.1/VII/2026");
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

  it("requires request_number on every Asset item", () => {
    const fixture = readFixture("asset-purchase-request.example.json");
    delete fixture.items[0].request_number;

    expect(() => assertMarisonOutboundContract("asset", fixture)).toThrow(
      "Payload Marison asset tidak sesuai kontrak."
    );
  });
});
