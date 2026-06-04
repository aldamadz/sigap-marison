import { supabase } from '@/lib/supabase';
import { ActivityLog } from '@/types/agenda';
import { toUIActivityLog } from '@/adapters/activity-log.adapter';

const stableStringify = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${key}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return String(value);
};

const getLogBucket = (createdAt: string) => {
  const time = new Date(createdAt).getTime();
  if (!Number.isFinite(time)) return createdAt;
  return String(Math.floor(time / 10_000));
};

const mergeNearProfileUpdates = (logs: ActivityLog[]) => {
  const sortedAsc = [...logs].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const merged: ActivityLog[] = [];

  for (const log of sortedAsc) {
    const tableName = log.tableName || log.table_name || '';
    const recordId = log.recordId || log.record_id || '';
    const logTime = new Date(log.createdAt).getTime();
    const previous = merged[merged.length - 1];
    const previousTime = previous ? new Date(previous.createdAt).getTime() : NaN;
    const sameProfileUpdate =
      previous &&
      tableName === 'profiles' &&
      (previous.tableName || previous.table_name) === 'profiles' &&
      log.action?.toUpperCase() === 'UPDATE' &&
      previous.action?.toUpperCase() === 'UPDATE' &&
      recordId &&
      recordId === (previous.recordId || previous.record_id) &&
      Number.isFinite(logTime) &&
      Number.isFinite(previousTime) &&
      logTime - previousTime <= 2_000;

    if (!sameProfileUpdate) {
      merged.push(log);
      continue;
    }

    const previousHasActor = Boolean(previous.userId || previous.user_id);
    const nextHasActor = Boolean(log.userId || log.user_id);
    merged[merged.length - 1] = {
      ...previous,
      id: `${previous.id}+${log.id}`,
      userId: previousHasActor ? previous.userId : log.userId,
      user_id: previousHasActor ? previous.user_id : log.user_id,
      profiles: previousHasActor || !nextHasActor ? previous.profiles : log.profiles,
      oldValues: previous.oldValues || log.oldValues,
      newValues: { ...(previous.newValues || {}), ...(log.newValues || {}) },
      createdAt: log.createdAt,
    } as ActivityLog;
  }

  return merged;
};

const dedupeActivityLogs = (logs: ActivityLog[]) => {
  const grouped = new Map<string, ActivityLog>();

  for (const log of mergeNearProfileUpdates(logs)) {
    const key = [
      log.action?.toUpperCase(),
      log.tableName || log.table_name || '',
      log.recordId || log.record_id || '',
      stableStringify(log.oldValues),
      stableStringify(log.newValues),
      getLogBucket(log.createdAt),
    ].join('|');

    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, log);
      continue;
    }

    const existingHasActor = Boolean(existing.userId || existing.user_id);
    const nextHasActor = Boolean(log.userId || log.user_id);
    if (!existingHasActor && nextHasActor) grouped.set(key, log);
  }

  return Array.from(grouped.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
};

const ignoredAuditFields = new Set([
  'id',
  'created_at',
  'updated_at',
  'deleted_at',
  'last_signer_change_at',
  'creator_seen_at',
  'pic_seen_at',
  'requester_seen_at',
  'seen_at',
  'read_at',
  'last_read_at',
]);

const isMetadataOnlyAuditLog = (log: ActivityLog) => {
  if (log.action?.toUpperCase() !== 'UPDATE') return false;

  const oldValues = log.oldValues || {};
  const newValues = log.newValues || {};
  const changedKeys = Object.keys({ ...oldValues, ...newValues }).filter(
    (key) => JSON.stringify(oldValues?.[key] ?? null) !== JSON.stringify(newValues?.[key] ?? null)
  );

  return changedKeys.length > 0 && changedKeys.every((key) => ignoredAuditFields.has(key));
};

