import { describe, expect, it } from "vitest";
import { authorizeReturnedUnitRevision, assertUnitRevisionPayload, verifyUnitRevisionReferences } from "../../backend/src/lib/marison-unit-revision";
import { returnedUnitFixture } from "./fixtures/unit-external-revision";

describe("returned external Unit revision authorization", () => {
  const authorize = (fixture = returnedUnitFixture()) => authorizeReturnedUnitRevision(fixture.job, fixture.previous, fixture.evidence);
  it("permits a returned, resolved and reapproved revision bound to the accepted submission", () => {
    expect(authorize()).toMatchObject({ revisionEventId: "revision", revisionGeneration: 1, projectId: 23,
      externalReference: "2", acceptedUnitIds: [2048, 2074, 2173] });
  });
  const tamper: [string, (fixture: ReturnType<typeof returnedUnitFixture>) => void][] = [
    ["other document", f => { f.evidence.document.id = "other"; }],
    ["other office submission number", f => { f.evidence.document.no_surat = "other"; }],
    ["other environment", f => { f.previous.environment = "staging"; }],
    ["completed revision replay", f => { f.job.status = "succeeded"; }],
    ["uncertain revision replay", f => { f.job.status = "outcome_unknown"; }],
    ["POST boundary already crossed", f => { f.job.post_started_at = "2026-11-04T09:00:01Z"; }],
    ["unknown outcome", f => { f.previous.status = "outcome_unknown"; }],
    ["another vendor receipt", f => { f.previous.external_reference = "7"; }],
    ["missing POST evidence", f => { f.previous.post_started_at = ""; }],
    ["incomplete approval", f => { f.evidence.document.status = "PROSES"; }],
    ["unsigned signer", f => { f.evidence.document.surat_signatures[4].is_signed = false; }],
    ["old final signature", f => { f.evidence.document.surat_signatures[4].signed_at = "2026-10-21T00:00:00Z"; }],
    ["unresolved revision", f => { f.evidence.revision.status = "open"; }],
    ["unattributed resolution", f => { f.evidence.revision.resolved_by = ""; }],
    ["internal revision", f => { f.evidence.revision.changes.external_submission_revision = false; }],
    ["another decision", f => { f.evidence.revision.changes.external_decision_event_id = "other"; }],
    ["another external event", f => { f.evidence.revision.changes.external_event_id = "other"; }],
    ["rejected not returned", f => { f.evidence.decision.decision = "rejected"; }],
    ["another document return", f => { f.evidence.decision.surat_id = "other"; }],
    ["consumed return reused", f => { f.evidence.archive.document_snapshot.data_snapshot.marison_dispatch.job_id = "g1"; }],
    ["stale return generation", f => { f.evidence.archive.generation = 2; }],
    ["newer pending dispatch", f => { f.evidence.dispatches.push({ ...f.job, id: "g4", generation: 4 }); }],
    ["nonsequential generation", f => { f.job.generation = 5; }],
    ["job predates resolution", f => { f.job.created_at = "2026-11-03T00:00:00Z"; }],
    ["return predates acceptance", f => { f.evidence.decision.created_at = "2026-10-20T00:00:00Z"; }],
    ["invalid resolved timestamp", f => { f.evidence.revision.resolved_at = "invalid"; }],
    ["tampered frozen payload", f => { f.previous.payload_hash = "0".repeat(64); }],
    ["payload/body mismatch", f => { f.previous.payload.project_id = 25; }],
  ];
  it.each(tamper)("rejects %s", (_name, change) => {
    const fixture = returnedUnitFixture(); change(fixture);
    expect(() => authorize(fixture)).toThrow();
  });
  it("rejects a newer decision even if the old revision is resolved", () => {
    const fixture = returnedUnitFixture();
    expect(() => authorizeReturnedUnitRevision(fixture.job, fixture.previous,
      { ...fixture.evidence, latestDecision: { ...fixture.evidence.decision, id: "later-decision" } })).toThrow();
  });
  it("binds frozen candidate number and project while allowing corrected monetary values", () => {
    const fixture = returnedUnitFixture(), authorization = authorize(fixture);
    expect(() => assertUnitRevisionPayload({ ...fixture.previous.payload,
      units: fixture.previous.payload.units.map(unit => ({ ...unit, addendum_atas_nominal: 500 })) }, authorization)).not.toThrow();
    expect(() => assertUnitRevisionPayload({ ...fixture.previous.payload, project_id: 24 }, authorization)).toThrow();
    expect(() => assertUnitRevisionPayload({ ...fixture.previous.payload, submission_number: "another" }, authorization)).toThrow();
  });
  it("allows submitted units only from the accepted payload and new unsubmitted units", () => {
    const authorization = authorize();
    expect(() => verifyUnitRevisionReferences(23, [{ id: 2048, type: "30", hasSubmitted: true },
      { id: 9999, type: "30", hasSubmitted: false }], authorization)).not.toThrow();
  });
  it.each([true, undefined, null, "false", 0])("rejects another submission's unit or unknown state %j", hasSubmitted => {
    expect(() => verifyUnitRevisionReferences(23, [{ id: 9999, type: "30", hasSubmitted }], authorize())).toThrow();
  });
  it("rejects duplicate unit IDs and cross-project selection", () => {
    const unit = { id: 2048, type: "30", hasSubmitted: true };
    expect(() => verifyUnitRevisionReferences(23, [unit, unit], authorize())).toThrow();
    expect(() => verifyUnitRevisionReferences(24, [unit], authorize())).toThrow();
  });
});
