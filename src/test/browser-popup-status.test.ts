import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pushService } from '@/services/push.service';
import { AttentionRequestError } from '@/services/attention.service';

const h = vi.hoisted(() => ({ key: vi.fn(), save: vi.fn() }));
vi.mock('@/services/attention.service', async original => ({
  ...await original<typeof import('@/services/attention.service')>(),
  attentionService: { getPushPublicKey: h.key, savePushSubscription: h.save },
}));
const getSubscription = vi.fn(), subscribe = vi.fn(), getRegistration = vi.fn(), register = vi.fn();
const requestPermission = vi.fn(), showNotification = vi.fn();
const registration = { active: {}, pushManager: { getSubscription, subscribe }, showNotification };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_APP_PUBLIC_URL', 'https://sigap.marison-testing.biz.id');
  h.key.mockResolvedValue({ enabled: true, publicKey: 'BA' }); h.save.mockResolvedValue({ ok: true });
  getRegistration.mockResolvedValue(registration); getSubscription.mockResolvedValue({ endpoint: 'fixture' });
  register.mockResolvedValue(registration); requestPermission.mockResolvedValue('granted'); showNotification.mockResolvedValue(undefined);
  vi.stubGlobal('PushManager', function PushManager() {});
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission });
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration, register, ready: Promise.resolve(registration) } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('persisted browser activation status', () => {
  it('checks the existing subscription and server registration without prompting or subscribing', async () => {
    await expect(pushService.getSubscriptionStatus()).resolves.toEqual({ enabled: true });
    expect(h.save).toHaveBeenCalledExactlyOnceWith({ endpoint: 'fixture' });
    expect(requestPermission).not.toHaveBeenCalled(); expect(register).not.toHaveBeenCalled(); expect(subscribe).not.toHaveBeenCalled();
  });
  it.each([undefined, { active: null }])('does not activate a missing worker', async worker => {
    getRegistration.mockResolvedValue(worker);
    await expect(pushService.getSubscriptionStatus()).resolves.toEqual({ enabled: false, reason: 'not_subscribed' });
    expect(register).not.toHaveBeenCalled(); expect(subscribe).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled();
  });
  it('does not report browser permission alone as an active subscription', async () => {
    getSubscription.mockResolvedValue(null);
    await expect(pushService.getSubscriptionStatus()).resolves.toEqual({ enabled: false, reason: 'not_subscribed' });
    expect(h.key).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled();
  });
  it.each([['default', 'permission_not_granted'], ['denied', 'permission_denied']])('reads %s permission without prompting', async (permission, reason) => {
    vi.stubGlobal('Notification', { permission, requestPermission });
    await expect(pushService.getSubscriptionStatus()).resolves.toEqual({ enabled: false, reason });
    expect(requestPermission).not.toHaveBeenCalled(); expect(getRegistration).not.toHaveBeenCalled();
  });
  it('does not claim activation when the existing provider is rejected by the server', async () => {
    h.save.mockRejectedValue(new AttentionRequestError(400, 'safe_req-1234', 'push_provider_unsupported'));
    await expect(pushService.getSubscriptionStatus()).resolves.toMatchObject({ enabled: false, details: {
      stage: 'persist', httpStatus: 400, serverCode: 'push_provider_unsupported',
    } });
    expect(subscribe).not.toHaveBeenCalled();
  });
});

describe('explicit staging device popup', () => {
  it('uses the notification API, independently of remote push provider registration', async () => {
    vi.stubGlobal('PushManager', undefined);
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    await expect(pushService.testPopup()).resolves.toEqual({ requested: true });
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledExactlyOnceWith('Tes popup SIGAP', expect.objectContaining({
      tag: 'sigap-staging-popup-test', renotify: true, data: { link: '/dashboard' },
    }));
    expect(h.key).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled(); expect(subscribe).not.toHaveBeenCalled();
  });
  it('does not re-prompt or display when permission is blocked', async () => {
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission });
    await expect(pushService.testPopup()).resolves.toEqual({ requested: false, reason: 'permission_not_granted' });
    expect(requestPermission).not.toHaveBeenCalled(); expect(register).not.toHaveBeenCalled(); expect(showNotification).not.toHaveBeenCalled();
  });
  it('bounds worker readiness and does not claim a displayed popup', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { serviceWorker: { register, ready: new Promise(() => {}) } });
    const result = pushService.testPopup();
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(result).resolves.toEqual({ requested: false, reason: 'worker_not_ready' });
    expect(showNotification).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps a display rejection generic', async () => {
    showNotification.mockRejectedValue(new Error('private endpoint and key'));
    await expect(pushService.testPopup()).resolves.toEqual({ requested: false, reason: 'popup_failed' });
  });
  it('cannot run outside the staging build', async () => {
    vi.stubEnv('VITE_APP_PUBLIC_URL', 'https://sigap.marisoncloud.com');
    await expect(pushService.testPopup()).resolves.toEqual({ requested: false, reason: 'staging_only' });
    expect(requestPermission).not.toHaveBeenCalled(); expect(register).not.toHaveBeenCalled(); expect(showNotification).not.toHaveBeenCalled();
  });
});
