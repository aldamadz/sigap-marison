export type Role = 'admin' | 'super_admin' | 'user';

export interface User {
  id: string; // Ubah ke string karena Supabase Auth menggunakan UUID
  nik: string;
  fullName: string;
  jobTitle: string;
  role: Role;
  officeId: number;
  departmentId?: number | null;
  departmentName?: string; // Tambahkan ini agar grafik bisa baca nama departemen
  officeName?: string;     // Tambahkan ini untuk label di dashboard
  parentId?: string | null; // Ubah ke string agar sesuai dengan UUID
  photoUrl?: string | null;
  updatedAt?: string;
}
