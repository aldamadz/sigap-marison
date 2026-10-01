import { isKeu1Form } from "./keu1-form";

export const isKeu1RequesterStep = (
  form: { nomor_form?: string | null } | null | undefined,
  step: { step_order?: number; assignee_mode?: string | null; action_type?: string | null },
): boolean => isKeu1Form(form) && step.step_order === 1
  && step.assignee_mode === "requester" && (step.action_type || "approval") === "approval";

export const isKeu1FirstSignerCandidate = (
  user: { id?: string; office_id?: string | null; job_title?: string | null; is_active?: boolean; deleted_at?: string | null },
  requesterId: string,
  officeId: string,
  isBranch: boolean,
): boolean => user.is_active !== false && !user.deleted_at && Boolean(user.id) && (
  user.id === requesterId || (
    isBranch && Boolean(officeId) && user.office_id === officeId
    && /(^|[^a-z0-9])(spv|supervisor)([^a-z0-9]|$)/i.test(user.job_title || "")
  )
);
