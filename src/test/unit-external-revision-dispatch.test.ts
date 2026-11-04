import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertUnitDispatchContract, classifyUnitDispatchIntent, unitRevisionContractMessage } from "../../backend/src/lib/marison-unit-dispatch-intent";

const job = { id: "g3", surat_id: "document", environment: "production", kind: "unit", generation: 3,
  replacement_of_dispatch_id: "g2" };
const accepted = { id: "g2", surat_id: "document", environment: "production", kind: "unit", generation: 2,
  status: "succeeded", external_reference: "2" };

describe("Unit accepted revision versus rejected replacement", () => {
  it("recognizes an accepted predecessor without treating submitted units as new", () => {
    expect(classifyUnitDispatchIntent(job, accepted)).toBe("accepted_submission_revision");
    expect(() => assertUnitDispatchContract(job, accepted)).toThrow(unitRevisionContractMessage);
    try { assertUnitDispatchContract(job, accepted); } catch (error) {
      expect(error).toMatchObject({ status: 409, code: "unit_external_revision_contract_required" });
    }
  });
  it("preserves initial and rejected replacement paths", () => {
    expect(assertUnitDispatchContract({ ...job, replacement_of_dispatch_id: null }, null)).toBe("initial");
    expect(assertUnitDispatchContract(job, { ...accepted, status: "failed_terminal", external_reference: null })).toBe("rejected_replacement");
    expect(assertUnitDispatchContract({ ...job, kind: "fund" }, null)).toBe("initial");
  });
  it.each([null, { ...accepted, id: "other" }, { ...accepted, surat_id: "other" },
    { ...accepted, environment: "staging" }, { ...accepted, kind: "asset" }, { ...accepted, generation: 3 },
    { ...accepted, status: "outcome_unknown" }, { ...accepted, status: "failed_terminal" }])(
    "fails closed for missing, cross-context or uncertain predecessor %j", (previous) => {
      expect(() => assertUnitDispatchContract(job, previous)).toThrow();
    },
  );
  it("protects frozen payload materialization and blocks recovery before any vendor query", () => {
    const source = readFileSync("backend/src/domain-runtime.ts", "utf8");
    const build = source.slice(source.indexOf("const buildMarisonOutboundJob ="), source.indexOf("const listMarisonOutboundDispatches ="));
    expect(build.indexOf("await requireUnitDispatchContract(job)")).toBeLessThan(build.indexOf("if (job.payload_body)"));
    expect(build).toContain('Boolean(job.replacement_of_dispatch_id) && !unitRevisionAuthorization');
    expect(build).toContain('verifyUnitRevisionReferences(logicalPayload.project_id');
    const preflight = source.slice(source.indexOf("const preflightMarisonOutboundRecovery ="), source.indexOf("const reconcileMarisonOutboundDispatch ="));
    expect(preflight.indexOf("await requireUnitDispatchContract(job)")).toBeLessThan(preflight.indexOf("resolveMarisonOutboundIdentity"));
    expect(preflight).toContain("UNIT_EXTERNAL_REVISION_UNVERIFIED");
    expect(source).not.toContain("failureReason: revisionContractPending ? unitRevisionContractMessage");
    const getPreflight = source.slice(source.indexOf("const marisonPreflightMatch ="), source.indexOf("const marisonReplacementPreflightMatch ="));
    expect(getPreflight).toContain("generation, created_at, replacement_of_dispatch_id");
  });
});
