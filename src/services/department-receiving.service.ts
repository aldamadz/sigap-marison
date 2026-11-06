import { supabase } from '@/lib/supabase';

export type DepartmentReceivingRule = {
  dept_id: string; period_month: string; enabled: boolean; cutoff_day: number | null;
  cutoff_time: string; reopen_day: number; reopen_time: string; sla_minutes: number | null; message: string;
};
export type DepartmentReceivingSettings = { dept_id: string; enabled: boolean };
export type DepartmentReceivingWeeklyRule = {
  dept_id: string; week_start: string; enabled: boolean; open_weekday: number; open_time: string;
  cutoff_weekday: number; cutoff_time: string; sla_minutes: number | null; message: string;
};
export type DepartmentSlaScope = { dept_id: string; name: string };
export type DepartmentSlaManagerCandidate = { user_id: string; full_name: string; selected: boolean };

export const regularReceivingMonth = '2000-01-01';
export const regularReceivingWeek = '2000-01-03';
export const defaultReceivingRule = {
  enabled: false, cutoff_day: null as number | null, cutoff_time: '17:00', reopen_day: 1,
  reopen_time: '08:00', sla_minutes: null as number | null, message: '',
};
export const defaultWeeklyReceivingRule = {
  enabled: false, open_weekday: 1, open_time: '08:00', cutoff_weekday: 4,
  cutoff_time: '16:00', sla_minutes: null as number | null, message: '',
};

const validTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time);
const timeSeconds = (time: string) => {
  const [hours, minutes, seconds = 0] = time.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds;
};
function validateRuleDetails(rule: { sla_minutes: number | null; message: string }) {
  if (rule.sla_minutes !== null && (!Number.isInteger(rule.sla_minutes) || rule.sla_minutes < 1 || rule.sla_minutes > 525600)) {
    throw Error('SLA harus berupa menit lebih dari nol (maksimal 525600).');
  }
  if (rule.message.length > 300) throw Error('Pesan maksimal 300 karakter.');
}

export function validateReceivingRule(rule: DepartmentReceivingRule) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(rule.period_month) || !validTime(rule.cutoff_time) || !validTime(rule.reopen_time)) {
    throw Error('Periksa bulan dan jam penerimaan.');
  }
  if (rule.enabled && rule.cutoff_day === null) throw Error('Isi tanggal tutup penerimaan.');
  if (!Number.isInteger(rule.reopen_day) || rule.reopen_day < 1 || rule.reopen_day > 28 || rule.cutoff_day !== null &&
    (!Number.isInteger(rule.cutoff_day) || rule.cutoff_day < 1 || rule.cutoff_day > 31 || rule.cutoff_day < rule.reopen_day ||
      rule.cutoff_day === rule.reopen_day && timeSeconds(rule.cutoff_time) <= timeSeconds(rule.reopen_time))) {
    throw Error('Tanggal tutup harus setelah jadwal buka.');
  }
  validateRuleDetails(rule);
  return rule;
}

export function isReceivingWeekStart(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 1;
}

export function validateWeeklyReceivingRule(rule: DepartmentReceivingWeeklyRule) {
  if (!isReceivingWeekStart(rule.week_start)) throw Error('Tanggal awal minggu harus hari Senin.');
  if (![rule.open_weekday, rule.cutoff_weekday].every(day => Number.isInteger(day) && day >= 1 && day <= 7) ||
    !validTime(rule.open_time) || !validTime(rule.cutoff_time)) throw Error('Periksa hari dan jam penerimaan.');
  if (rule.open_weekday > rule.cutoff_weekday || rule.open_weekday === rule.cutoff_weekday &&
    timeSeconds(rule.open_time) >= timeSeconds(rule.cutoff_time)) {
    throw Error('Jadwal buka harus sebelum tutup dalam minggu yang sama.');
  }
  validateRuleDetails(rule);
  return rule;
}

export const departmentReceivingService = {
  async list(deptId: string): Promise<DepartmentReceivingRule[]> {
    const { data, error } = await supabase.from('department_receiving_rules')
      .select('dept_id,period_month,enabled,cutoff_day,cutoff_time,reopen_day,reopen_time,sla_minutes,message')
      .eq('dept_id', deptId).order('period_month');
    if (error) throw error;
    return data || [];
  },
  async save(rule: DepartmentReceivingRule) {
    validateReceivingRule(rule);
    const { error } = await supabase.from('department_receiving_rules').upsert(rule);
    if (error) throw error;
  },
  async remove(deptId: string, month: string) {
    const { error } = await supabase.from('department_receiving_rules').delete().eq('dept_id', deptId).eq('period_month', month);
    if (error) throw error;
  },
  async getSettings(deptId: string): Promise<DepartmentReceivingSettings> {
    const { data, error } = await supabase.from('department_receiving_settings').select('dept_id,enabled')
      .eq('dept_id', deptId).maybeSingle();
    if (error) throw error;
    return data || { dept_id: deptId, enabled: false };
  },
  async saveSettings(settings: DepartmentReceivingSettings) {
    const { error } = await supabase.from('department_receiving_settings')
      .upsert({ dept_id: settings.dept_id, enabled: settings.enabled }, { onConflict: 'dept_id' });
    if (error) throw error;
  },
  async listWeekly(deptId: string): Promise<DepartmentReceivingWeeklyRule[]> {
    const { data, error } = await supabase.from('department_receiving_weekly_rules')
      .select('dept_id,week_start,enabled,open_weekday,open_time,cutoff_weekday,cutoff_time,sla_minutes,message')
      .eq('dept_id', deptId).order('week_start');
    if (error) throw error;
    return data || [];
  },
  async saveWeekly(rule: DepartmentReceivingWeeklyRule) {
    validateWeeklyReceivingRule(rule);
    const { error } = await supabase.from('department_receiving_weekly_rules').upsert(rule, { onConflict: 'dept_id,week_start' });
    if (error) throw error;
  },
  async removeWeekly(deptId: string, weekStart: string) {
    if (!isReceivingWeekStart(weekStart) || weekStart === regularReceivingWeek) throw Error('Pilih minggu pengecualian.');
    const { error } = await supabase.from('department_receiving_weekly_rules').delete()
      .eq('dept_id', deptId).eq('week_start', weekStart);
    if (error) throw error;
  },
  async getScope(): Promise<DepartmentSlaScope[]> {
    const { data, error } = await supabase.rpc('get_department_sla_scope');
    if (error) throw error;
    return (data || []).map((row: DepartmentSlaScope) => ({ dept_id: row.dept_id, name: row.name }));
  },
  async getManagerCandidates(deptId: string): Promise<DepartmentSlaManagerCandidate[]> {
    const { data, error } = await supabase.rpc('get_department_sla_manager_candidates', { p_dept_id: deptId });
    if (error) throw error;
    return (data || []).map((row: DepartmentSlaManagerCandidate) => ({ user_id: row.user_id, full_name: row.full_name, selected: row.selected }));
  },
  async setManagers(deptId: string, userIds: string[]) {
    const { error } = await supabase.rpc('set_department_sla_managers', { p_dept_id: deptId, p_user_ids: [...new Set(userIds)] });
    if (error) throw error;
  },
};
