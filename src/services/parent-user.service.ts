// src/services/parent-user.service.ts
import { supabase } from '@/lib/supabase';

export interface ChildUser {
  id: string;
  nik: string;
  full_name: string;
  avatar_url: string | null;
  department_id: string | null;  // uuid — FK ke master_departments
  office_id: number | null;
  parent_id: string | null;
  displayName?: string; // Untuk label di dropdown
  depth?: number;        // Tingkat kedalaman hirarki
}

/**
 * MENGAMBIL SELURUH HIERARKI USER (Anak, Cucu, Cicit)
 * Fungsi ini digunakan untuk mengisi dropdown filter di UI sehingga
 * Admin bisa memilih Yatno (Cucu) secara perorangan.
 */
export async function getChildUsers(parentId: string): Promise<ChildUser[]> {
  // 1. Ambil SEMUA profil aktif sekali saja untuk diproses di memori
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id, 
      nik, 
      full_name, 
      avatar_url, 
      department_id, 
      office_id, 
      parent_id
    `)
    .is('deleted_at', null)
    .order('full_name', { ascending: true });

  if (error) throw error;
  if (!data) return [];

  const result: ChildUser[] = [];
  const visited = new Set<string>([parentId]);

  /**
   * 2. Fungsi Rekursif untuk membangun daftar flat
   * Ini akan menelusuri secara mendalam: Admin -> Siti -> Yatno
   */
  const findDeep = (currentParentId: string, level: number = 0) => {
    // Cari semua user yang atasan langsungnya adalah currentParentId
    const children = data.filter(p => p.parent_id === currentParentId);
    
    children.forEach(child => {
      if (visited.has(child.id)) return;
      visited.add(child.id);
      // Menggunakan \u00A0 (Non-Breaking Space) agar indentasi muncul di dropdown HTML
      const indentation = "\u00A0\u00A0".repeat(level);
      const prefix = level > 0 ? "↳ " : "";
      
      result.push({
        ...child,
        displayName: `${indentation}${prefix}${child.full_name}`,
        depth: level
      } as ChildUser);
      
      // REKURSI: Cari lagi bawahan dari user ini (Mencari cucu)
      findDeep(child.id, level + 1);
    });
  };

  findDeep(parentId);
  return result;
}

/**
 * Mengecek apakah user memiliki bawahan (Parent Status)
 */
export async function isParentUser(userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', userId)
    .is('deleted_at', null);

  if (error) {
    console.error('Error checking parent status:', error);
    return false;
  }

  return (count || 0) > 0;
}

/**
 * Mengambil daftar ID lengkap secara rekursif
 * Digunakan untuk query .in() jika atasan ingin melihat "Semua Bawahan" sekaligus
 */
export async function getUserHierarchy(parentId: string): Promise<string[]> {
  const { data: allProfiles, error } = await supabase
    .from('profiles')
    .select('id, parent_id')
    .is('deleted_at', null);

  if (error || !allProfiles) return [parentId];

  const allSubordinateIds: string[] = [parentId];

  const findChildrenRecursive = (currentId: string) => {
    const children = allProfiles.filter(p => p.parent_id === currentId);
    children.forEach(child => {
      if (!allSubordinateIds.includes(child.id)) {
        allSubordinateIds.push(child.id);
        findChildrenRecursive(child.id);
      }
    });
  };

  findChildrenRecursive(parentId);
  return allSubordinateIds;
}
