import { beforeEach, describe, expect, it, vi } from 'vitest';
import { departmentReceivingService as service, defaultReceivingRule, defaultWeeklyReceivingRule } from '@/services/department-receiving.service';
const h = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), result: { data: null as unknown, error: null as unknown } }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: h.from, rpc: h.rpc } }));
const chain = {
  select: vi.fn(), eq: vi.fn(), order: vi.fn(), maybeSingle: vi.fn(), upsert: vi.fn(), delete: vi.fn(),
  then: (resolve: (result: typeof h.result) => unknown) => Promise.resolve(h.result).then(resolve),
};
beforeEach(() => {
  vi.resetAllMocks(); h.result = { data: null, error: null };
  h.from.mockReturnValue(chain); h.rpc.mockImplementation(async () => h.result);
  for (const fn of [chain.select, chain.eq, chain.order, chain.maybeSingle, chain.upsert, chain.delete]) fn.mockReturnValue(chain);
});

describe('SLA-02 frontend SQL contract', () => {
  it('defaults missing department settings off and upserts only the explicit switch', async () => {
    expect(await service.getSettings('dept')).toEqual({ dept_id: 'dept', enabled: false });
    expect(h.from).toHaveBeenCalledWith('department_receiving_settings'); expect(chain.eq).toHaveBeenCalledWith('dept_id', 'dept');
    await service.saveSettings({ dept_id: 'dept', enabled: false });
    expect(chain.upsert).toHaveBeenCalledWith({ dept_id: 'dept', enabled: false }, { onConflict: 'dept_id' });
    expect(chain.delete).not.toHaveBeenCalled();
  });
  it('uses separate weekly rows, composite conflict key and exact department/week deletes', async () => {
    await service.listWeekly('dept');
    expect(h.from).toHaveBeenCalledWith('department_receiving_weekly_rules'); expect(chain.order).toHaveBeenCalledWith('week_start');
    const rule = { ...defaultWeeklyReceivingRule, dept_id: 'dept', week_start: '2000-01-03' };
    await service.saveWeekly(rule); expect(chain.upsert).toHaveBeenCalledWith(rule, { onConflict: 'dept_id,week_start' });
    await service.removeWeekly('dept', '2026-11-02');
    expect(chain.eq).toHaveBeenCalledWith('dept_id', 'dept'); expect(chain.eq).toHaveBeenCalledWith('week_start', '2026-11-02');
    await expect(service.removeWeekly('dept', '2000-01-03')).rejects.toThrow();
  });
  it('retains the monthly table, API and payload', async () => {
    const rule = { ...defaultReceivingRule, dept_id: 'dept', period_month: '2000-01-01' };
    await service.list('dept'); await service.save(rule); await service.remove('dept', '2026-11-01');
    expect(h.from.mock.calls.every(([table]) => table === 'department_receiving_rules')).toBe(true);
    expect(chain.upsert).toHaveBeenCalledWith(rule); expect(chain.eq).toHaveBeenCalledWith('period_month', '2026-11-01');
  });
  it('rejects invalid weekly payload before any table write', async () => {
    await expect(service.saveWeekly({ ...defaultWeeklyReceivingRule, dept_id: 'dept', week_start: '2026-11-06' })).rejects.toThrow('Senin');
    expect(h.from).not.toHaveBeenCalled();
  });
  it('calls scope/candidate RPCs with exact arguments and discards private response fields', async () => {
    h.result.data = [{ dept_id: 'dept', name: 'Legal', secret: 'hidden' }];
    expect(await service.getScope()).toEqual([{ dept_id: 'dept', name: 'Legal' }]);
    expect(h.rpc).toHaveBeenCalledWith('get_department_sla_scope');
    h.result.data = [{ user_id: 'user', full_name: 'Person', selected: true, email: 'private@example.test' }];
    expect(await service.getManagerCandidates('dept')).toEqual([{ user_id: 'user', full_name: 'Person', selected: true }]);
    expect(h.rpc).toHaveBeenCalledWith('get_department_sla_manager_candidates', { p_dept_id: 'dept' });
    await service.setManagers('dept', ['user', 'user']);
    expect(h.rpc).toHaveBeenLastCalledWith('set_department_sla_managers', { p_dept_id: 'dept', p_user_ids: ['user'] });
    await service.setManagers('dept', []);
    expect(h.rpc).toHaveBeenLastCalledWith('set_department_sla_managers', { p_dept_id: 'dept', p_user_ids: [] });
  });
  it('propagates RLS/RPC failures instead of treating denial as empty data or success', async () => {
    h.result.error = new Error('denied');
    for (const action of [() => service.getScope(), () => service.getSettings('dept'), () => service.listWeekly('dept'), () => service.getManagerCandidates('dept'), () => service.setManagers('dept', []), () => service.saveSettings({ dept_id: 'dept', enabled: true })]) await expect(action()).rejects.toThrow('denied');
  });
});
