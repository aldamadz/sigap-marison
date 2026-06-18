/**
 * Definisi utama untuk data Registrasi Surat
 * Disesuaikan dengan tabel public.surat_registrasi
 */
export interface SuratRegistrasi {
  id: string;
  no_surat: string | null; // Database mengizinkan null
  judul_surat: string;
  status: 'PROSES' | 'SELESAI' | 'DITOLAK' | string; // Tambahkan string untuk fleksibilitas tipe di DB
  file_path?: string | null;
  lampiran_path?: string | null;
  current_step: number;
  created_at: string;
  updated_at?: string;
  
  // Optional Properties (Sesuai dengan relasi di database)
  entity_id?: string;
  office_id?: string;
  project_id?: string;
  dept_id?: string;
  letter_type_id?: string;
  penggunaan_id?: string;
  
  /** * Dibuat opsional agar tidak error saat fetching dari DB 
   * yang belum memiliki kolom created_by 
   */
  created_by?: string; 
  
  // Relasi dengan tabel surat_signatures
  surat_signatures?: SuratSignerDetail[];
  surat_attachments?: SuratAttachmentDetail[];
}

/**
 * Struktur dasar penandatangan surat
 */
export interface SuratSigner {
  role_name: string;
  user_id?: string | null; // Bisa kosong jika belum ditentukan pejabatnya
  step_order: number;
}

/**
 * Detail penandatangan termasuk status tanda tangan dan profil
 * Digunakan untuk alur monitoring/tracking
 */
export interface SuratSignerDetail extends SuratSigner {
  id: string;
  is_signed: boolean;
  signed_at?: string | null;
  
  // Hasil join dari tabel profiles
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

/**
 * Tipe pembantu untuk status badge atau progress
 */
export type SuratStatus = 'PROSES' | 'SELESAI' | 'DITOLAK';
