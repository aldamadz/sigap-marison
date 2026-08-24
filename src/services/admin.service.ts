import { supabase } from '@/lib/supabase';
import { User } from '@/types/user';
import { Office } from '@/types/office';

export const adminService = {
  // ==========================================
  // USER MANAGEMENT
  // ==========================================

  async getAllUsers() {
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        *,
        master_offices ( id, name, kedudukan ),
        master_departments ( id, name )
      `)
      .is('deleted_at', null)
      .order('full_name', { ascending: true });

    if (error) throw error;
    return data;
  },

  async updateUserProfile(userId: string, updates: Partial<User>) {
    const { office_id, department_id, offices, master_offices, departments, master_departments, ...cleanUpdates } = updates as any;

    const payload: any = {
      ...cleanUpdates,
      // office_id uuid string (FK ke master_offices)
      office_id:     office_id     ? String(office_id)     : null,
      // department_id uuid string (FK ke master_departments)
      department_id: department_id ? String(department_id) : null,
      updated_at: new Date().toISOString(),
    };

    // Hapus field join yang bukan kolom tabel
    delete payload.offices;
    delete payload.master_offices;
    delete payload.departments;
    delete payload.master_departments;

    const { data, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('Payload yang menyebabkan error:', payload);
      throw error;
    }
    return data;
  },

  async softDeleteUser(userId: string) {
    const { error } = await supabase
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) throw error;
  },

  // ==========================================
  // OFFICE MANAGEMENT — pakai master_offices (uuid PK)
  // ==========================================

  async getAllOffices() {
    const { data, error } = await supabase
      .from('master_offices')
      .select('id, name, kedudukan, code, parent_id')
      .order('name', { ascending: true });

    if (error) throw error;
    return data;
  },

  // ==========================================
  // DEPARTMENT MANAGEMENT — pakai master_departments
  // ==========================================

  async getAllDepartments() {
    const { data, error } = await supabase
      .from('master_departments')
      .select('id, name, code')
      .order('name', { ascending: true });

    if (error) throw error;
    return data;
  },

  async createDepartment(name: string, code?: string) {
    const { data, error } = await supabase
      .from('master_departments')
      .insert([{ name, ...(code ? { code } : {}) }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteDepartment(id: string) {   // uuid
    const { error } = await supabase
      .from('master_departments')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};
