import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pushService } from '@/services/push.service';

const h = vi.hoisted(() => ({ key: vi.fn(), save: vi.fn() }));
vi.mock('@/services/attention.service', () => ({
  attentionService: { getPushPublicKey: h.key, savePushSubscription: h.save },
}));

const subscribe = vi.fn();
const getSubscription = vi.fn();
const register = vi.fn();
const requestPermission = vi.fn();
const activeRegistration = { pushManager: { subscribe, getSubscription } };

beforeEach(() => {
  vi.clearAllMocks();
  h.key.mockResolvedValue({ enabled: true, publicKey: 'BA' });
  h.save.mockResolvedValue({ ok: true });
  register.mockResolvedValue({ active: null, pushManager: {
    getSubscription: vi.fn().mockRejectedValue(new DOMException('No active worker', 'InvalidStateError')),
  } });
  getSubscription.mockResolvedValue(null);
  subscribe.mockResolvedValue({ endpoint: 'https://push.example.invalid/test' });
  requestPermission.mockResolvedValue('granted');
  vi.stubGlobal('PushManager', function PushManager() {});
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission });
  vi.stubGlobal('navigator', {
    serviceWorker: { register, ready: Promise.resolve(activeRegistration) },
  });
});

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('first browser push activation', () => {
  it('waits for an active worker before requesting or saving a subscription', async () => {
    let activate!: (value: typeof activeRegistration) => void;
    Object.defineProperty(navigator.serviceWorker, 'ready', {
      value: new Promise((resolve) => { activate = resolve; }), configurable: true,
    });
    const pending = pushService.ensureSubscription({ requestPermission: true });
    await vi.waitFor(() => expect(register).toHaveBeenCalled());
    expect(subscribe).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
    activate(activeRegistration);
    await expect(pending).resolves.toEqual({ enabled: true });
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(h.save).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing active subscription without requesting permission again', async () => {
    const existing = { endpoint: 'https://push.example.invalid/existing' };
    getSubscription.mockResolvedValue(existing);
    await expect(pushService.ensureSubscription()).resolves.toEqual({ enabled: true });
    expect(subscribe).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(h.save).toHaveBeenCalledWith(existing);
  });

  it('bounds an unavailable worker without subscribing or saving', async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator.serviceWorker, 'ready', {
      value: new Promise(() => {}), configurable: true,
    });
    const pending = pushService.ensureSubscription({ requestPermission: true });
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(pending).resolves.toEqual({ enabled: false, reason: 'worker_not_ready' });
    expect(subscribe).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports push provider failure without exposing its raw message', async () => {
    subscribe.mockRejectedValue(new DOMException('private provider details', 'AbortError'));
    await expect(pushService.ensureSubscription({ requestPermission: true })).resolves.toEqual({
      enabled: false, reason: 'provider_unavailable',
    });
    expect(h.save).not.toHaveBeenCalled();
  });

  it('does not activate workers or access server keys without permission', async () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    await expect(pushService.ensureSubscription()).resolves.toEqual({
      enabled: false, reason: 'permission_not_granted',
    });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(h.key).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });
});
