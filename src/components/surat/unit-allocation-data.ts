export type UnitAllocationData = {
  units: unknown[];
  project: unknown;
  requestedCount: unknown;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

export const getUnitAllocationData = (source: unknown): UnitAllocationData => {
  const surat = asRecord(source);
  const formInput = asRecord(surat.form_input_data);
  const snapshot = asRecord(surat.data_snapshot);
  const snapshotInput = asRecord(snapshot.input);
  const revision = asRecord(snapshot.revision);
  const revisionChanges = asRecord(revision.changes);
  const revisionCheckerInput = asRecord(revisionChanges.checker_input_snapshot);
  const appliedRevision = asRecord(snapshot.applied_revision);
  const appliedRevisionChanges = asRecord(appliedRevision.changes);
  const appliedCheckerInput = asRecord(appliedRevisionChanges.checker_input_snapshot);
  const verificationInputs = asRecord(snapshot.verification_inputs);
  const latestVerificationInput = asRecord(verificationInputs.latest);
  const verificationDrafts = asRecord(snapshot.verification_drafts);
  const latestVerificationDraftInput = Object.values(verificationDrafts)
    .map((value) => asRecord(value))
    .filter((draft) => asArray(asRecord(draft.input).allocated_units).length > 0)
    .sort((left, right) => String(right.saved_at || "").localeCompare(String(left.saved_at || "")))
    .map((draft) => asRecord(draft.input))[0] || {};

  const allocatedUnits = asArray(formInput.allocated_units).length > 0
    ? asArray(formInput.allocated_units)
    : asArray(snapshotInput.allocated_units).length > 0
      ? asArray(snapshotInput.allocated_units)
      : asArray(latestVerificationInput.allocated_units).length > 0
        ? asArray(latestVerificationInput.allocated_units)
        : asArray(latestVerificationDraftInput.allocated_units).length > 0
          ? asArray(latestVerificationDraftInput.allocated_units)
          : asArray(revisionCheckerInput.allocated_units).length > 0
            ? asArray(revisionCheckerInput.allocated_units)
            : asArray(appliedCheckerInput.allocated_units).length > 0
              ? asArray(appliedCheckerInput.allocated_units)
              : asArray(snapshot.allocated_units);

  const project =
    formInput.allocated_project ||
    snapshotInput.allocated_project ||
    latestVerificationInput.allocated_project ||
    latestVerificationDraftInput.allocated_project ||
    revisionCheckerInput.allocated_project ||
    appliedCheckerInput.allocated_project ||
    snapshot.allocated_project ||
    formInput.requested_project ||
    snapshotInput.requested_project ||
    latestVerificationInput.requested_project ||
    latestVerificationDraftInput.requested_project ||
    revisionCheckerInput.requested_project ||
    appliedCheckerInput.requested_project ||
    snapshot.requested_project ||
    null;

  const requestedCount =
    formInput.requested_unit_count ||
    snapshotInput.requested_unit_count ||
    latestVerificationInput.requested_unit_count ||
    latestVerificationDraftInput.requested_unit_count ||
    revisionCheckerInput.requested_unit_count ||
    appliedCheckerInput.requested_unit_count ||
    snapshot.requested_unit_count ||
    formInput.allocated_unit_count ||
    snapshotInput.allocated_unit_count ||
    latestVerificationInput.allocated_unit_count ||
    latestVerificationDraftInput.allocated_unit_count ||
    revisionCheckerInput.allocated_unit_count ||
    appliedCheckerInput.allocated_unit_count ||
    snapshot.allocated_unit_count ||
    allocatedUnits.length;

  return {
    units: allocatedUnits,
    project,
    requestedCount,
  };
};

export const hasUnitAllocationData = (source: unknown) => getUnitAllocationData(source).units.length > 0;
