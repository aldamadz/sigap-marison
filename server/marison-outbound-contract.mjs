import { z } from "zod";

export const MARISON_OUTBOUND_CONTRACT_VERSION = "v1";

const requiredText = z.string();
const nonEmptyText = z.string().trim().min(1);
const externalId = z.union([z.number().int().positive(), z.string().trim().min(1)]);
const dateTime = z.string().datetime({ offset: true });
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const externalLink = z.object({
  title: nonEmptyText,
  link: z.string().url(),
}).strict();

const approval = z.object({
  step: z.number().int().positive(),
  role: nonEmptyText,
  nik: nonEmptyText,
  action: z.enum(["approved", "rejected"]),
  actioned_at: dateTime,
  notes: requiredText,
}).strict();

const submittedBy = z.object({
  nik: nonEmptyText,
  name: nonEmptyText,
  job_title: nonEmptyText,
}).strict();

const company = z.object({
  code: nonEmptyText,
  name: nonEmptyText,
}).strict();

const officeBase = {
  code: nonEmptyText,
  name: nonEmptyText,
  position: nonEmptyText,
};

const department = z.object({
  code: nonEmptyText,
  name: nonEmptyText,
}).strict();

const addendum = z.object({
  label: nonEmptyText,
  nominal: z.number().int().nonnegative(),
}).strict();

export const marisonUnitSubmissionSchema = z.object({
  submission_number: nonEmptyText,
  title: nonEmptyText,
  submitted_at: dateTime,
  submitted_by: submittedBy,
  company,
  office: z.object(officeBase).strict(),
  department,
  project: z.object({
    id: externalId,
    code: nonEmptyText,
    name: nonEmptyText,
  }).strict(),
  branch: z.object({
    id: externalId,
    name: nonEmptyText,
  }).strict(),
  total_units: z.number().int().positive(),
  units: z.array(z.object({
    item_number: z.number().int().positive(),
    unit_id: externalId,
    unit_code: nonEmptyText,
    production_code: nonEmptyText,
    production_serial: nonEmptyText,
    production_block: nonEmptyText,
    production_date: dateOnly,
    addendum_atas: addendum,
    addendum_bawah: addendum,
    notes: requiredText,
  }).strict()).min(1),
  attachments: z.array(externalLink),
  approvals: z.array(approval).min(1),
}).strict().superRefine((payload, ctx) => {
  if (payload.total_units !== payload.units.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["total_units"],
      message: "total_units harus sama dengan jumlah baris units.",
    });
  }
});

const recommendation = z.object({
  is_recommended: z.boolean(),
  action: z.enum(["service", "ganti", "beli_baru", "tidak_direkomendasikan"]),
  description: requiredText,
  location_pic: requiredText,
  notes: requiredText,
  reference_link: z.union([z.literal(""), z.string().url()]),
}).strict();

export const marisonAssetPurchaseRequestSchema = z.object({
  request_number: nonEmptyText,
  title: nonEmptyText,
  category: z.enum(["Pengajuan Pusat", "Pengajuan Cabang"]),
  submitted_at: dateTime,
  submitted_by: submittedBy,
  company,
  office: z.object({ id: externalId, ...officeBase }).strict(),
  department,
  description: requiredText,
  total_items: z.number().int().positive(),
  items: z.array(z.object({
    item_number: z.number().int().positive(),
    asset_name: nonEmptyText,
    quantity: z.number().positive(),
    unit: nonEmptyText,
    status_code: nonEmptyText,
    description: requiredText,
    attachments: z.array(externalLink),
    recommendation: recommendation.nullable(),
  }).strict()).min(1),
  attachments: z.array(externalLink),
  recommendation_document: z.object({
    document_number: nonEmptyText,
    title: nonEmptyText,
    link: z.string().url(),
    approvals: z.array(approval).min(1),
  }).strict().nullable(),
  approvals: z.array(approval).min(1),
}).strict().superRefine((payload, ctx) => {
  if (payload.total_items !== payload.items.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["total_items"],
      message: "total_items harus sama dengan jumlah baris items.",
    });
  }
});

const schemas = {
  unit: marisonUnitSubmissionSchema,
  asset: marisonAssetPurchaseRequestSchema,
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
