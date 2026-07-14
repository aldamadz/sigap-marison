// frontend/src/types/agenda.ts
import { z } from 'zod'

/* ======================================================
    ENUMS
====================================================== */
export type Role = 'admin' | 'super_admin' | 'user'
export type OfficeType = 'Pusat' | 'Cabang' | 'KCP'
export type AgendaStatus = 'Scheduled' | 'Ongoing' | 'Completed' | 'Deleted' | 'Overdue'
export type ActivityAction = 'CREATE' | 'INSERT' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'RESCHEDULE' | 'RESTORE' | 'COMPLETE';

/* ======================================================
    INTERFACES
====================================================== */
export interface User {
  id: string;
  email: string;
  fullName: string;
  nik: string;
  role: Role;
  jobTitle: string;
  photoUrl?: string;
  departmentId: number | null;
  departmentName?: string; // Hasil join
  officeId: number | null;   // Tambahkan ini
  officeName?: string;     // Tambahkan ini (hasil join)
  parentId: string | null;
  createdAt?: string;
}

export interface Agenda {
  id: number | string; // Sesuaikan dengan DB Anda
  title: string;
  description?: string | null;
  location?: string | null;
  status: AgendaStatus;
  startTime: string | Date; 
  endTime: string | Date;   
  createdBy: string;
  completedAt?: string | null;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  
  // TAMBAHKAN INI: Agar TS tidak error saat mapping join profiles
  profiles?: {
    id: string;
    fullName: string;
    avatarUrl?: string | null;
    officeName?: string;
    offices?: {
      name: string;
    };
  } | null;
}

export interface ActivityLog {
  id: string; // Standarisasi ke string agar konsisten
  action: ActivityAction | string;
  
  // Format CamelCase untuk digunakan di seluruh UI React
  userId?: string;
  tableName?: string;
  recordId?: string;
  newValues?: any;
  oldValues?: any;
  createdAt: string;
  details?: string; 

  // JOIN data dari tabel profiles
  profiles?: {
    fullName: string;      // Sudah CamelCase
    avatarUrl?: string | null; // Sudah CamelCase
  } | null;

  // Optional: Simpan original values jika sewaktu-waktu butuh data mentah
  user_id?: string;
  table_name?: string;
  record_id?: string;
}

export interface KPIData {
  label: string
  value: number
  change: number
  trend: 'up' | 'down' | 'neutral'
}

export interface ChartData {
  name: string
  value: number
  color?: string
}

/* ======================================================
    ZOD SCHEMA (Untuk Validasi Form)
====================================================== */
export const agendaSchema = z.object({
  title: z.string().min(3, "Minimal 3 karakter"),
  description: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  // Mengizinkan string (dari input html) atau Date object
  startTime: z.union([z.string(), z.date()]).refine(val => !!val, "Waktu mulai wajib diisi"),
  endTime: z.union([z.string(), z.date()]).refine(val => !!val, "Waktu selesai wajib diisi"),
  status: z.enum(['Scheduled', 'Ongoing', 'Completed', 'Deleted', 'Overdue']).default('Scheduled'),
}).refine((data) => {
  return new Date(data.endTime) > new Date(data.startTime);
}, {
  message: "Waktu selesai harus setelah waktu mulai",
  path: ["endTime"],
});

export type AgendaFormValues = z.infer<typeof agendaSchema>
