// d:/Koding/Agenda Flow/frontend/src/services/agenda.service.ts
import { supabase } from '@/lib/supabase';
import { Agenda, AgendaStatus } from '@/types/agenda';

/**
 * ADAPTER: Menyamakan database (snake_case) ke UI (camelCase)
 */
const mapAgenda = (db: any): Agenda => {
  const officeData = Array.isArray(db.profiles?.offices) 
    ? db.profiles.offices[0] 
    : db.profiles?.offices;

  return {
    id: db.id,
    title: db.title,
    description: db.description,
    location: db.location,
    status: db.status as AgendaStatus,
    startTime: db.start_time,
    endTime: db.end_time,
    createdBy: db.created_by,
    createdAt: db.created_at,
    completedAt: db.completed_at,
    deletedAt: db.deleted_at,
    profiles: db.profiles ? {
      id: db.profiles.id,
      fullName: db.profiles.full_name,
      avatarUrl: db.profiles.avatar_url,
      officeName: officeData?.name || 'PUSAT'
    } : null
  };
};

/**
 * REKURSI: Mengambil semua ID bawahan (Anak, Cucu, dst)
 */
async function getAllSubordinateIds(parentId: string): Promise<string[]> {
  const { data: allProfiles, error } = await supabase
    .from('profiles')
    .select('id, parent_id')
    .is('deleted_at', null);

  if (error || !allProfiles) return [parentId];

  const resultIds: string[] = [parentId];
  const findChildrenRecursive = (targetId: string) => {
    const children = allProfiles.filter(p => p.parent_id === targetId);
    children.forEach(child => {
      if (!resultIds.includes(child.id)) {
        resultIds.push(child.id);
        findChildrenRecursive(child.id);
      }
    });
  };

  findChildrenRecursive(parentId);
  return resultIds;
}

/**
 * FUNGSI UTAMA UNTUK ATASAN
 */
export async function getAgendasForParent(
  parentId: string,
  selectedUserId?: string | null,
  officeId?: string | null,
  dateRange?: { from: Date; to: Date } | null,
) {
  try {
    let targetIds: string[];

    // 1. Logika Penentuan Target User
    if (selectedUserId && selectedUserId !== "all" && selectedUserId !== "") {
      // Jika pilih perorangan (Yatno), fokus hanya ke ID tersebut
      targetIds = [selectedUserId];
    } else {
      // Jika pilih "Semua", ambil seluruh hirarki
      targetIds = await getAllSubordinateIds(parentId);
    }

    if (targetIds.length === 0) return [];

    // 2. Membangun Query
    // Kita gunakan !inner pada profiles jika filter kantor aktif agar data yang tidak cocok langsung terbuang
    const profileRelation = (officeId && officeId !== 'all' && officeId !== 'all_offices')
      ? 'profiles:created_by!inner'
      : 'profiles:created_by';

    let query = supabase
      .from('agendas')
      .select(`
        id, title, description, location, status, start_time, end_time,
        created_by, created_at, completed_at, deleted_at,
        ${profileRelation} (
          id, 
          full_name, 
          avatar_url,
          office_id,
          offices:office_id ( name )
        )
      `)
      .in('created_by', targetIds)
      .is('deleted_at', null);

    // 3. Tambahkan filter kantor HANYA jika tidak sedang pilih perorangan
    // (Atau tetap tambahkan jika ingin hasil yang sangat spesifik)
    if (officeId && officeId !== 'all' && officeId !== 'all_offices') {
      query = query.eq('profiles.office_id', officeId);
    }

    if (dateRange?.from) query = query.gte('start_time', dateRange.from.toISOString());
    if (dateRange?.to) query = query.lt('start_time', dateRange.to.toISOString());

    const { data, error } = await query.order('start_time', { ascending: false });
    
    if (error) throw error;
    return (data || []).map(mapAgenda);
  } catch (error) {
    console.error('Error in getAgendasForParent:', error);
    return [];
  }
}

/**
 * Mengambil daftar agenda aktif (Personal)
 */
export const getAgendas = async (): Promise<Agenda[]> => {
  const { data, error } = await supabase
    .from('agendas')
    .select(`id, title, description, location, status, start_time, end_time, created_by, created_at, completed_at, deleted_at, profiles:created_by(id, full_name, avatar_url, offices:office_id(name))`)
    .is('deleted_at', null)
    .order('start_time', { ascending: true });

  if (error) throw error;
  return (data || []).map(mapAgenda);
};

/**
 * Simpan / Update / Delete (Tetap seperti kode Anda sebelumnya)
 */
export const saveAgenda = async (agendaData: Partial<Agenda> & { startTime?: any; endTime?: any }, id?: string | number, oldAgenda?: Agenda) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesi tidak ditemukan.");
  const ensureString = (val: any) => { if (!val) return null; const date = new Date(val); return !isNaN(date.getTime()) ? date.toISOString() : null; };
  const payload: any = {
    title: agendaData.title,
    description: agendaData.description,
    location: agendaData.location,
    status: agendaData.status || 'Scheduled',
    start_time: agendaData.startTime ? ensureString(agendaData.startTime) : oldAgenda?.startTime, 
    end_time: agendaData.endTime ? ensureString(agendaData.endTime) : oldAgenda?.endTime,
  };
  if (!id) payload.created_by = user.id;
  if (payload.status === 'Completed') payload.completed_at = new Date().toISOString();
  else if (agendaData.status) payload.completed_at = null;
  const selectStr = `*, profiles:created_by(id, full_name, avatar_url, offices:office_id(name))`;
  const { data, error } = id ? await supabase.from('agendas').update(payload).eq('id', id).select(selectStr) : await supabase.from('agendas').insert([payload]).select(selectStr);
  if (error) throw error;
  return mapAgenda(data[0]);
};

export const updateAgendaStatus = async (id: string | number, status: AgendaStatus, oldAgenda?: Agenda) => saveAgenda({ ...oldAgenda, status }, id, oldAgenda);
export const deleteAgenda = async (id: string | number) => {
  const { error } = await supabase.from('agendas').update({ deleted_at: new Date().toISOString(), status: 'Deleted' }).eq('id', id);
  return !error;
};
