/**
 * Shared fixture constants for SuratForm characterization tests.
 *
 * All IDs are valid UUID v4 format because they pass through
 * BFF / Supabase RPC validators.
 *
 * Naming convention:
 *   UUID.<entity>  — primary key
 *   MASTER_        — Supabase row shape
 *   USAGE_         — UsageDetailRecord shape (post-loadUsageDetails transform)
 */

export const UUID = {
  user:       "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  user2:      "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  user3:      "550e8400-e29b-41d4-a716-446655440000",
  user4:      "d4e5f6a7-b8c9-4012-defa-234567890123",
  user5:      "e5f6a7b8-c9d0-4123-efab-345678901234",
  office_pusat: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  office_kc:    "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12",
  entity:     "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13",
  dept_pbo:   "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14",
  dept_sales: "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15",
  letter_type:"f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a16",
  form_usage: "01eebc99-9c0b-4ef8-bb6d-6bb9bd380a17",
  form_a:     "11eebc99-9c0b-4ef8-bb6d-6bb9bd380a18",
  draft:      "21eebc99-9c0b-4ef8-bb6d-6bb9bd380a19",
  reservation:"31eebc99-9c0b-4ef8-bb6d-6bb9bd380a1a",
  surat:      "41eebc99-9c0b-4ef8-bb6d-6bb9bd380a1b",
  step1:      "51eebc99-9c0b-4ef8-bb6d-6bb9bd380a1c",
  step2:      "61eebc99-9c0b-4ef8-bb6d-6bb9bd380a1d",
  step3:      "71eebc99-9c0b-4ef8-bb6d-6bb9bd380a1e",
  step_usage2_1: "81eebc99-9c0b-4ef8-bb6d-6bb9bd380a1f",
  step_usage2_2: "91eebc99-9c0b-4ef8-bb6d-6bb9bd380a20",
  draft_file: "a2eebc99-9c0b-4ef8-bb6d-6bb9bd380a21",
} as const;

// ─── Supabase Row Shapes ────────────────────────────────────────

export const MASTER_ENTITIES = [
  { id: UUID.entity, code: "PT-SIG", name: "PT Sigma Indo Grafika" },
];

export const MASTER_OFFICES = [
  { id: UUID.office_pusat, name: "Kantor Pusat", kedudukan: "Pusat", code: "KP", marison_branch_id: null },
  { id: UUID.office_kc,    name: "KC. Semarang", kedudukan: "KC",   code: "KCSMG", marison_branch_id: 14 },
];

export const MASTER_DEPTS = [
  { id: UUID.dept_pbo,   name: "Pengembangan Organisasi", code: "PBO", dept_index: 1 },
  { id: UUID.dept_sales, name: "Marketing",               code: "MKT", dept_index: 2 },
];

export const MASTER_TYPES = [
  { id: UUID.letter_type, code: "MH", name: "Permohonan", departmentIds: [UUID.dept_pbo, UUID.dept_sales], dept_ids: [UUID.dept_pbo, UUID.dept_sales], departmentSortIndexes: {}, dept_sort_indexes: {} },
];

export const MASTER_USERS = [
  { id: UUID.user,  full_name: "Pemohon Staging",   job_title: "Staff",   office_id: UUID.office_pusat, department_id: UUID.dept_pbo },
  { id: UUID.user2, full_name: "Manager Marketing",  job_title: "Manager", office_id: UUID.office_pusat, department_id: UUID.dept_sales },
  { id: UUID.user3, full_name: "Direktur Utama",     job_title: "Dirut",   office_id: UUID.office_pusat, department_id: UUID.dept_pbo },
];

export const MASTER_PROJECTS: Array<Record<string, unknown>> = [];

/** getMasterData() return shape (post-transform in suratService) */
export const MASTER_DATA_DEFAULT = {
  entities: MASTER_ENTITIES,
  depts: MASTER_DEPTS,
  offices: MASTER_OFFICES,
  types: MASTER_TYPES,
  users: MASTER_USERS,
  projects: MASTER_PROJECTS,
};

// ─── Profile ────────────────────────────────────────────────────

export const CURRENT_PROFILE_DEFAULT = {
  id: UUID.user,
  role: "user",
  department_id: UUID.dept_pbo,
  office_id: UUID.office_pusat,
};

// ─── Usage Detail (post loadUsageDetails transform) ─────────────

