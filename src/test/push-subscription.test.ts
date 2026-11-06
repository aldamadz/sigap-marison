import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pushService } from '@/services/push.service';
import { AttentionRequestError } from '@/services/attention.service';

const h = vi.hoisted(() => ({ key: vi.fn(), save: vi.fn() }));
vi.mock('@/services/attention.service', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/attention.service')>(),
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
    await expect(pending).resolves.toEqual({ enabled: false, reason: 'worker_not_ready',
      details: { stage: 'ready', code: 'TimeoutError' } });
    expect(subscribe).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports push provider failure without exposing its raw message', async () => {
    subscribe.mockRejectedValue(new DOMException('private provider details', 'AbortError'));
    await expect(pushService.ensureSubscription({ requestPermission: true })).resolves.toEqual({
      enabled: false, reason: 'provider_unavailable',
      details: { stage: 'subscribe', code: 'AbortError' },
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

  it('identifies registration failure without looking up or persisting a subscription', async () => {
    register.mockRejectedValue(new TypeError('private worker URL and key'));
    await expect(pushService.ensureSubscription()).resolves.toEqual({
      enabled: false, reason: 'activation_failed', details: { stage: 'register', code: 'TypeError' },
    });
    expect(getSubscription).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
  });

  it('identifies a rejected readiness promise and clears the timeout', async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator.serviceWorker, 'ready', {
      get: () => Promise.reject(new DOMException('private worker details', 'SecurityError')), configurable: true,
    });
    await expect(pushService.ensureSubscription()).resolves.toEqual({
      enabled: false, reason: 'activation_failed', details: { stage: 'ready', code: 'SecurityError' },
    });
    expect(getSubscription).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['InvalidStateError', 'AbortError'])('identifies lookup %s without attempting a new subscription', async (name) => {
    getSubscription.mockRejectedValue(new DOMException('private subscription details', name));
    await expect(pushService.ensureSubscription()).resolves.toEqual({
      enabled: false, reason: 'activation_failed', details: { stage: 'lookup', code: name },
    });
    expect(subscribe).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
  });

  it.each(['NotAllowedError', 'InvalidStateError'])('identifies subscribe %s without reporting activation success', async (name) => {
    subscribe.mockRejectedValue(new DOMException('private provider endpoint and key', name));
    await expect(pushService.ensureSubscription()).resolves.toEqual({
      enabled: false, reason: 'activation_failed', details: { stage: 'subscribe', code: name },
    });
    expect(h.save).not.toHaveBeenCalled();
  });

  it('recognizes a wrapped AbortError without relying on DOMException realm identity', async () => {
    subscribe.mockRejectedValue({ name: 'AbortError', message: 'private provider details' });
    await expect(pushService.ensureSubscription()).resolves.toEqual({
      enabled: false, reason: 'provider_unavailable', details: { stage: 'subscribe', code: 'AbortError' },
    });
    expect(h.save).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 500])('preserves safe metadata for persistence HTTP %s', async (httpStatus) => {
    h.save.mockRejectedValue(new AttentionRequestError(httpStatus, 'push_req-1234'));
    await expect(pushService.ensureSubscription()).resolves.toEqual({
      enabled: false, reason: 'activation_failed',
      details: { stage: 'persist', code: 'HttpError', httpStatus, requestId: 'push_req-1234' },
    });
    expect(h.save).toHaveBeenCalledTimes(1);
  });

  it('keeps an existing subscription retryable when persistence fails', async () => {
    getSubscription.mockResolvedValue({ endpoint: 'https://push.example.invalid/existing' });
    h.save.mockRejectedValueOnce(new AttentionRequestError(500, 'push_req-1234'));
    expect(await pushService.ensureSubscription()).toMatchObject({ enabled: false, details: { stage: 'persist' } });
    await expect(pushService.ensureSubscription()).resolves.toEqual({ enabled: true });
    expect(subscribe).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'private-endpoint-key', message: 'private body', httpStatus: 400, requestId: 'private' },
    'private string rejection', null,
    { get name() { throw new Error('private accessor'); } },
  ])('drops unknown error names and arbitrary metadata', async (error) => {
    h.save.mockRejectedValue(error);
    await expect(pushService.ensureSubscription()).resolves.toEqual({
      enabled: false, reason: 'activation_failed', details: { stage: 'persist', code: 'UnknownError' },
    });
  });

  it('identifies public-key HTTP rejection before registration', async () => {
    h.key.mockRejectedValue(new AttentionRequestError(401, 'push_req-1234'));
    await expect(pushService.ensureSubscription()).resolves.toEqual({
      enabled: false, reason: 'activation_failed',
      details: { stage: 'public_key', code: 'HttpError', httpStatus: 401, requestId: 'push_req-1234' },
    });
    expect(register).not.toHaveBeenCalled();
  });

  it('identifies permission request rejection without reading the server key', async () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    requestPermission.mockRejectedValue(new DOMException('private permission details', 'NotAllowedError'));
    await expect(pushService.ensureSubscription({ requestPermission: true })).resolves.toEqual({
      enabled: false, reason: 'activation_failed', details: { stage: 'permission', code: 'NotAllowedError' },
    });
    expect(h.key).not.toHaveBeenCalled();
  });

  it('preserves unsupported and server-not-configured outcomes', async () => {
    h.key.mockResolvedValue({ enabled: false, publicKey: null });
    await expect(pushService.ensureSubscription()).resolves.toEqual({ enabled: false, reason: 'server_not_configured' });
    vi.stubGlobal('navigator', {});
    await expect(pushService.ensureSubscription()).resolves.toEqual({ enabled: false, reason: 'unsupported' });
    expect(register).not.toHaveBeenCalled();
  });

  it('does not log activation exceptions or subscription details', async () => {
    const spies = ['log', 'warn', 'error'].map((method) => vi.spyOn(console, method as 'log' | 'warn' | 'error').mockImplementation(() => {}));
    try {
      h.save.mockRejectedValue(new Error('private provider endpoint and key'));
      await expect(pushService.ensureSubscription()).resolves.toEqual({
        enabled: false, reason: 'activation_failed', details: { stage: 'persist', code: 'Error' },
      });
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
