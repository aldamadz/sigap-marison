import {
  assertMarisonOutboundContract,
  MARISON_FUND_CONTRACT_VERSION,
} from "./marison-outbound-contract.mjs";

const text = (value) => String(value ?? "").trim();
const nullableText = (value) => text(value) || null;
const normalizedNik = (value) => text(value).toUpperCase().replace(/\s+/gu, " ");

export const normalizeMarisonFundApprovalRole = (value) => {
  const role = text(value).toLowerCase();
  if (/\b(direktur|director|direksi|dirut)\b/u.test(role)) return "director";
  if (/\b(manager|manajer|kepala|head|pimpinan|mgr)\b/u.test(role)) return "manager";
  if (/\b(staff|staf|officer|specialist|admin|pelaksana)\b/u.test(role)) return "staff";

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

const findExternalEmployee = ({ employees, requesterNik }) => {
  const expectedNik = normalizedNik(requesterNik);
  const employee = (Array.isArray(employees) ? employees : [])
    .find((item) => normalizedNik(item?.nik) === expectedNik);
  return { expectedNik, employee };
};

export const resolveMarisonFundDivision = ({ employees, requesterNik }) => {
  const { expectedNik, employee } = findExternalEmployee({ employees, requesterNik });
  const division = text(employee?.division);
  if (!expectedNik || !division) {
    const error = new Error("Division external pemohon tidak tersedia untuk Fund Submission.");
    error.status = 422;
    throw error;
  }
  return division;
};

// Dana umum tanpa proyek tetap memerlukan cabang external (observasi vendor
// staging 20 Agu 2026: `Cabang wajib diisi.`). Cabang diambil dari branch
// employee external pemohon, sama seperti division.
export const resolveMarisonFundBranch = ({ employees, requesterNik }) => {
  const { expectedNik, employee } = findExternalEmployee({ employees, requesterNik });
  const rawBranchId = Number(employee?.branch?.id);
  if (!expectedNik || !Number.isSafeInteger(rawBranchId) || rawBranchId <= 0) {
    const error = new Error("Branch external pemohon tidak tersedia untuk dana umum Fund Submission.");
    error.status = 422;
    throw error;
  }
  return rawBranchId;
};

export const mapMarisonFundSubmission = ({ request, projectId, branchId, division, attachments, approvals }) => {
  const payload = {
    submission_number: text(request?.submissionNumber),
    type: text(request?.type),
    division: text(division),
    title: text(request?.title),
    description: nullableText(request?.description),
    attachments: Array.isArray(attachments) ? attachments : [],
    approvals: Array.isArray(approvals) ? approvals.map(normalizeFundApproval) : [],
  };
  // Dana umum tanpa proyek: field project_id dihilangkan dari payload (omit)
  // dan wajib menyertakan branch_id external pemohon.
  if (projectId !== null && projectId !== undefined && String(projectId).trim() !== "") {
    payload.project_id = Number(projectId);
  } else if (branchId !== null && branchId !== undefined && String(branchId).trim() !== "") {
    payload.branch_id = Number(branchId);
  }

  return {
    endpoint: "/fund-submissions",
    kind: "fund",
    contractVersion: MARISON_FUND_CONTRACT_VERSION,
    payload: assertMarisonOutboundContract("fund", payload),
  };
};
