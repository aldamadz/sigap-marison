import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

type Row = Record<string, unknown>;
const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const list = (value: unknown): Row[] => Array.isArray(value) ? value.map(record) : [];
const positive = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const date = (value: unknown) => typeof value === "string" ? Date.parse(value) : NaN;
const hold = () => Object.assign(new Error("Revisi Unit belum terbukti dikembalikan external dan selesai disetujui kembali. Periksa riwayat revisinya."),
  { status: 409, code: "unit_external_revision_unverified" });

export type UnitRevisionAuthorization = {
  revisionEventId: string;
  revisionGeneration: number;
  submissionNumber: string;
  externalReference: string;
  projectId: number;
  acceptedUnitIds: number[];
};

export const authorizeReturnedUnitRevision = (job: Row, previous: Row, evidence: {
  document: unknown; revision: unknown; decision: unknown; latestDecision: unknown; archive: unknown; dispatches: unknown;
}): UnitRevisionAuthorization => {
  const document = record(evidence.document), revision = record(evidence.revision), decision = record(evidence.decision);
  const archive = record(evidence.archive), snapshot = record(archive.document_snapshot), changes = record(revision.changes);
  const applied = record(record(document.data_snapshot).applied_revision);
  const current = record(record(document.data_snapshot).external_revision_current);
  const receipt = record(record(previous.response).data), accepted = record(previous.payload);
  const signatureRows = list(document.surat_signatures), dispatches = list(evidence.dispatches);
  const restart = changes.restart_step ?? applied.restart_step ?? 1;
  const revisionTime = date(revision.resolved_at), decisionTime = date(decision.created_at);
  const previousTime = date(previous.completed_at), jobTime = date(job.created_at);
  if (job.kind !== "unit" || previous.kind !== "unit" || !["processing", "failed_terminal"].includes(String(job.status))
    || job.post_started_at != null || !positive(job.generation) || !positive(previous.generation)
    || job.generation !== previous.generation + 1 || job.replacement_of_dispatch_id !== previous.id
    || previous.surat_id !== job.surat_id || previous.environment !== job.environment || previous.status !== "succeeded"
    || !Number.isFinite(date(previous.post_started_at)) || !positive(receipt.submission_id)
    || String(receipt.submission_id) !== previous.external_reference
    || document.id !== job.surat_id || !["DONE", "SELESAI"].includes(String(document.status))
    || typeof document.no_surat !== "string" || !document.no_surat.trim()
    || accepted.submission_number !== document.no_surat || snapshot.id !== document.id || snapshot.no_surat !== document.no_surat
    || record(record(snapshot.data_snapshot).marison_dispatch).job_id !== previous.id
    || archive.surat_id !== document.id || revision.surat_id !== document.id || decision.surat_id !== document.id
    || typeof revision.id !== "string" || !revision.id || revision.id !== (applied.event_id || current.revision_event_id)
    || revision.status !== "resolved" || !revision.resolved_by
    || changes.external_submission_revision !== true || changes.external_decision_event_id !== decision.id
    || changes.external_event_id !== decision.event_id || decision.decision !== "revision_required"
    || decision.id !== record(evidence.latestDecision).id || archive.decision_event_id !== decision.id
    || !positive(decision.revision_generation) || archive.generation !== decision.revision_generation
    || changes.revision_generation !== decision.revision_generation
    || !positive(restart) || ![revisionTime, decisionTime, previousTime, jobTime].every(Number.isFinite)
    || decisionTime < previousTime || revisionTime < decisionTime || jobTime < revisionTime
    || signatureRows.length === 0 || !signatureRows.some(signature => Number(signature.step_order) >= restart)
    || signatureRows.some(signature => !positive(signature.step_order) || signature.is_signed !== true || !Number.isFinite(date(signature.signed_at))
      || (Number(signature.step_order) >= restart && date(signature.signed_at) < revisionTime))
    || dispatches.length !== 2 || !dispatches.some(dispatch => dispatch.id === job.id)
    || !dispatches.some(dispatch => dispatch.id === previous.id)
    || dispatches.some(dispatch => dispatch.id !== job.id && dispatch.id !== previous.id)
    || !positive(accepted.project_id) || !Array.isArray(accepted.units) || accepted.units.length === 0
    || typeof previous.payload_body !== "string" || typeof previous.payload_hash !== "string"
    || createHash("sha256").update(previous.payload_body).digest("hex") !== previous.payload_hash) throw hold();
  let frozen: unknown;
  try { frozen = JSON.parse(previous.payload_body); } catch { throw hold(); }
  const ids = list(accepted.units).map(unit => unit.unit_id);
  if (!isDeepStrictEqual(frozen, accepted) || ids.some(id => !positive(id)) || new Set(ids).size !== ids.length) throw hold();
  return { revisionEventId: String(revision.id), revisionGeneration: decision.revision_generation,
    submissionNumber: document.no_surat, externalReference: String(previous.external_reference),
    projectId: accepted.project_id, acceptedUnitIds: ids as number[] };
};

export const assertUnitRevisionPayload = (payload: unknown, authorization: UnitRevisionAuthorization) => {
  const body = record(payload), units = list(body.units), ids = units.map(unit => unit.unit_id);
  if (body.submission_number !== authorization.submissionNumber || body.project_id !== authorization.projectId
    || units.length === 0 || ids.some(id => !positive(id)) || new Set(ids).size !== ids.length) throw hold();
};

export const verifyUnitRevisionReferences = (projectId: number, references: { id: number; type: string; hasSubmitted: unknown }[],
  authorization: UnitRevisionAuthorization) => {
  if (projectId !== authorization.projectId || references.length === 0 || new Set(references.map(unit => unit.id)).size !== references.length
    || references.some(unit => !positive(unit.id) || !unit.type.trim() || unit.type.length > 100
      || (unit.hasSubmitted !== false && !(unit.hasSubmitted === true && authorization.acceptedUnitIds.includes(unit.id))))) {
    throw Object.assign(new Error("Kavling revisi tidak terbukti milik pengajuan semula atau status external belum pasti."), { status: 422 });
  }
};
