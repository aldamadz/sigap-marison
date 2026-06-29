import { supabase } from '@/lib/supabase'
import { User } from '@/types/agenda'
import { toUIUser } from '@/adapters/user.adapter'

/**
 * MENGAMBIL PROFIL USER YANG SEDANG LOGIN
 */
export const getCurrentUser = async (): Promise<User | null> => {
  try {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    
    if (!authUser) return null;

    // Ambil data profil lengkap
    const { data: profile, error } = await supabase
      .from('profiles')
      .select(`
        *,
        master_departments (name, code)
      `)
      .eq('id', authUser.id)
      .maybeSingle();

    if (error || !profile) return null;

    // 1. Gunakan adapter bawaan
    const uiUser = toUIUser(profile);
    
    // 2. Gabungkan dengan semua kolom profiles (snake_case) agar SettingsView
    //    bisa menampilkan informasi lengkap (nik, job_title, phone, join_date, dll.)
    return {
      ...profile,
      ...uiUser,
      email: authUser.email || uiUser.email,
      // Pastikan photoUrl terisi dari avatar_url database
      photoUrl: profile.avatar_url || uiUser.photoUrl || null,
      departmentName: profile.master_departments?.name || 'Umum',
      departmentCode: profile.master_departments?.code || null,
    };
  } catch (error) {
    console.error('Error fetching current profile:', error);
    return null;
  }
}