export const USAGE_DETAIL_DEFAULT = {
  id: UUID.form_usage,
  name: "Permohonan Aset",
  form_id: UUID.form_a,
  request_category: "asset" as const,
  scope_type: "all" as const,
  is_cabang: false,
  request_categories: ["asset" as const],
  workflow_allowed_departments: [
    { department_id: UUID.dept_pbo },
    { department_id: UUID.dept_sales },
  ],
  form_usage_steps: [
    { id: UUID.step1, step_order: 1, role_name: "membuat",    label: "Pemohon",  action_type: "approval" as const, candidate_scope: "manual" as const, signer_department_id: null, form_usage_step_users: [], form_usage_step_verifiers: [] },
    { id: UUID.step2, step_order: 2, role_name: "menyetujui", label: "Direktur", action_type: "approval" as const, candidate_scope: "manual" as const, signer_department_id: null, form_usage_step_users: [], form_usage_step_verifiers: [] },
  ],
  form_usage_attachment_requirements: [] as Array<Record<string, unknown>>,
  master_forms: {
    id: UUID.form_a,
    nama_form: "FORM PERMOHONAN ASET",
    nomor_form: "FA-001",
    link_form: "https://storage.example.com/template.xlsx",
    department_id: UUID.dept_pbo,
    input_schema: JSON.stringify([
      { key: "nama_barang", label: "Nama Barang", type: "text", required: true, default_source: "manual", cell: "C11" },
      { key: "request_place", label: "Tempat", default_source: "request_place", cell: "C5" },
      { key: "request_date", label: "Tanggal", default_source: "request_date", cell: "C6" },
    ]),
    unit_config: null,
    signature_layout: null,
  },
  ttd_config: [
    { form_usage_step_id: UUID.step1, roleName: "membuat",    labelJabatan: "Pemohon",  jabatan: "Pemohon",  candidate_scope: "manual", eligible_user_ids: [UUID.user, UUID.user2, UUID.user3], verifier_user_ids: [], action_type: "approval" },
    { form_usage_step_id: UUID.step2, roleName: "menyetujui", labelJabatan: "Direktur", jabatan: "Direktur", candidate_scope: "manual", eligible_user_ids: [UUID.user, UUID.user2, UUID.user3], verifier_user_ids: [], action_type: "approval" },
  ],
  recommendation_config: null,
};

// ─── Raw Supabase Row (pre-transform, for supabase.from mock) ──

export const FORM_USAGES_RAW = [
  {
    id: UUID.form_usage,
    name: "Permohonan Aset",
    form_id: UUID.form_a,
    request_category: "asset",
    scope_type: null,
    recommendation_config: null,
    master_forms: {
      id: UUID.form_a,
      nama_form: "FORM PERMOHONAN ASET",
      nomor_form: "FA-001",
      link_form: "https://storage.example.com/template.xlsx",
      department_id: UUID.dept_pbo,
      input_schema: JSON.stringify([
        { key: "nama_barang", label: "Nama Barang", type: "text", required: true, default_source: "manual", cell: "C11" },
        { key: "request_place", label: "Tempat", default_source: "request_place", cell: "C5" },
        { key: "request_date", label: "Tanggal", default_source: "request_date", cell: "C6" },
      ]),
      unit_config: null,
      signature_layout: null,
    },
    form_usage_departments: [
      { department_id: UUID.dept_pbo },
      { department_id: UUID.dept_sales },
    ],
    form_usage_steps: [
      { id: UUID.step1, step_order: 1, role_name: "membuat",    label: "Pemohon",  action_type: "approval", candidate_scope: "manual", signer_department_id: null, form_usage_step_users: [{ user_id: UUID.user }, { user_id: UUID.user2 }, { user_id: UUID.user3 }], form_usage_step_verifiers: [] },
      { id: UUID.step2, step_order: 2, role_name: "menyetujui", label: "Direktur", action_type: "approval", candidate_scope: "manual", signer_department_id: null, form_usage_step_users: [{ user_id: UUID.user }, { user_id: UUID.user2 }, { user_id: UUID.user3 }], form_usage_step_verifiers: [] },
    ],
    form_usage_attachment_requirements: [],
  },
];

// ─── Service Return Shapes ──────────────────────────────────────

export const GENERATE_NO_SURAT_RESULT = {
  fullNumber: "001/FA/MKT/VIII/2026",
  noUrut: 1,
};

export const CREATE_DRAFT_RESULT = {
  id: UUID.draft,
  reservation_id: UUID.reservation,
  no_surat: "001/FA/MKT/VIII/2026",
  no_urut: 1,
  payload: {},
  signer_assignments: [],
  surat_registration_draft_files: [],
  created_by: UUID.user,
  status: "DRAFT",
  expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
};

export const CREATE_REGISTRASI_RESULT = {
  id: UUID.surat,
  no_surat: "001/FA/MKT/VIII/2026",
};

export function buildDraftForRestore(overrides: Record<string, unknown> = {}) {
  return {
    ...CREATE_DRAFT_RESULT,
    payload: {
      formData: {
        entity_id: UUID.entity,
        dept_id: UUID.dept_pbo,
        letter_type_id: UUID.letter_type,
        office_id: UUID.office_pusat,
        project_id: "",
        judul_surat: "Permohonan Aset : Printer Epson Dept. Pengembangan Organisasi Kantor Pusat",
        penggunaan_id: "",
        is_aset: true,
        form_usage_id: UUID.form_usage,
        request_place: "Magelang",
        request_date: "2026-08-05",
        form_input_data: {
          request_category: "asset",
          request_mode: "barang",
          nama_barang: "Printer Epson",
        },
      },
      selectedFormId: UUID.form_a,
      selectedUsageId: UUID.form_usage,
      linkedDocumentContext: null,
    },
    signer_assignments: [
      { step_order: 1, form_usage_step_id: UUID.step1, user_id: UUID.user, label_jabatan: "Pemohon", role_name: "membuat" },
    ],
    surat_registration_draft_files: [],
    ...overrides,
  };
}
