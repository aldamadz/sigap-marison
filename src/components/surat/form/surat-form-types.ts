export interface SuratFormProps {
  onSuccess: (noSurat: string, judul: string) => void;
  isLoading: boolean;
  setIsLoading: (val: boolean) => void;
  setJudulForDisplay: (val: string) => void;
}

export type MasterRecord = {
  id: string;
  full_name?: string;
  name?: string;
  code?: string;
  kedudukan?: string;
  dept_index?: number;
  office_id?: string;
  entity_id?: string;
  department_id?: string | null;
  departmentIds?: string[];
  dept_ids?: string[];
  departmentSortIndexes?: Record<string, number>;
  dept_sort_indexes?: Record<string, number>;
  job_title?: string | null;
  marison_project_id?: number | null;
  marison_branch_id?: number | null;
  marison_review_reasons?: unknown;
  branch?: { name?: string } | null;
};

export type MasterData = {
  entities: MasterRecord[];
  depts: MasterRecord[];
  offices: MasterRecord[];
  types: MasterRecord[];
  users: MasterRecord[];
  projects: MasterRecord[];
};

export type RequestCategory = "asset" | "unit" | "non_unit" | "non_asset";
export type CandidateScope = "manual" | "request_office" | "request_department" | "branch_office_or_request_department" | "head_office" | "all_offices";
export type SuratStepActionType = "approval" | "unit_allocation" | "configured_input";
export type SignerAssigneeMode = "select" | "requester";

export type RecommendationConfig = {
  enabled?: boolean;
  optional?: boolean;
  required_before_step?: number;
  form_id?: string;
  usage_id?: string;
  department_id?: string;
  letter_type_id?: string;
  template_name?: string;
};

export type UsageDetailRecord = {
  id: string;
  name?: string;
  form_id?: string;
  request_category?: RequestCategory;
  scope_type?: "all" | "pusat" | "cabang";
  is_cabang?: boolean;
  request_categories?: RequestCategory[];
  recommendation_config?: RecommendationConfig;
  external_revision_policy?: {
    recipient_type: "requester" | "signer";
    recipient_step_order: number | null;
    approval_restart_step: number;
  };
  workflow_allowed_departments?: Array<{ department_id: string }>;
  form_usage_steps?: Array<{
    id: string;
    step_order: number;
    role_name: string;
    label: string;
    action_type?: SuratStepActionType;
    assignee_mode?: SignerAssigneeMode;
    input_schema?: unknown;
    candidate_scope?: CandidateScope | null;
    signer_department_id?: string | null;
    form_usage_step_users?: Array<{ user_id: string }>;
    form_usage_step_verifiers?: Array<{ user_id: string }>;
  }>;
  form_usage_attachment_requirements?: Array<{
    id: string;
    stage_order: number;
    requirement_key: string;
    label: string;
    is_required: boolean;
    allow_multiple: boolean;
    min_files: number;
    max_files: number;
    allowed_types?: string[];
    max_size_bytes?: number | null;
  }>;
  ttd_config?: unknown;
  master_forms?: {
    id?: string;
    nama_form?: string;
    nomor_form?: string;
    department_id?: string;
    input_schema?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type TemplateField = {
  key: string;
  label?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  default_source?: string;
  defaultSource?: string;
  multiple?: boolean;
  is_multiple?: boolean;
  external_source_key?: string;
  externalSourceKey?: string;
  external_dependency_key?: string;
  externalDependencyKey?: string;
  value_key?: string;
  table_config?: {
    start_row?: number;
    end_row?: number;
    no_column?: string;
    columns?: Array<{
      key: string;
      label?: string;
      type?: string;
      required?: boolean;
      options?: Array<{ label?: string; value: string | number } | string | number>;
      helper_text?: string;
      helperText?: string;
    }>;
  };
};

export type LinkedDocumentContext = {
  type: "recommendation";
  parentSuratId: string;
  parentNoSurat?: string;
  requiredBeforeStep?: number | null;
  formId?: string;
  usageId?: string;
  departmentId?: string;
  letterTypeId?: string;
  taskId?: string;
};

export type AttachmentRequirement = NonNullable<UsageDetailRecord["form_usage_attachment_requirements"]>[number];
export type AttachmentUploadState = {
  phase: "uploading" | "saving" | "success" | "error";
  fileName: string;
  fileIndex: number;
  fileCount: number;
  percent: number;
  message?: string;
};
export type TableRow = Record<string, unknown>;
export type ExternalOption = { value: string; label: string; raw?: unknown };
export type ProjectRaw = { id: string; code?: string; name?: string; branch?: { name?: string } | null };
export type ProjectOption = { value: string; label: string; raw?: ProjectRaw };
export type FormFieldValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | { value?: string; label?: string; code?: string; name?: string; branch?: { name?: string } | null }
  | Array<{ value?: string; label?: string } | string>
  | TableRow[]
  | Record<string, unknown>;
export type FormInputData = Record<string, FormFieldValue>;

export type SignerAssignment = {
  step_order: number;
  role_name: string;
  label_jabatan: string;
  user_id?: string | null;
  form_usage_step_id?: string;
  action_type?: SuratStepActionType;
  assignee_mode?: SignerAssigneeMode;
  input_schema?: unknown;
  candidate_scope?: CandidateScope;
  eligible_user_ids?: string[];
  verifier_user_ids?: string[];
  attachment_requirements?: UsageDetailRecord["form_usage_attachment_requirements"];
  requires_unit_allocation?: boolean;
};

export type UsageStepConfig = {
  form_usage_step_id?: string;
  roleName?: string;
  role_name?: string;
  labelJabatan?: string;
  label_jabatan?: string;
  jabatan?: string;
  action_type?: SuratStepActionType;
  assignee_mode?: SignerAssigneeMode;
  input_schema?: unknown;
  candidate_scope?: CandidateScope;
  eligible_user_ids?: string[];
  verifier_user_ids?: string[];
  requires_unit_allocation?: boolean;
  requiresUnitAllocation?: boolean;
};

export type CurrentProfile = {
  id: string;
  role?: string | null;
  department_id?: string | null;
  office_id?: string | null;
};

export type RecommendationItemAttachment = {
  draft_file_id?: string;
  file_url?: string;
  file_name?: string;
  file_type?: string | null;
  file_size?: number | null;
  uploaded_at?: string;
  source?: "upload" | "paste" | "drop";
};
