const parseId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export const resolveMarisonEffectiveProjectBranch = ({
  kind,
  officeBranchId,
  officeSource,
  sourceProject,
  mappedProject,
}) => {
  const project = mappedProject || sourceProject;
  const projectId = parseId(project?.marison_project_id);
  const projectBranchId = parseId(project?.master_offices?.marison_branch_id);
  const projectSynced = Boolean(project?.marison_synced_at);
  const projectOfficeSynced = Boolean(project?.master_offices?.marison_synced_at);
  const officeId = parseId(officeBranchId);

  if (kind === "asset") {
    if (officeId === null) return { projectId: null, branchId: null, branchSource: "unavailable" };
    return { projectId: null, branchId: officeId, branchSource: officeSource || "external_source" };
  }
  if (projectId === null || !projectSynced || projectBranchId === null || !projectOfficeSynced) {
    throw new Error("Effective project dan branch outbound tidak tervalidasi.");
  }
  return {
    projectId,
    branchId: projectBranchId,
    branchSource: mappedProject ? "staging_mapping" : "external_source",
  };
};
