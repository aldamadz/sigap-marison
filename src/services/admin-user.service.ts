// frontend/src/services/admin-user.service.ts
//
// Root cause: the admin-user UI called `supabase.functions.invoke("admin-create-user")`,
// but the staging Supabase project has no such Edge Function (OPTIONS/POST return
// 404 NOT_FOUND). Every admin-user mutation therefore depended on a backend that
// does not exist. This service talks to the SIGAP backend instead, which already
// owns the service-role key. The frontend never sees a service-role key and never
// sends a password: the bootstrap password stays server-side.
import { supabase } from '@/lib/supabase';

export type AdminUserRole = 'user' | 'admin';

export interface AdminUserPublicRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AdminUserRole | null;
  is_active: boolean;
  department_id: string | null;
  office_id: string | null;
  parent_id: string | null;
}

export interface AdminUserUpsertInput {
  email: string;
  full_name: string;
  nik: string;
  role?: AdminUserRole;
  job_title?: string | null;
  phone?: string | null;
  join_date?: string | null;
  resign_date?: string | null;
  department_id?: string | null;
  office_id?: string | null;
  parent_id?: string | null;
}

export interface AdminUserSyncImportResult {
  dryRun: boolean;
  deactivated: number;
  wouldDeactivate: number;
  items: AdminUserPublicRow[];
}

const getAccessToken = async (): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Tidak terautentikasi');
  return session.access_token;
};

/**
 * Same-origin + Bearer session for every state-changing admin-user call.
 * The backend enforces same-origin, requires a valid session, and requires
 * an active admin profile; we mirror that contract here.
 */
const request = async <T>(path: string, init: RequestInit): Promise<T> => {
  const token = await getAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (payload as { error?: string })?.error || 'Permintaan admin user gagal.';
    const error = new Error(message) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return payload as T;
};

const normalizeOrganizationField = (value: string | undefined | null): string | null =>
  !value || value === 'none' ? null : String(value);

const buildUpsertBody = (input: AdminUserUpsertInput) => ({
  email: input.email.trim().toLowerCase(),
  full_name: input.full_name.trim(),
  nik: input.nik.trim(),
  role: input.role || 'user',
  job_title: input.job_title?.trim() || null,
  phone: input.phone?.trim() || null,
  join_date: input.join_date || null,
  resign_date: input.resign_date || null,
  department_id: normalizeOrganizationField(input.department_id),
  office_id: normalizeOrganizationField(input.office_id),
  parent_id: normalizeOrganizationField(input.parent_id),
});

/**
 * Maps a backend status to a user-facing Indonesian message so the UI can show
 * 400/403/409/503 distinctly instead of a generic failure.
 */
export const describeAdminUserError = (error: unknown): string => {
  const status = (error as { status?: number })?.status;
  const message = error instanceof Error ? error.message : 'Terjadi kesalahan.';
  if (status === 400) return `Data tidak valid: ${message}`;
  if (status === 401) return 'Sesi berakhir. Silakan login kembali.';
  if (status === 403) return `Akses ditolak: ${message}`;
  if (status === 404) return `User tidak ditemukan: ${message}`;
  if (status === 409) return `Konflik data: ${message}`;
  if (status === 503) return `Layanan belum siap: ${message}`;
  return message;
};

export const adminUserService = {
  createUser: (input: AdminUserUpsertInput) =>
    request<{ user: AdminUserPublicRow }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(buildUpsertBody(input)),
    }),

  updateUser: (userId: string, input: AdminUserUpsertInput) =>
    request<{ user: AdminUserPublicRow }>(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(buildUpsertBody(input)),
    }),

  resetPassword: (userId: string) =>
    request<{ success: true; sessionsRevoked: boolean; recoveryEmailSent: boolean }>(
      `/api/admin/users/${userId}/reset-password`,
      { method: 'POST', body: JSON.stringify({}) },
    ),

  updateStatus: (userId: string, isActive: boolean) =>
    request<{ user: AdminUserPublicRow }>(`/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive }),
    }),

  syncActiveImport: (activeNiks: string[], dryRun = false) =>
    request<AdminUserSyncImportResult>('/api/admin/users/sync-active-import', {
      method: 'POST',
      body: JSON.stringify({ active_niks: activeNiks, dry_run: dryRun }),
    }),
};
