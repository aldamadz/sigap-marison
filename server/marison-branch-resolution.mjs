const parseId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export const resolveMarisonEffectiveProjectBranch = ({
  kind,
  officeBranchId,
  sourceProject,
  mappedProject,
}) => {
  const project = mappedProject || sourceProject;
  const projectId = parseId(project?.marison_project_id);
  const projectBranchId = parseId(project?.master_offices?.marison_branch_id);
  const officeId = parseId(officeBranchId);

  if (kind === "asset") {
    if (officeId === null) throw new Error("Effective office branch ID outbound tidak tervalidasi.");
    return { projectId: null, branchId: officeId, branchSource: "office" };
  }
  if (projectId === null || projectBranchId === null) {
    throw new Error("Effective project dan branch outbound tidak tervalidasi.");
  }
  return {
    projectId,
    branchId: projectBranchId,
    branchSource: mappedProject ? "staging_mapping" : "external_source",
  };
};
