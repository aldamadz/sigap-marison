import { describe, expect, it } from "vitest";
import { resolveMarisonOutboundNik } from "../../server/marison-outbound-identity.mjs";

describe("Marison outbound NIK policy", () => {
  it("replaces requester and signer NIK with the configured staging identity", () => {
    expect(resolveMarisonOutboundNik({
      environment: "staging",
      stagingOverride: "A 114",
      candidates: ["A 001", "A 002"],
    })).toBe("A 114");
  });

  it("never applies the staging override in production", () => {
    expect(resolveMarisonOutboundNik({
      environment: "production",
      stagingOverride: "A 114",
      candidates: ["A 001"],
    })).toBe("A 001");
  });

  it("falls back to the first available NIK when no staging override is configured", () => {
    expect(resolveMarisonOutboundNik({
      environment: "staging",
      stagingOverride: "",
      candidates: [null, "", "A 002"],
    })).toBe("A 002");
  });
});
