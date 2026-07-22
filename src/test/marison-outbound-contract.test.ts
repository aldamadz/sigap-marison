import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertMarisonOutboundContract,
  marisonAssetPurchaseRequestSchema,
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

    expect(marisonAssetPurchaseRequestSchema.parse(fixture)).toEqual(fixture);
    expect(assertMarisonOutboundContract("asset", fixture)).toEqual(fixture);
  });

  it("rejects silent field additions or renames", () => {
    const fixture = readFixture("unit-submission.example.json");
    fixture.project.project_name = fixture.project.name;
    delete fixture.project.name;

    expect(() => assertMarisonOutboundContract("unit", fixture)).toThrow(
      "Payload Marison unit tidak sesuai kontrak."
    );
  });

  it("rejects totals that do not match the item arrays", () => {
    const fixture = readFixture("asset-purchase-request.example.json");
    fixture.total_items += 1;

    expect(() => assertMarisonOutboundContract("asset", fixture)).toThrow(
      "Payload Marison asset tidak sesuai kontrak."
    );
  });
});

