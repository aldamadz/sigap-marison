// frontend/src/services/office.service.ts
import { supabase } from '@/lib/supabase';

export interface MasterOffice {
  id: string;        // uuid
  code: string;
  name: string;
  kedudukan: string | null;  // 'Pusat' | 'KC' | 'KCP'
  parent_id: string | null;
}

/**
 * Mengambil semua kantor dari master_offices
 */
export async function getOffices(): Promise<MasterOffice[]> {
  const { data, error } = await supabase
    .from('master_offices')
    .select('id, code, name, kedudukan, parent_id')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching offices:', error);
    return [];
  }
  return data || [];
}

/**
 * Mengambil kantor beserta turunannya (rekursif di memori)
 */
export async function getOfficeWithDescendants(officeId: string): Promise<MasterOffice[]> {
  const allOffices = await getOffices();
  const result: MasterOffice[] = [];

  const target = allOffices.find(o => o.id === officeId);
  if (target) result.push(target);

  function walk(parentId: string) {
    allOffices
      .filter(o => o.parent_id === parentId)
      .forEach(child => {
        result.push(child);
        walk(child.id);
      });
  }

  walk(officeId);
  return result;
}
