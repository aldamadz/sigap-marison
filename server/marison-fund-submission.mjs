import {
  assertMarisonOutboundContract,
  MARISON_FUND_CONTRACT_VERSION,
} from "./marison-outbound-contract.mjs";
import { itemQuantityTotal, parseItemQuantity } from "@sigap/shared";

const text = (value) => String(value ?? "").trim();
const nullableText = (value) => text(value) || null;
const singleLineText = (value) => text(value).replace(/\s+/gu, " ");
const descriptionText = (value) => text(value).replace(/[^\S\r\n]+/gu, " ") || null;
const normalizedNik = (value) => text(value).toUpperCase().replace(/\s+/gu, " ");
const positiveQuantity = (value) => parseItemQuantity(value) ?? 0;
const nonNegativeInteger = (value) => {
  const parsed = Number(String(value ?? "").replace(/[^\d-]/gu, ""));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
};

const normalizeFundItems = (items) => (Array.isArray(items) ? items : []).map((item) => ({
  nama_barang: singleLineText(item?.nama_barang ?? item?.item_name ?? item?.nama ?? item?.name),
  jumlah: positiveQuantity(item?.jumlah ?? item?.quantity),
  satuan: singleLineText(item?.satuan ?? item?.sat ?? item?.unit),
  nominal: nonNegativeInteger(item?.nominal ?? item?.subtotal ?? item?.nilai),
}));

export const mapKeu1ItemsForFund = (items) => (Array.isArray(items) ? items : []).map((item, index) => {
  const quantity = positiveQuantity(item?.jumlah);
  const rawUnitPrice = item?.estimasi_harga_satuan;
  const unitPrice = typeof rawUnitPrice === "number" || /^\d+$/u.test(text(rawUnitPrice))
    ? Number(rawUnitPrice)
    : NaN;
  const nominal = itemQuantityTotal(quantity, unitPrice);
  if (!text(item?.keterangan) || !quantity || !text(item?.satuan) ||
      !Number.isSafeInteger(unitPrice) || unitPrice < 0 || !Number.isSafeInteger(nominal)) {
    const error = new Error(`Rincian Kas Kecil item ${index + 1} tidak valid untuk pengiriman.`);
    error.status = 422;
    throw error;
  }
  return {
    nama_barang: text(item.keterangan),
    jumlah: quantity,
    satuan: text(item.satuan),
    nominal,
  };
});

export const normalizeMarisonFundApprovalRole = (value) => {
  const role = text(value).toLowerCase();
  if (role === "pemohon") return "staff";
  if (/\b(direktur|director|direksi|dirut)\b/u.test(role)) return "director";
  if (/\b(manager|manajer|kepala|head|pimpinan|mgr)\b/u.test(role)) return "manager";
  // Vendor has only staff/manager/director; supervisors are non-manager makers.
  if (/\b(supervisor|superviser|spv)\b/u.test(role)) return "staff";
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

export const mapMarisonFundSubmission = ({ request, projectId, branchId, division, mainDocument, attachments, approvals }) => {
  const items = normalizeFundItems(request?.items);
  const payload = {
    submission_number: text(request?.submissionNumber),
    ...(mainDocument !== undefined ? { main_document: mainDocument } : {}),
    type: text(request?.type),
    branch_id: Number(branchId),
    division: text(division),
    title: singleLineText(request?.title),
    description: descriptionText(request?.description),
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
