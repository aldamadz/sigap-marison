import { createHash } from "node:crypto";

export const returnedUnitFixture = () => {
  const job = { id: "g3", surat_id: "document", environment: "production", kind: "unit", generation: 3,
    replacement_of_dispatch_id: "g2", created_at: "2026-11-04T09:00:00Z", status: "processing", post_started_at: null as string | null };
  const payload = { submission_number: "051/UAI/MKT.1.SGN/X/2026", project_id: 23, branch_id: 1,
    description: "Unit revision fixture", units: [2048, 2074, 2173].map(unit_id => ({ unit_id, type: "30",
      production_code: "001/UAI/PRC/5.3/21/08/2026", addendum_atas_nominal: 10, addendum_bawah_nominal: 20 })),
    approvals: [{ role: "Direktur Utama", nik: "fixture-nik", action: "approved", actioned_at: "2026-11-04T08:59:59Z" }] };
  const body = JSON.stringify(payload);
  const previous = { id: "g2", surat_id: "document", environment: "production", kind: "unit", generation: 2,
    status: "succeeded", external_reference: "2", post_started_at: "2026-10-21T00:00:00Z", completed_at: "2026-10-21T00:00:01Z",
    response: { data: { submission_id: 2 } }, payload, payload_body: body, payload_hash: createHash("sha256").update(body).digest("hex") };
  const document = { id: "document", no_surat: payload.submission_number, status: "DONE",
    data_snapshot: { applied_revision: { event_id: "revision", restart_step: 5 },
      external_revision_current: { generation: 1, revision_event_id: "revision" } },
    surat_signatures: [1, 2, 3, 4, 5].map(step_order => ({ step_order, is_signed: true,
      signed_at: step_order < 5 ? "2026-10-21T00:00:00Z" : "2026-11-04T08:59:59Z" })) };
  const revision = { id: "revision", surat_id: "document", status: "resolved", resolved_by: "requester",
    resolved_at: "2026-11-04T08:00:00Z", changes: { external_submission_revision: true,
      external_decision_event_id: "decision", external_event_id: "external-event", revision_generation: 1, restart_step: 5 } };
  const decision = { id: "decision", event_id: "external-event", surat_id: "document", decision: "revision_required",
    revision_generation: 1, created_at: "2026-11-04T07:00:00Z" };
  const archive = { surat_id: "document", decision_event_id: "decision", generation: 1,
    document_snapshot: { id: "document", no_surat: payload.submission_number, data_snapshot: { marison_dispatch: { job_id: "g2" } } } };
  return { job, previous, evidence: { document, revision, decision, latestDecision: decision, archive, dispatches: [previous, job] } };
};
