import { z } from "zod";

export const MARISON_OUTBOUND_CONTRACT_VERSION = "vendor-openapi-1.0.0";
export const MARISON_ASSET_CONTRACT_VERSION = "vendor-openapi-asset-2026-08-11-no-estimated-price";
export const MARISON_FUND_CONTRACT_VERSION = "vendor-openapi-fund-2026-08-12-complete-fields";

const requiredText = z.string();
const nonEmptyText = z.string().trim().min(1);
const positiveInteger = z.number().int().positive();
const nonNegativeInteger = z.number().int().nonnegative();
const dateTime = z.string().datetime({ offset: true });

const externalLink = z.object({
  name: nonEmptyText,
  link: z.string().url(),
}).strict();

const approval = z.object({
  role: nonEmptyText,
  nik: nonEmptyText,
  action: nonEmptyText,
  actioned_at: dateTime,
  notes: requiredText.optional(),
}).strict();

const fundApproval = approval.extend({
  notes: requiredText.nullable(),
});

export const normalizeMarisonApprovalRole = (kind, role) => {
  const value = String(role ?? "").trim();
  if (!["unit", "non_unit"].includes(kind)) return value;

  const normalized = value.toLowerCase();
  if (normalized.includes("marketing")) return "marketing";
  if (/\b(direktur|director|direksi|dirut)\b/.test(normalized)) return "director";
  return "planning";
};

export const normalizeMarisonSubmissionApprovals = (kind, approvals) =>
  approvals.map((item) => ({
    ...item,
    role: normalizeMarisonApprovalRole(kind, item?.role),
  }));

export const marisonUnitSubmissionSchema = z.object({
  submission_number: nonEmptyText,
  project_id: positiveInteger,
  branch_id: positiveInteger,
  description: nonEmptyText,
  submitted_by: nonEmptyText.optional(),
  submitted_at: dateTime.optional(),
  units: z.array(z.object({
    unit_id: positiveInteger,
    production_code: nonEmptyText,
    type: nonEmptyText,
    addendum_atas_label: requiredText.optional(),
    addendum_atas_nominal: nonNegativeInteger.optional(),
    addendum_bawah_label: requiredText.optional(),
    addendum_bawah_nominal: nonNegativeInteger.optional(),
    planning_notes: requiredText.optional(),
  }).strict()).min(1),
  attachments: z.array(externalLink).optional(),
  approvals: z.array(approval).min(1),
}).strict();

export const marisonNonUnitSubmissionSchema = z.object({
  submission_number: nonEmptyText,
  project_id: positiveInteger,
  branch_id: positiveInteger,
  description: nonEmptyText,
  submitted_by: nonEmptyText.optional(),
  submitted_at: dateTime.optional(),
  notes: requiredText.optional(),
  items: z.array(z.object({
    non_unit_id: positiveInteger,
    item_name: nonEmptyText,
    subtotal: nonNegativeInteger,
    planning_notes: requiredText.optional(),
  }).strict()).min(1),
  attachments: z.array(externalLink).optional(),
  approvals: z.array(approval).min(1),
}).strict();

export const marisonAssetPurchaseRequestSchema = z.object({
  request_number: nonEmptyText,
  branch_id: positiveInteger,
  submitted_by: nonEmptyText.optional(),
  submitted_at: dateTime.optional(),
  description: requiredText.optional(),
  items: z.array(z.object({
    asset_name: nonEmptyText,
    quantity: positiveInteger.optional(),
    description: requiredText.optional(),
    attachments: z.array(externalLink).optional(),
  }).strict()).min(1),
  approvals: z.array(approval).min(1),
}).strict();

export const marisonFundSubmissionSchema = z.object({
  submission_number: nonEmptyText,
  type: z.enum(["production_cost", "operational"]),
  // Fund berproyek: project_id dikirim, branch_id di-omit.
  // Dana umum tanpa proyek: project_id di-omit, branch_id wajib dikirim
  // (observasi vendor staging 20 Agu 2026 menolak payload kosong keduanya
  // dengan "Cabang wajib diisi.").
  project_id: positiveInteger.optional(),
  branch_id: positiveInteger.optional(),
  division: nonEmptyText,
  title: nonEmptyText,
  description: requiredText.nullable(),
  attachments: z.array(externalLink),
  approvals: z.array(fundApproval).min(1),
}).strict().superRefine((payload, ctx) => {
  const hasProject = payload.project_id != null;
  const hasBranch = payload.branch_id != null;
  if (!hasProject && !hasBranch) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Dana umum Fund Submission wajib menyertakan branch_id (cabang) external pemohon.",
    });
  }
});

const schemas = {
  unit: marisonUnitSubmissionSchema,
  non_unit: marisonNonUnitSubmissionSchema,
  asset: marisonAssetPurchaseRequestSchema,
  fund: marisonFundSubmissionSchema,
};

export const assertMarisonOutboundContract = (kind, payload) => {
  const schema = schemas[kind];
  if (!schema) return payload;
  const result = schema.safeParse(payload);
  if (result.success) return result.data;

  const details = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  const error = new Error(`Payload Marison ${kind} tidak sesuai kontrak.`);
  error.status = 422;
  error.details = details;
  throw error;
};
