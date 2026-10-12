import { supabase } from '@/lib/supabase';
import type { MasterOffice } from '@/services/office.service';

export const accessService = {
  async getOfficeCatalog(): Promise<MasterOffice[]> {
    const { data, error } = await supabase.from('master_offices')
      .select('id, code, name, kedudukan, parent_id').order('name');
    if (error) throw error;
    return data || [];
  },
  async getIssuingOfficeIds(): Promise<string[]> {
    const { data, error } = await supabase.rpc('get_my_issuing_office_ids');
    if (error) throw error;
    return data || [];
  },
  async canIssueForOffice(officeId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('can_issue_for_office', { p_office_id: officeId });
    if (error) throw error;
    return data === true;
  },
  async getUserOfficeGrants(userId: string): Promise<string[]> {
    const { data, error } = await supabase.rpc('get_user_issuing_office_grants', { p_user_id: userId });
    if (error) throw error;
    return data || [];
  },
  async setUserOfficeGrants(userId: string, officeIds: string[]): Promise<void> {
    const { error } = await supabase.rpc('set_user_issuing_office_grants', {
      p_user_id: userId, p_office_ids: officeIds,
    });
    if (error) throw error;
  },
};
