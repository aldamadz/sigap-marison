type ApprovalSignature = {
  step_order?: number | null;
};

export const getSortedApprovalSignatures = <T extends ApprovalSignature>(
  surat: { surat_signatures?: T[] | null } | null | undefined,
): T[] => [...(surat?.surat_signatures || [])]
  .sort((left, right) => Number(left.step_order || 0) - Number(right.step_order || 0));
