export type ReconciliableSignerAssignment = {
  step_order: number;
  form_usage_step_id?: string;
  user_id?: string | null;
  eligible_user_ids?: string[];
  [key: string]: unknown;
};

/**
 * Rebuilds a draft's signer assignments from the latest workflow definition.
 * Workflow metadata always comes from the current configuration; only the
 * selected signer is carried over when the workflow step still exists.
 */
export function reconcileSignerAssignments<T extends ReconciliableSignerAssignment>(
  currentAssignments: T[],
  persistedAssignments: ReconciliableSignerAssignment[] = [],
  resolveRequesterUserId?: (assignment: T, persistedUserId: string) => string,
): T[] {
  const persistedByStepId = new Map(
    persistedAssignments
      .filter((assignment) => Boolean(assignment.form_usage_step_id))
      .map((assignment) => [assignment.form_usage_step_id as string, assignment]),
  );
  const persistedUsesStepIds = persistedByStepId.size > 0;

  return currentAssignments.map((current) => {
    const persisted = current.form_usage_step_id
      ? persistedByStepId.get(current.form_usage_step_id)
      : undefined;
    const legacyPersisted = !persisted && !persistedUsesStepIds
      ? persistedAssignments.find((assignment) => assignment.step_order === current.step_order)
      : undefined;
    const matchingAssignment = persisted || legacyPersisted;
    const persistedUserId = String(matchingAssignment?.user_id || "");
    if (current.assignee_mode === "requester") {
      return { ...current, user_id: resolveRequesterUserId?.(current, persistedUserId) || "" };
    }
    const configuredCandidates = Array.isArray(current.eligible_user_ids)
      ? current.eligible_user_ids.filter(Boolean)
      : [];
    const userIsStillEligible = persistedUserId
      ? configuredCandidates.includes(persistedUserId)
      : false;
    const nextUserId = userIsStillEligible
      ? persistedUserId
      : configuredCandidates.length === 1
        ? configuredCandidates[0]
        : "";

    return {
      ...current,
      user_id: nextUserId,
    };
  });
}
