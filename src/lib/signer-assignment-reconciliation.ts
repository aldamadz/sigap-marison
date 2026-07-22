export type ReconciliableSignerAssignment = {
  step_order: number;
  form_usage_step_id?: string;
  user_id?: string | null;
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

    return {
      ...current,
      user_id: matchingAssignment?.user_id || "",
    };
  });
}
