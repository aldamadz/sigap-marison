// frontend/src/services/dashboard.service.ts
import { supabase } from '@/lib/supabase';
import type { AgendaStatus } from '@/types/agenda';
import type { 
  DepartmentActivity, 
  KPIData,
  StatusChartData
} from '@/types/dashboard';
import { getUserHierarchy } from './parent-user.service';

/** Status agenda di DB (enum) - pakai nilai yang sama dengan tabel agendas */
const STATUS_COMPLETED: AgendaStatus[] = ['Completed'];
const STATUS_ONGOING: AgendaStatus[] = ['Ongoing'];
const STATUS_SCHEDULED: AgendaStatus[] = ['Scheduled'];

/**
 * 1. Mapping Nama Departemen ke Singkatan
 */
function shortenDeptName(deptName: string): string {
  const map: Record<string, string> = {
    'HRD & GA':             'HRD',
    'Keuangan & Akuntansi': 'Keuangan',
    'Legal Lahan':          'Legal Lahan',
    'Legal Proyek':         'Legal Proyek',
    'Marketing':            'Marketing',
    'Pengadaan':            'Pengadaan',
    'Pengembangan Bisnis':  'Bisnis',
    'Pengembangan Sistem':  'Sistem',
    'Perencanaan':          'Perencanaan',
  };
  return map[deptName] || deptName;
}

/**
 * 2. Helper Resolving Target IDs
 * Menangani string 'all' dari UI agar tidak menyebabkan error UUID di PostgreSQL
 */
async function resolveTargetIds(
  currentUserId: string,
  selectedUserId?: string | null
): Promise<string[]> {
  // Jika filter 'Semua Anggota' atau kosong
  if (!selectedUserId || selectedUserId === 'all') {
    return await getUserHierarchy(currentUserId);
  }

  // Jika memilih ID spesifik (termasuk diri sendiri)
  return [selectedUserId];
}

/**
 * 3. Helper Internal Fetch Agendas
 */
async function fetchAgendasInternal(targetUserIds: string[], startDate?: Date, endDate?: Date) {
  if (!targetUserIds || targetUserIds.length === 0) return { data: [], error: null };

  let query = supabase
    .from('agendas')
    .select('status, created_by, end_time, start_time')
    .is('deleted_at', null)
    .in('created_by', targetUserIds);

  if (startDate) query = query.gte('start_time', startDate.toISOString());
  if (endDate) {
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);
    query = query.lte('start_time', endOfDay.toISOString());
  }

  return await query;
}

/**
 * 4. Stats Ringkasan (Base Logic)
 */
export async function getDashboardStats(
  startDate?: Date, 
  endDate?: Date, 
  userId?: string | null,
  officeId?: string | null | number
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return emptyStats();

    const targetUserIds = await resolveTargetIds(user.id, userId);
    const { data: agendas, error } = await fetchAgendasInternal(targetUserIds, startDate, endDate);
    
    if (error) throw error;
    const safeAgendas = agendas || [];
    const now = new Date();

    // Sesuai kolom status di database (agendas.status): Scheduled | Ongoing | Completed | Deleted | Overdue
    return {
      total: safeAgendas.length,
      completed: safeAgendas.filter(a => STATUS_COMPLETED.includes(a.status as AgendaStatus)).length,
      ongoing: safeAgendas.filter(a => STATUS_ONGOING.includes(a.status as AgendaStatus)).length,
      scheduled: safeAgendas.filter(a => STATUS_SCHEDULED.includes(a.status as AgendaStatus)).length,
      overdue: safeAgendas.filter(a => {
        const st = a.status as AgendaStatus;
        if (st === 'Overdue') return true;
        const isPastDue = a.end_time && new Date(a.end_time) < now;
        return st !== 'Completed' && st !== 'Deleted' && !!isPastDue;
      }).length,
    };
  } catch (err) {
    console.error("Dashboard Stats Error:", err);
    return emptyStats();
  }
}

/**
 * 5. Mengambil aktivitas per Departemen (Bar Chart)
 * Dept yang ditampilkan disesuaikan dengan tipe kantor user yang login:
 *   - Pusat  → dept dengan code NOT NULL (dept pusat)
 *   - Cabang → dept dengan code IS NULL  (dept cabang, nama mengandung "(Cabang)")
 */
