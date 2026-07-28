export type UserRole = "admin" | "super_admin" | "user";

export interface UserProfile {
  id: string;
  nik: string;
  fullName: string;
  jobTitle: string;
  role: UserRole;
  officeId: number;
  departmentId?: number | null;
  departmentName?: string;
  officeName?: string;
  parentId?: string | null;
  photoUrl?: string | null;
  updatedAt?: string;
}

export type SuratStatus = "PROSES" | "SELESAI" | "DITOLAK" | string;

export interface SuratSigner {
  role_name: string;
  user_id?: string | null;
  step_order: number;
}

export interface SuratSignerDetail extends SuratSigner {
  id: string;
  is_signed: boolean;
  status?: string | null;
  signed_at?: string | null;
  profiles?: {
    full_name: string;
    avatar_url?: string;
  };
}

export interface SuratAttachmentDetail {
  id: string;
  file_url: string;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  stage?: string | null;
  requirement_key?: string | null;
  requirement_label?: string | null;
  signature_id?: string | null;
}

export interface SuratRegistrasi {
  id: string;
  no_surat: string | null;
  judul_surat: string;
  status: SuratStatus;
  file_path?: string | null;
  lampiran_path?: string | null;
  current_step: number;
  created_at: string;
  updated_at?: string;
  entity_id?: string;
  office_id?: string;
  project_id?: string;
  dept_id?: string;
  letter_type_id?: string;
  penggunaan_id?: string;
  created_by?: string;
  surat_signatures?: SuratSignerDetail[];
  surat_attachments?: SuratAttachmentDetail[];
}

export interface BffError {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
  name?: string;
}

export interface BffResult<T = unknown> {
  data: T | null;
  error: BffError | null;
  count?: number | null;
  status?: number;
  statusText?: string;
}
