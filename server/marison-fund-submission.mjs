import {
  assertMarisonOutboundContract,
  MARISON_FUND_CONTRACT_VERSION,
} from "./marison-outbound-contract.mjs";

const text = (value) => String(value ?? "").trim();
const nullableText = (value) => text(value) || null;
const normalizedNik = (value) => text(value).toUpperCase().replace(/\s+/gu, " ");
const positiveInteger = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
};
const nonNegativeInteger = (value) => {
  const parsed = Number(String(value ?? "").replace(/[^\d-]/gu, ""));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
};

const normalizeFundItems = (items) => (Array.isArray(items) ? items : []).map((item) => ({
  nama_barang: text(item?.nama_barang ?? item?.item_name ?? item?.nama ?? item?.name),
  jumlah: positiveInteger(item?.jumlah ?? item?.quantity),
  satuan: text(item?.satuan ?? item?.sat ?? item?.unit),
  nominal: nonNegativeInteger(item?.nominal ?? item?.subtotal ?? item?.nilai),
}));

export const normalizeMarisonFundApprovalRole = (value) => {
  const role = text(value).toLowerCase();
  if (role === "pemohon") return "staff";
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
  const items = normalizeFundItems(request?.items);
  const payload = {
    submission_number: text(request?.submissionNumber),
    type: text(request?.type),
    branch_id: Number(branchId),
    division: text(division),
    title: text(request?.title),
    description: nullableText(request?.description),
    amount: request?.amount == null ? items.reduce((total, item) => total + item.nominal, 0) : nonNegativeInteger(request.amount),
    items,
    attachments: Array.isArray(attachments) ? attachments : [],
    approvals: Array.isArray(approvals) ? approvals.map(normalizeFundApproval) : [],
  };
  // project_id tetap opsional untuk dana umum, sedangkan branch_id selalu wajib.
  if (projectId !== null && projectId !== undefined && String(projectId).trim() !== "") {
    payload.project_id = Number(projectId);
  }

  return {
    endpoint: "/fund-submissions",
    kind: "fund",
    contractVersion: MARISON_FUND_CONTRACT_VERSION,
    payload: assertMarisonOutboundContract("fund", payload),
  };
};
