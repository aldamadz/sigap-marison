import type {
  FormFieldValue,
  RequestCategory,
  TableRow,
  TemplateField,
  UsageDetailRecord,
} from "./surat-form-types";

const UNIT_FIELD_KEYS = [
  "unit",
  "requested_project",
  "requested_unit_count",
  "unit_request_sentence",
  "unit_config_snapshot",
  "allocated_project",
  "allocated_units",
  "allocated_unit_count",
] as const;

export function getScalarFieldValue(value: FormFieldValue): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && !Array.isArray(value) && "value" in value) {
    const candidate = (value as { value?: unknown }).value;
    return typeof candidate === "string" || typeof candidate === "number" ? String(candidate) : "";
  }
  return "";
}

export function getFullRoles(item: UsageDetailRecord): Array<string | undefined> {
  if (!item?.ttd_config) return [];
  try {
    const config = typeof item.ttd_config === "string" ? JSON.parse(item.ttd_config) : item.ttd_config;
    return Array.isArray(config)
      ? config.map((entry: { labelJabatan?: string; jabatan?: string; roleName?: string; role_name?: string }) =>
          entry.labelJabatan || entry.jabatan || entry.roleName || entry.role_name)
      : [];
  } catch {
    return [];
  }
}

export function getInputSchema(item: UsageDetailRecord): TemplateField[] {
  const raw = item?.master_forms?.input_schema;
  if (Array.isArray(raw)) return raw as TemplateField[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed as TemplateField[] : [];
    } catch {
      return [];
    }
  }
  return [];
}

export const getManualInputFields = (item: UsageDetailRecord): TemplateField[] =>
  getInputSchema(item).filter((field) => (field.default_source || field.defaultSource || "manual") === "manual");

export const getExternalInputFields = (item: UsageDetailRecord): TemplateField[] =>
  getManualInputFields(item).filter((field) => field.type === "external_select");

export const isMultiSelectField = (field: TemplateField): boolean =>
  field.multiple === true || field.is_multiple === true || field.key === "unit";

export const isUnitField = (field: TemplateField): boolean =>
  UNIT_FIELD_KEYS.includes(field.key as (typeof UNIT_FIELD_KEYS)[number]);

export const isUnitExternalField = (field: TemplateField): boolean =>
  isUnitField(field) || String(field.external_source_key || field.externalSourceKey || "") === "marison_units_by_project";

export function getWorkflowCategories(item: UsageDetailRecord | null | undefined): RequestCategory[] {
  if (item?.request_category) return [item.request_category];
  const categories = Array.isArray(item?.request_categories) ? item.request_categories : [];
  // Fail closed: konfigurasi tanpa kategori menghasilkan daftar kosong
  // (bukan tebakan ["asset", "non_unit"]) agar resolver menolak usage ini
  // dengan pesan konfigurasi yang aman.
  return categories;
}

export function normalizeFormUsageRecord(item: UsageDetailRecord): UsageDetailRecord {
  const departments = Array.isArray(item.form_usage_departments)
    ? item.form_usage_departments.filter(
        (permission): permission is { department_id: string } =>
          Boolean(permission)
          && typeof permission === "object"
          && "department_id" in permission
          && typeof permission.department_id === "string",
      )
    : item.workflow_allowed_departments || [];
  const steps = Array.isArray(item.form_usage_steps) ? [...item.form_usage_steps] : [];

  return {
    ...item,
    workflow_allowed_departments: departments,
    request_categories: item.request_category ? [item.request_category] : item.request_categories || [],
    is_cabang: item.scope_type === "cabang",
    ttd_config: steps
      .sort((left, right) => left.step_order - right.step_order)
      .map((step) => ({
        form_usage_step_id: step.id,
        roleName: step.role_name,
        labelJabatan: step.label,
        action_type: step.action_type,
        assignee_mode: step.assignee_mode || "select",
        input_schema: step.input_schema || {},
        skip_if_no_candidate: step.skip_if_no_candidate === true,
        candidate_fallback_mode: step.candidate_fallback_mode || null,
        candidate_scope: step.candidate_scope || "manual",
        signer_department_id: step.signer_department_id,
        eligible_user_ids: (step.form_usage_step_users || []).map((candidate) => candidate.user_id),
        verifier_user_ids: (step.form_usage_step_verifiers || []).map((candidate) => candidate.user_id),
        requires_unit_allocation: step.action_type === "unit_allocation",
      })),
  };
}

export function normalizeFormUsageRecords(items: UsageDetailRecord[]): UsageDetailRecord[] {
  return items.map(normalizeFormUsageRecord);
}

export const hasUnitRequestFields = (item: UsageDetailRecord): boolean =>
  getWorkflowCategories(item).includes("unit");

export function canDepartmentRequestUnit(item: UsageDetailRecord, deptId: string): boolean {
  if (!deptId) return false;
  const allowedDepartments = Array.isArray(item.workflow_allowed_departments)
    ? item.workflow_allowed_departments
    : [];
  if (!item.form_usage_steps && !hasUnitRequestFields(item)) return true;
  return allowedDepartments.some((permission) => permission.department_id === deptId);
}

export function clearUnitInput(inputData: Record<string, unknown>): Record<string, unknown> {
  const nextInput = { ...inputData };
  delete nextInput.requested_project;
  delete nextInput.requested_unit_count;
  delete nextInput.unit_request_sentence;
  delete nextInput.unit_config_snapshot;
  return nextInput;
}

export function clearRecommendationInput(inputData: Record<string, unknown>): Record<string, unknown> {
  const nextInput = { ...inputData };
  delete nextInput.requires_recommendation;
  delete nextInput.recommendation_template_name;
  delete nextInput.recommendation_attachment_note;
  return nextInput;
}

export function isProfileLocationReady(
  profile: { office_id?: string | null; department_id?: string | null } | null | undefined,
  form: { office_id?: string | null; dept_id?: string | null },
  isAdmin: boolean,
): boolean {
  return Boolean(profile) && (
    isAdmin || (
      Boolean(profile?.office_id) &&
      Boolean(profile?.department_id) &&
      form.office_id === profile?.office_id &&
      form.dept_id === profile?.department_id
    )
  );
}

export function normalizeTableRows(value: unknown): TableRow[] {
  if (!Array.isArray(value) || value.length === 0) return [{}];
  return value
    .filter((row): row is TableRow => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    .map((row) => ({ ...row }));
}