const isUuid = (value: unknown) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const enrichAuditValues = async (logs: ActivityLog[]) => {
  if (!logs.length) return logs;

  const [
    { data: departments },
    { data: offices },
    { data: profiles },
    { data: forms },
    { data: projects },
    { data: letterTypes },
  ] = await Promise.all([
    supabase.from('master_departments').select('id, name'),
    supabase.from('master_offices').select('id, name, kedudukan'),
    supabase.from('profiles').select('id, full_name'),
    supabase.from('master_forms').select('id, nama_form'),
    supabase.from('master_projects').select('id, code, name'),
    supabase.from('master_letter_types').select('id, name, code'),
  ]);

  const departmentMap = new Map((departments || []).map((row: any) => [String(row.id), row.name]));
  const officeMap = new Map((offices || []).map((row: any) => [
    String(row.id),
    row.kedudukan && row.kedudukan !== 'Pusat' ? `${row.kedudukan} ${row.name}` : row.name,
  ]));
  const profileMap = new Map((profiles || []).map((row: any) => [String(row.id), row.full_name]));
  const formMap = new Map((forms || []).map((row: any) => [String(row.id), row.nama_form]));
  const projectMap = new Map((projects || []).map((row: any) => [
    String(row.id),
    row.code ? `${row.code} - ${row.name}` : row.name,
  ]));
  const letterTypeMap = new Map((letterTypes || []).map((row: any) => [
    String(row.id),
    row.code ? `${row.code} - ${row.name}` : row.name,
  ]));

  const resolveValue = (key: string, value: unknown) => {
    if (!isUuid(value)) return value;

    if (['department_id', 'dept_id', 'target_department_id'].includes(key)) {
      return departmentMap.get(value) || value;
    }
    if (['office_id', 'branch_id', 'target_office_id'].includes(key)) {
      return officeMap.get(value) || value;
    }
    if (['user_id', 'created_by', 'updated_by', 'pic_id', 'parent_id', 'signer_id', 'requester_id'].includes(key)) {
      return profileMap.get(value) || value;
    }
    if (['form_id'].includes(key)) {
      return formMap.get(value) || value;
    }
    if (['project_id'].includes(key)) {
      return projectMap.get(value) || value;
    }
    if (['letter_type_id', 'type_id'].includes(key)) {
      return letterTypeMap.get(value) || value;
    }

    return value;
  };

  const enrichObject = (values: any) => {
    if (!values || typeof values !== 'object' || Array.isArray(values)) return values;
    return Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, resolveValue(key, value)])
    );
  };

  return logs.map((log) => ({
    ...log,
    oldValues: enrichObject(log.oldValues),
    newValues: enrichObject(log.newValues),
  }));
};

/**
 * Mengambil log aktivitas dengan filter User, Office, dan Pagination.
 * Mendukung fitur Infinite Scroll / Load More.
 */
export const getActivityLogs = async (
  userId?: string | null, 
  officeId?: string | null,
  pageParam: number = 0,
  pageSize: number = 15
): Promise<ActivityLog[]> => {
  // Jika pageSize diatur sangat besar (untuk mode "Semua")
  const actualSize = pageSize;
  const from = pageParam * actualSize;
  const to = from + actualSize - 1;

  let query = supabase
    .from('activity_logs')
    .select(`
      *,
      profiles:user_id (
        full_name,
        avatar_url,
        office_id
      )
    `)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (userId && userId !== 'all' && userId !== 'me') {
    query = query.eq('user_id', userId);
  } else if (userId === 'me') {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) query = query.eq('user_id', user.id);
  }

  if (officeId && officeId !== 'all_offices') {
    query = query.eq('profiles.office_id', officeId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const filteredData = (data || []).filter(log => {
    if (officeId && officeId !== 'all_offices') {
      return log.profiles && (log.profiles as any).office_id === officeId;
    }
    return true;
  });

  const mappedLogs = dedupeActivityLogs(
    filteredData
      .map(log => toUIActivityLog(log as any))
      .filter(log => !isMetadataOnlyAuditLog(log))
  );
  return enrichAuditValues(mappedLogs);
};
