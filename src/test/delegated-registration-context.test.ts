import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: 'carissa' } } }) },
  from: mock.from, rpc: mock.rpc,
} }));
import { suratService } from '@/services/surat.service';
beforeEach(() => {
  mock.rpc.mockReset().mockResolvedValue({ data: true, error: null });
  mock.from.mockImplementation((table: string) => {
    const data = table === 'profiles'
      ? { id: 'carissa', role: 'user', office_id: 'karanganyar', department_id: 'admin-dept' }
      : { id: 'selected' };
    const result = { data, error: null };
    const chain = { select: () => chain, eq: () => chain, single: async () => result, maybeSingle: async () => result };
    return chain;
  });
});
describe('delegated registration service context', () => {
  it('uses the authorized issuing office without replacing the actual creator profile', async () => {
    const context = await suratService.getRegistrationContext({ office_id: 'solo', dept_id: 'admin-dept', draft_id: 'draft' });
    expect(mock.rpc).toHaveBeenCalledWith('can_issue_for_office', { p_office_id: 'solo' });
    expect(context.payload.office_id).toBe('solo');
    expect(context.profile.office_id).toBe('karanganyar');
    expect(context.user.id).toBe('carissa');
  });
  it('rejects revoked or missing office rights instead of silently using the profile office', async () => {
    mock.rpc.mockResolvedValue({ data: false, error: null });
    await expect(suratService.getRegistrationContext({ office_id: 'solo', dept_id: 'admin-dept' }))
      .rejects.toThrow('Kantor penerbit tidak diizinkan');
  });
  it('does not turn office delegation into department or requester impersonation', async () => {
    await expect(suratService.getRegistrationContext({ office_id: 'solo', dept_id: 'other-dept' }))
      .rejects.toThrow('Departemen pengajuan tidak sesuai');
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});
