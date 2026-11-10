import { supabase } from '@/lib/supabase';

export type DashboardScope = 'mine' | 'signer' | 'team';
export type DashboardBucket = 'all' | 'active' | 'ready' | 'blocked' | 'upcoming' | 'waiting' | 'returned' | 'completed' | 'rejected' | 'within_sla' | 'overdue';
export type DashboardRow = {
  id: string; no_surat: string | null; title: string; requester_name: string | null;
  office_name: string | null; department_name: string | null; bucket: DashboardBucket;
  current_step: number; my_step: number | null; signature_id: string | null;
  current_signer_id: string | null; current_signer_name: string | null; current_role: string | null;
  needs_verification: boolean; needs_recommendation: boolean; revision_reason: string | null;
  started_at: string | null; elapsed_minutes: number | null; sla_minutes: number;
  sla_paused?: boolean;
  sla_pause_reasons?: string[];
  can_remind?: boolean;
  receiving_at?: string|null;
  receiving_message?: string|null;
};
export type DashboardSummary = Record<'active' | 'ready' | 'blocked' | 'upcoming' | 'returned' | 'completed' | 'rejected' | 'within_sla' | 'overdue' | 'completed_on_time' | 'completed_measured', number>;
export type ActionableDashboardData = {
  scope: DashboardScope; team_label: string; has_signatures: boolean; generated_at: string;
  summary: DashboardSummary; count: number; rows: DashboardRow[];
  groups: { name: string; active: number; overdue: number }[];
};
export const dashboardRowLink = (row: DashboardRow, scope: DashboardScope) => {
  if (scope === 'signer' && row.bucket === 'ready' && row.signature_id) {
    return `/surat/inbox?task=${encodeURIComponent(`approval:${row.signature_id}`)}`;
  }
  if (scope === 'mine' && row.bucket === 'returned') return '/surat/tindak-lanjut';
  return `/status-pengajuan?document=${encodeURIComponent(row.id)}`;
};
export async function getActionableDashboard(filters: {
  scope: DashboardScope; bucket: DashboardBucket; from: string; to: string;
  search: string; page: number; signal?: AbortSignal;
}): Promise<ActionableDashboardData> {
  const { data, error } = await supabase.rpc('get_actionable_dashboard', {
    p_scope: filters.scope, p_bucket: filters.bucket, p_from: filters.from, p_to: filters.to,
    p_search: filters.search.trim().slice(0, 100) || null, p_limit: 12, p_offset: (filters.page - 1) * 12,
  }).abortSignal(filters.signal as AbortSignal);
  if (error) throw error;
  if (!data || !data.summary || !Array.isArray(data.rows)) throw new Error('Ringkasan pengajuan tidak tersedia.');
  return data as ActionableDashboardData;
}

export async function remindDashboardRequest(suratId: string): Promise<{ sent: boolean; recipient: string }> {
  const { data, error } = await supabase.rpc('remind_dashboard_request', { p_surat_id: suratId });
  if (error) throw error;
  return data;
}
