import {
  assertMarisonOutboundContract,
  MARISON_FUND_CONTRACT_VERSION,
} from "./marison-outbound-contract.mjs";

const text = (value) => String(value ?? "").trim();
const nullableText = (value) => text(value) || null;
const normalizedNik = (value) => text(value).toUpperCase().replace(/\s+/gu, " ");

export const normalizeMarisonFundApprovalRole = (value) => {
  const role = text(value).toLowerCase();
  if (/\b(direktur|director)\b/u.test(role)) return "director";
  if (/\b(manager|manajer|kepala|head)\b/u.test(role)) return "manager";
  if (/\b(staff|staf|officer|specialist|admin)\b/u.test(role)) return "staff";

  const error = new Error("Role approval Fund Submission tidak dikenali.");
  error.status = 422;
  throw error;
};

const normalizeFundApproval = (approval) => ({
  role: normalizeMarisonFundApprovalRole(approval?.role),
  nik: text(approval?.nik),
  action: text(approval?.action),
  actioned_at: text(approval?.actioned_at),
  notes: nullableText(approval?.notes),
});

export const resolveMarisonFundDivision = ({ employees, requesterNik }) => {
  const expectedNik = normalizedNik(requesterNik);
  const employee = (Array.isArray(employees) ? employees : [])
    .find((item) => normalizedNik(item?.nik) === expectedNik);
  const division = text(employee?.division);
  if (!expectedNik || !division) {
    const error = new Error("Division external pemohon tidak tersedia untuk Fund Submission.");
    error.status = 422;
    throw error;
  }
  return division;
};

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
