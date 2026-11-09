import { afterEach, expect, it, vi } from 'vitest';
import { notificationService } from '@/services/notification.service';

vi.mock('@/lib/supabase', () => ({ supabase: { auth: {
  getSession: vi.fn(async () => ({ data: { session: { access_token: 'synthetic-session' } } })),
} } }));
afterEach(() => vi.unstubAllGlobals());

it('uses the existing authenticated route without email, custom recipients or an unsafe destination', async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ inserted: 1 }), { status: 200 }));
  vi.stubGlobal('fetch', fetcher);
  await notificationService.createNotification('own-user', 'Tes notifikasi SIGAP', 'Synthetic staging message', 'info', '/dashboard');
  expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/notifications/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-session' },
    body: JSON.stringify({ user_ids: ['own-user'], title: 'Tes notifikasi SIGAP',
      message: 'Synthetic staging message', type: 'info', link: '/dashboard', email: false }),
  });
});
