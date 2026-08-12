import {
  assertMarisonOutboundContract,
  MARISON_FUND_CONTRACT_VERSION,
} from "./marison-outbound-contract.mjs";

const text = (value) => String(value ?? "").trim();
const nullableText = (value) => text(value) || null;

const normalizeFundApproval = (approval) => ({
  role: text(approval?.role),
  nik: text(approval?.nik),
  action: text(approval?.action),
  actioned_at: text(approval?.actioned_at),
  notes: nullableText(approval?.notes),
});

export const mapMarisonFundSubmission = ({ request, projectId, division, attachments, approvals }) => {
  const payload = {
    submission_number: text(request?.submissionNumber),
    type: text(request?.type),
    project_id: Number(projectId),
    division: text(division),
    title: text(request?.title),
    description: nullableText(request?.description),
    attachments: Array.isArray(attachments) ? attachments : [],
    approvals: Array.isArray(approvals) ? approvals.map(normalizeFundApproval) : [],
  };

  return {
    endpoint: "/fund-submissions",
    kind: "fund",
    contractVersion: MARISON_FUND_CONTRACT_VERSION,
    payload: assertMarisonOutboundContract("fund", payload),
  };
};
