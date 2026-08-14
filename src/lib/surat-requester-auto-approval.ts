export type InitialRequesterApprovalContext = {
  actorId: string;
  surat: {
    created_by?: string | null;
    current_step?: number | null;
    status?: string | null;
  } | null;
  signature: {
    user_id?: string | null;
    step_order?: number | null;
    is_signed?: boolean | null;
    action_type?: string | null;
    verification_required?: boolean | null;
    requires_unit_allocation?: boolean | null;
  } | null;
};

export const canAutoApproveRequesterFirstStep = ({
  actorId,
  surat,
  signature,
}: InitialRequesterApprovalContext): boolean => Boolean(
  actorId &&
  surat &&
  signature &&
  surat.status === "PROSES" &&
  Number(surat.current_step) === 1 &&
  Number(signature.step_order) === 1 &&
  surat.created_by === actorId &&
  signature.user_id === actorId &&
  signature.is_signed !== true &&
  (signature.action_type || "approval") === "approval" &&
  signature.verification_required !== true &&
  signature.requires_unit_allocation !== true
);
