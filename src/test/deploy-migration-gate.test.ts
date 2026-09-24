import { describe, expect, it } from "vitest";
import { validateMigrationAcknowledgement } from "../../scripts/deploy-migration-gate.mjs";

describe("controlled deployment migration acknowledgement", () => {
  it("keeps normal no-migration deployments automatic", () => {
    expect(validateMigrationAcknowledgement("", "")).toBe("");
    expect(() => validateMigrationAcknowledgement("", "20260924170000")).toThrow();
  });

  it("requires every added migration version to be acknowledged exactly", () => {
    const diff = "A\tsupabase/migrations/20260924170000_guard.sql\nA\tsupabase/migrations/20260924160000_token.sql\n";
    expect(validateMigrationAcknowledgement(diff, "20260924160000,20260924170000")).toBe("20260924160000,20260924170000");
    expect(() => validateMigrationAcknowledgement(diff, "20260924170000")).toThrow();
    expect(() => validateMigrationAcknowledgement(diff, "20260924170000,20260924160000")).toThrow();
  });

  it.each(["M", "D", "R100"])("rejects %s migrations even with an acknowledgement", (status) => {
    expect(() => validateMigrationAcknowledgement(`${status}\tsupabase/migrations/20260924170000_guard.sql`, "20260924170000")).toThrow();
  });

  it("rejects duplicate or malformed migration versions", () => {
    expect(() => validateMigrationAcknowledgement("A\tsupabase/migrations/20260924170000_a.sql\nA\tsupabase/migrations/20260924170000_b.sql", "20260924170000")).toThrow();
    expect(() => validateMigrationAcknowledgement("A\tsupabase/migrations/guard.sql", "")).toThrow();
  });
});
