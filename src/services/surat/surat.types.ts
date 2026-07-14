export type TableInputColumn = {
  key: string;
  label: string;
  column: string;
  required?: boolean;
  type?: "text" | "number" | "date" | "select";
  options?: Array<{ label?: string; value: string | number } | string | number>;
  helper_text?: string;
};

export type TemplateInputField = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "date" | "number" | "currency" | "table" | "external_select";
  required?: boolean;
  cell?: string;
  sheet?: number;
  defaultSource?: string;
  default_source?: string;
  merge_range?: string;
  mergeRange?: string;
  horizontal?: "left" | "center" | "right";
  vertical?: "top" | "middle" | "bottom";
  wrap?: boolean;
  shrink?: boolean;
  font_name?: string;
  fontName?: string;
  font_size?: number;
  fontSize?: number;
  row_height?: number;
  rowHeight?: number;
  prefix?: string;
  suffix?: string;
  table_config?: {
    start_row: number;
    end_row: number;
    no_column?: string;
    columns: TableInputColumn[];
  };
  tableConfig?: {
    startRow: number;
    endRow: number;
    noColumn?: string;
    columns: TableInputColumn[];
  };
};

export interface SuratRegistrasi {
  id: string;
  no_surat: string | null;
  judul_surat: string;
  file_path: string | null;
  status: string;
  current_step: number;
  created_at: string;
  updated_at: string;
  entity_id?: string;
  office_id?: string;
  project_id?: string;
  dept_id?: string;
  letter_type_id?: string;
  penggunaan_id?: string;
  form_usage_id?: string;
  surat_signatures?: Array<{
    id: string;
    role_name: string;
    step_order: number;
    is_signed: boolean;
    signed_at: string | null;
    profiles?: { full_name: string };
  }>;
  surat_attachments?: Array<{
    id: string;
    file_url: string;
    file_name: string | null;
    file_type: string | null;
    file_size: number | null;
    stage?: string | null;
    requirement_key?: string | null;
    requirement_label?: string | null;
    signature_id?: string | null;
  }>;
}

export interface SuratRegistrationDraft {
  id: string;
  reservation_id: string;
  created_by: string;
  no_surat: string;
  status: "DRAFT" | "SUBMITTED" | "VOID" | "EXPIRED";
  payload: Record<string, any>;
  signer_assignments: any[];
  current_section: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
  surat_registration_draft_files?: SuratRegistrationDraftFile[];
}

export interface RecommendationTask {
  id: string;
  parent_surat_id: string;
  submitted_surat_id: string | null;
  no_surat: string;
  status: "waiting" | "claimed" | "revision_requested" | "submitted" | "cancelled";
  required_before_step: number;
  claimed_by: string | null;
  claimed_by_name: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
  candidate_snapshot: Array<{ user_id?: string; full_name?: string; job_title?: string }> | unknown;
  draft_id: string | null;
  parent_no_surat: string | null;
  parent_judul_surat: string | null;
  parent_status: string | null;
  parent_created_at: string | null;
  parent_requester_name: string | null;
}

export interface RecommendationParentSummary {
  task_id: string;
  parent_surat_id: string;
  no_surat: string | null;
  judul_surat: string | null;
  requester_name: string | null;
  requester_job_title: string | null;
  department_name: string | null;
  department_code: string | null;
  office_name: string | null;
  office_kedudukan: string | null;
  project_name: string | null;
  request_place: string | null;
  request_date: string | null;
  request_category: string | null;
  form_input_data: Record<string, unknown>;
  attachments: Array<{
    id: string;
    file_name: string | null;
    file_type: string | null;
    file_size: number | null;
    requirement_label: string | null;
  }>;
}

export interface LinkedSuratDocument {
  id: string;
  parent_surat_id: string;
  child_surat_id: string;
  link_type: "recommendation";
  status: "active" | "cancelled";
  required_before_step: number | null;
  created_at: string;
  child_no_surat: string | null;
  child_judul_surat: string | null;
  child_status: string | null;
  child_current_step: number | null;
  child_file_path: string | null;
  child_pdf_path: string | null;
  child_created_at: string | null;
  child_created_by: string | null;
}

export interface SuratRegistrationDraftFile {
  id: string;
  draft_id: string;
  file_url: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  requirement_key: string | null;
  requirement_label: string | null;
  created_at: string;
}
