// frontend/src/services/user.service.ts
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { User } from '@/types/agenda';
import { toUIUser } from '@/adapters/user.adapter';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

const createRegistrationClient = () => createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'sb-registration-temp',
  },
});

const getJoinData = (data: any) => Array.isArray(data) ? data[0] : data;

/**
 * Mengambil semua daftar user
 */
export async function getUsers(): Promise<User[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id, email, full_name, nik, job_title, role, avatar_url,
        phone, join_date, resign_date, is_active,
        office_id, department_id, parent_id,
        master_departments ( name ),
        master_offices ( name )
      `)
      .is('deleted_at', null)
      .order('full_name', { ascending: true });

    if (error) throw error;

    return (data || []).map((item: any) => {
      const user   = toUIUser(item);
      const dept   = getJoinData(item.master_departments);
      const office = getJoinData(item.master_offices);
      return {
        ...user,
        email:          item.email,
        photoUrl:       item.avatar_url || user.photoUrl,
        departmentName: dept?.name   ?? null,
        officeName:     office?.name ?? null,
        phone:          item.phone       ?? null,
        join_date:      item.join_date   ?? null,
        resign_date:    item.resign_date ?? null,
        is_active:      item.is_active   ?? true,
      } as any;
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return [];
  }
}

/**
 * Memperbarui data profil
 */
export async function updateUserProfile(userId: string, updates: any) {
  try {
    const finalPayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.fullName    !== undefined) finalPayload.full_name = updates.fullName;
    if (updates.email       !== undefined) finalPayload.email     = updates.email;
    if (updates.nik         !== undefined) finalPayload.nik       = updates.nik;
    if (updates.jobTitle    !== undefined) finalPayload.job_title = updates.jobTitle;
    if (updates.role        !== undefined) finalPayload.role      = updates.role;
    if (updates.phone       !== undefined) finalPayload.phone       = updates.phone       || null;
    if (updates.join_date   !== undefined) finalPayload.join_date   = updates.join_date   || null;
    if (updates.resign_date !== undefined) finalPayload.resign_date = updates.resign_date || null;

    if (updates.officeId !== undefined) {
      // office_id sekarang uuid string (FK ke master_offices)
      finalPayload.office_id = (updates.officeId === 'none' || !updates.officeId)
        ? null : String(updates.officeId);
    }
    if (updates.departmentId !== undefined) {
      // department_id uuid string (FK ke master_departments)
      finalPayload.department_id = (updates.departmentId === 'none' || !updates.departmentId)
        ? null : String(updates.departmentId);
    }
    if (updates.parentId !== undefined) {
      finalPayload.parent_id = (updates.parentId === 'none' || !updates.parentId)
        ? null : updates.parentId;
    }

    Object.keys(finalPayload).forEach(k => {
      if (finalPayload[k] === undefined) delete finalPayload[k];
    });

    const { data, error } = await supabase
      .from('profiles')
      .update(finalPayload)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Database Error:', error);
    throw error;
  }
}

/**
 * Mengambil daftar bawahan
 */
export async function getSubordinates(parentId: string): Promise<User[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, master_departments(name), master_offices(name)')
      .eq('parent_id', parentId);

    if (error) throw error;

    return (data || []).map((item: any) => {
      const user   = toUIUser(item);
      const dept   = getJoinData(item.master_departments);
      const office = getJoinData(item.master_offices);
      return {
        ...user,
        photoUrl:       item.avatar_url || user.photoUrl,
        departmentName: dept?.name   ?? null,
        officeName:     office?.name ?? null,
      };
    });
  } catch (error) {
    console.error('Error fetching subordinates:', error);
    return [];
  }
}

/**
 * Mendaftarkan user baru (flow lama)
 */
export const registerNewUser = async (userData: any) => {
  try {
    const registrationClient = createRegistrationClient();
    const { data, error } = await registrationClient.auth.signUp({
      email:    userData.email,
      password: userData.password,
      options: {
        data: {
          full_name:     userData.fullName,
          nik:           userData.nik,
          job_title:     userData.jobTitle,
          role:          userData.role || 'user',
          // department_id & office_id keduanya uuid string
          department_id: (userData.departmentId && String(userData.departmentId) !== 'none')
            ? String(userData.departmentId) : null,
          office_id:     (userData.officeId && String(userData.officeId) !== 'none')
            ? String(userData.officeId) : null,
          parent_id:     (userData.parentId && userData.parentId !== 'none')
            ? userData.parentId : null,
        },
      },
    });

    if (error) throw error;
    return data.user;
  } catch (error) {
    console.error('Error in registerNewUser service:', error);
    throw error;
  }
};
