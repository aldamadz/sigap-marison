// ── Shared Types ──────────────────────────────────────────────────────────

export interface SuratItem {
  id: string;
  no_surat: string;
  judul_surat: string;
  status: string;
  pic_review_status: string | null;
  pic_attachment: string | null;
  pic_note: string | null;
  chat_status: 'OPEN' | 'CLOSED';
  chat_opened_at: string | null;
  updated_at: string;
  created_at: string;
  pic_id: string | null;
  dept_id: string | null;
  created_by: string;
  file_path: string | null;
  lampiran_path: string | null;
  surat_attachments?: Array<{
    id: string;
    file_url: string;
    file_name: string | null;
    file_type?: string | null;
    file_size?: number | null;
  }>;
  // joined
  creator_name?: string | null;
  pic_name?: string | null;
  dept_name?: string | null;
  dept_code?: string | null;
  payment_file_path?: string | null;
}

export interface Department {
  id: string;
  name: string;
  code: string | null;
  dept_index: number;
}

export type ReviewAction = 'APPROVE_SPK' | 'APPROVE_KEUANGAN' | 'APPROVE_DONE' | 'REJECT';

export interface ReviewState {
  open: boolean;
  surat: SuratItem | null;
  action: ReviewAction | null;
  note: string;
  file: File | null;
  loading: boolean;
}