export async function getDepartmentActivity(
  startDate?: Date,
  endDate?: Date,
  userId?: string | null,
  officeId?: string | null | number
): Promise<DepartmentActivity[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // 1. Cek tipe user (pusat vs cabang) dari dept-nya sendiri
    //    Logika: dept user punya code → pusat; tidak punya code → cabang
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('department_id, master_departments(code)')
      .eq('id', user.id)
      .maybeSingle();

    const userDeptCode = (currentProfile?.master_departments as any)?.code ?? null;
    const isPusat = userDeptCode !== null;

    // 2. Ambil hanya dept yang relevan sesuai tipe user
    const deptQuery = supabase
      .from('master_departments')
      .select('name, code')
      .order('name');

    const { data: allDepartments } = isPusat
      ? await deptQuery.not('code', 'is', null)  // pusat: hanya dept ber-code
      : await deptQuery.is('code', null);           // cabang: hanya dept tanpa code

    if (!allDepartments || allDepartments.length === 0) return [];

    // 3. Inisialisasi grouped dengan nilai 0
    const grouped: Record<string, { tasks: number; completed: number }> = {};
    allDepartments.forEach(dept => {
      grouped[dept.name] = { tasks: 0, completed: 0 };
    });

    // 4. Tentukan target IDs (hirarki atau spesifik)
    const targetIds = await resolveTargetIds(user.id, userId);

    // 5. Ambil data agenda
    const { data: agendas } = await fetchAgendasInternal(targetIds, startDate, endDate);

    // 6. Ambil profil dengan dept masing-masing
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, master_departments(name)')
      .in('id', targetIds);

    // 7. Masukkan data agenda ke grouped (hanya dept yang ada di master list)
    if (agendas) {
      agendas.forEach(agenda => {
        const profile = profiles?.find(p => p.id === agenda.created_by);
        const deptName = (profile?.master_departments as any)?.name;

        if (deptName && grouped[deptName] !== undefined) {
          grouped[deptName].tasks++;
          if (agenda.status === 'Completed') {
            grouped[deptName].completed++;
          }
        }
      });
    }

    return Object.entries(grouped)
      .map(([fullName, data]) => ({
        name: shortenDeptName(fullName),
        fullName,
        tasks: data.tasks,
        completed: data.completed,
      }));

  } catch (error) {
    console.error("Dept Activity Error:", error);
    return [];
  }
}

/**
 * 6. Data KPI
 */
export async function getDashboardKPI(
  startDate?: Date, endDate?: Date, userId?: string | null, officeId?: string | null
): Promise<KPIData[]> {
  // Stats periode sekarang (sesuai filter Dashboard)
  const stats = await getDashboardStats(startDate, endDate, userId, officeId);
  const total = stats.total || 0;
  const getRate = (val: number) => (total > 0 ? Math.round((val / total) * 100) : 0);

  // Hitung perbandingan dengan bulan lalu khusus untuk Total Agenda
  let totalChangeFromLastMonth = 0;
  try {
    // Jika tidak ada start/end, asumsi: bulan berjalan
    const currentStart = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const currentEnd   = endDate   ? new Date(endDate)   : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

    const prevStart = new Date(currentStart);
    const prevEnd   = new Date(currentEnd);
    prevStart.setMonth(prevStart.getMonth() - 1);
    prevEnd.setMonth(prevEnd.getMonth() - 1);

    const prevStats = await getDashboardStats(prevStart, prevEnd, userId, officeId);
    const prevTotal = prevStats.total || 0;

    if (prevTotal > 0) {
      totalChangeFromLastMonth = Math.round(((total - prevTotal) / prevTotal) * 100);
    } else {
      totalChangeFromLastMonth = 0;
    }
  } catch {
    totalChangeFromLastMonth = 0;
  }

  return [
    {
      label: 'Total Agenda',
      value: total,
      change: totalChangeFromLastMonth,
      trend: totalChangeFromLastMonth > 0 ? 'up' : totalChangeFromLastMonth < 0 ? 'down' : 'neutral',
    },
    {
      label: 'Selesai',
      value: stats.completed,
      total,
      change: getRate(stats.completed),
      trend: 'up',
      isProgressCard: true,
    },
    { label: 'Berjalan', value: stats.ongoing, change: getRate(stats.ongoing), trend: 'up' },
    { label: 'Terjadwal', value: stats.scheduled, change: getRate(stats.scheduled), trend: 'neutral' },
    { label: 'Terlambat', value: stats.overdue, change: getRate(stats.overdue), trend: 'down' },
  ];
}

/**
 * 7. Status Distribution (Pie Chart) - FIXED: Tidak akan hilang jika data 0
 */
export async function getStatusDistribution(
  startDate?: Date, endDate?: Date, userId?: string | null, officeId?: string | null
): Promise<StatusChartData[]> {
  const stats = await getDashboardStats(startDate, endDate, userId, officeId);
  
  const rawData = [
    { name: 'Completed', value: stats.completed },
    { name: 'Ongoing', value: stats.ongoing },
    { name: 'Scheduled', value: stats.scheduled },
    { name: 'Overdue', value: stats.overdue },
  ];

  // Kembalikan semua data meskipun 0, agar komponen Recharts tetap memiliki struktur array
  // Filter hanya dilakukan jika ada minimal satu data yang tidak 0, 
  // atau biarkan apa adanya agar chart menampilkan state "No Data".
  const hasAnyData = rawData.some(d => d.value > 0);
  
  return hasAnyData ? rawData.filter(d => d.value > 0) : rawData;
}

/**
 * 8. Recent Activities
 */
export async function getRecentActivities(
  limit = 10, userId?: string | null, officeId?: string | null
): Promise<any[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase.rpc('get_my_recent_operational_activities', {
      p_limit: limit,
    });

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      action: row.action,
      table_name: row.table_name,
      record_id: row.record_id,
      old_values: row.old_values,
      new_values: row.new_values,
      created_at: row.created_at,
      profiles: row.profile_full_name
        ? {
            id: row.user_id,
            full_name: row.profile_full_name,
            avatar_url: row.profile_avatar_url,
          }
        : null,
    }));
  } catch (error) {
    console.error('Recent Activities Error:', error);
    return [];
  }
}

function emptyStats() {
  return { total: 0, completed: 0, ongoing: 0, scheduled: 0, overdue: 0 };
}
