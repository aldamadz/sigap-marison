import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPersonalReminder, savePersonalReminder, reminderTimeIso, reminderTimeWib } from '@/services/personal-reminder.service';
const mocks = vi.hoisted(() => ({ user: vi.fn(), from: vi.fn(), eq: vi.fn(), single: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: mocks.user }, from: mocks.from, rpc: mocks.rpc } }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.user.mockResolvedValue({ data: { user: { id: 'self' } } });
  const builder = { eq: mocks.eq, maybeSingle: mocks.single };
  mocks.eq.mockReturnValue(builder); mocks.from.mockReturnValue({ select: () => builder });
  mocks.single.mockResolvedValue({ data: null, error: null });
});
describe('personal reminder service', () => {
  it('uses explicit WIB independent of the host timezone and rejects invalid dates', () => {
    expect(reminderTimeIso('2099-01-01T13:00')).toBe('2099-01-01T06:00:00.000Z');
    expect(reminderTimeWib('2099-01-01T06:00:00Z')).toBe('2099-01-01T13:00');
    expect(reminderTimeIso('2099-02-31T13:00')).toBeNull();
    expect(reminderTimeIso('invalid')).toBeNull();
  });
  it('scopes every read to the logged in user and target; absent means off', async () => {
    expect(await getPersonalReminder('calendar', 'work')).toEqual({ status: 'off', version: 0 });
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'self');
    expect(mocks.eq).toHaveBeenCalledWith('calendar_entry_id', 'work');
  });
  it('never queries when logged out', async () => {
    mocks.user.mockResolvedValue({ data: { user: null } });
    await expect(getPersonalReminder('surat', 'doc')).rejects.toThrow('Sesi berakhir');
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('passes expected version to canonical RPC, without caller-supplied recipient', async () => {
    mocks.rpc.mockResolvedValue({ data: { version: 2 }, error: null });
    await savePersonalReminder('surat', 'doc', null, false, 1);
    expect(mocks.rpc).toHaveBeenCalledWith('save_personal_reminder', { p_kind: 'surat', p_target_id: 'doc', p_remind_at: null, p_popup: false, p_expected_version: 1 });
  });
});
