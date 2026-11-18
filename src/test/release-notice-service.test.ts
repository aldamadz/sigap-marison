import { beforeEach, describe, expect, it, vi } from 'vitest';
import { releaseNoticeService } from '@/services/release-notice.service';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }));
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: { revision: 1 }, error: null }); });
describe('standalone release notice service', () => {
  it('reads active and admin views without using maintenance endpoints', async () => {
    await releaseNoticeService.current(); await releaseNoticeService.admin(); await releaseNoticeService.history();
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(['get_active_release_notice', 'get_release_notice_admin', 'get_release_notice_history']);
  });
  it('publishes editor content atomically with the expected revision and no actor/time override', async () => {
    await releaseNoticeService.update('publish', 4, 'Perbaikan: Payload dana');
    expect(mocks.rpc).toHaveBeenCalledWith('update_release_notice', {
      p_action: 'publish', p_expected_revision: 4, p_content: 'Perbaikan: Payload dana', p_release_id: null,
    });
  });
  it('ties withdrawal to the current release and revision', async () => {
    await releaseNoticeService.update('withdraw', 8, undefined, 'release-id');
    expect(mocks.rpc).toHaveBeenCalledWith('update_release_notice', {
      p_action: 'withdraw', p_expected_revision: 8, p_content: null, p_release_id: 'release-id',
    });
  });
  it.each(['40001', '42501', '22023', 'XX000'])('does not expose database error details for %s', async code => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: 'private database SQL diagnostic' } });
    await expect(releaseNoticeService.update('save', 1, 'Draft')).rejects.not.toThrow(/private|SQL/);
  });
});
