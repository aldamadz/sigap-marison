import { supabase } from '@/lib/supabase';

export type ReminderKind = 'calendar' | 'surat';
export interface PersonalReminder {
  status: 'off' | 'scheduled' | 'sent' | 'cancelled';
  version: number;
  remind_at?: string;
  popup?: boolean;
}

export const reminderTimeWib = (iso: string): string => {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() + 7 * 3600_000).toISOString().slice(0, 16) : '';
};

export const reminderTimeIso = (local: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const date = new Date(`${local}:00+07:00`);
  if (!Number.isFinite(date.getTime()) || reminderTimeWib(date.toISOString()) !== local) return null;
  return date.toISOString();
};

export async function getPersonalReminder(kind: ReminderKind, targetId: string): Promise<PersonalReminder> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sesi berakhir. Silakan masuk kembali.');
  const { data, error } = await supabase.from('personal_reminders')
    .select('status,version,remind_at,popup').eq('user_id', user.id)
    .eq(kind === 'calendar' ? 'calendar_entry_id' : 'surat_id', targetId).maybeSingle();
  if (error) throw error;
  return data ?? { status: 'off', version: 0 };
}

export async function savePersonalReminder(kind: ReminderKind, targetId: string, at: string | null, popup: boolean, version: number): Promise<PersonalReminder> {
  const { data, error } = await supabase.rpc('save_personal_reminder', {
    p_kind: kind, p_target_id: targetId, p_remind_at: at, p_popup: popup, p_expected_version: version,
  });
  if (error) throw error;
  return data;
}
