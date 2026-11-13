import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AttentionRequestError, attentionService } from '@/services/attention.service';
import { BrowserNotificationButton } from '@/components/settings/BrowserNotificationButton';

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'fixture-session' } } })) } },
}));
const fetchMock = vi.fn();
const subscription = { options: { applicationServerKey: new Uint8Array([4]).buffer }, toJSON: () => ({ endpoint: 'https://push.example.invalid/fixture', keys: { auth: 'fixture-auth', p256dh: 'fixture-key' } }) } as unknown as PushSubscription;

beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('sanitized push HTTP diagnostics', () => {
  it.each(['push_provider_unsupported','push_keys_missing'])('preserves only recognized push diagnosis %s',async(code)=>{
    fetchMock.mockResolvedValue(new Response(JSON.stringify({code,error:'private endpoint'}),{status:400}));
    await expect(attentionService.savePushSubscription(subscription)).rejects.toMatchObject({code,httpStatus:400});
    expect(new AttentionRequestError(400,'valid_id-123','https://private.invalid/key').code).toBeUndefined();
  });
  it.each([400, 401, 403, 500])('keeps HTTP %s and a validated response-header request ID only', async (status) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'private endpoint and key', requestId: 'body_req-1234', subscription }), {
      status, headers: { 'X-Request-Id': 'header_req-1234' },
    }));
    const error = await attentionService.savePushSubscription(subscription).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(AttentionRequestError);
    expect(error).toMatchObject({ name: 'HttpError', message: 'Request gagal diproses.', httpStatus: status, requestId: 'header_req-1234' });
    expect(JSON.stringify(error)).not.toMatch(/private|endpoint|fixture-key|fixture-auth|body_req/);
    expect(String(error)).not.toContain('private');
    expect(fetchMock).toHaveBeenCalledWith('/api/push/subscribe', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ subscription }),
    }));
  });

  it('falls back to a valid body request ID when the header is invalid', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ requestId: 'body_req-1234', error: 'private response' }), {
      status: 400, headers: { 'X-Request-Id': 'https://private.invalid/key' },
    }));
    await expect(attentionService.savePushSubscription(subscription)).rejects.toMatchObject({
      httpStatus: 400, requestId: 'body_req-1234',
    });
  });

  it.each(['short', 'a'.repeat(81), 'https://private.invalid/key', 'line\nbreak', 'safe_req-1234\n', 'safe_req-1234\r',
    'safe_req-1234\u2028', '<script>private</script>', 12345678, null])(
    'omits invalid body request IDs: %s', async (requestId) => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ requestId, error: 'private response' }), { status: 403 }));
      await expect(attentionService.savePushSubscription(subscription)).rejects.toMatchObject({ httpStatus: 403, requestId: undefined });
    },
  );

  it('keeps status and safe header ID for a non-JSON server rejection', async () => {
    fetchMock.mockResolvedValue(new Response('<html>private upstream details</html>', {
      status: 500, headers: { 'X-Request-Id': 'header_req-1234' },
    }));
    await expect(attentionService.savePushSubscription(subscription)).rejects.toMatchObject({
      message: 'Request gagal diproses.', httpStatus: 500, requestId: 'header_req-1234',
    });
  });

  it.each(['a'.repeat(8), 'a'.repeat(80)])('accepts a request ID at the length boundary', async (requestId) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ requestId }), { status: 400 }));
    await expect(attentionService.savePushSubscription(subscription)).rejects.toMatchObject({ requestId });
  });

  it.each([0, 200, 399, 600, 400.5, Number.NaN])('does not retain invalid rejection status %s', (status) => {
    expect(new AttentionRequestError(status, 'safe_req-1234').httpStatus).toBeUndefined();
  });

  it('does not attach arbitrary network error properties as HTTP metadata', async () => {
    fetchMock.mockRejectedValue(new TypeError('private network details'));
    await expect(attentionService.savePushSubscription(subscription)).rejects.toBeInstanceOf(TypeError);
  });

  it('keeps successful public-key and subscription responses unchanged', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ enabled: true, publicKey: 'fixture-public' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    await expect(attentionService.getPushPublicKey()).resolves.toEqual({ enabled: true, publicKey: 'fixture-public' });
    await expect(attentionService.savePushSubscription(subscription)).resolves.toEqual({ ok: true });
  });

  it.each([400, 401, 403, 500])('renders sanitized persistence HTTP %s through the actual activation flow', async (httpStatus) => {
    const registration = { pushManager: { getSubscription: vi.fn(async () => subscription), subscribe: vi.fn() } };
    vi.stubGlobal('PushManager', function PushManager() {});
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() });
    vi.stubGlobal('navigator', { serviceWorker: {
      getRegistration: vi.fn(async () => undefined), register: vi.fn(async () => registration), ready: Promise.resolve(registration),
    } });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ enabled: true, publicKey: 'BA' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: 'https://private.invalid/endpoint?key=private', requestId: 'push_req-1234',
        keys: { auth: 'fixture-auth', p256dh: 'fixture-key' },
      }), { status: httpStatus }));
    render(createElement(BrowserNotificationButton));
    fireEvent.click(await screen.findByRole('button', { name: 'Aktifkan notifikasi browser' }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(`Tahap: persist; kode: HttpError; HTTP: ${httpStatus}; ID: push_req-1234.`);
    expect(status).not.toHaveTextContent(/private|endpoint|fixture-auth|fixture-key/);
    expect(screen.queryByText('Notifikasi browser aktif')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aktifkan notifikasi browser' })).toBeEnabled();
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retires an obsolete endpoint through the existing authenticated owner-scoped route',async()=>{
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ok:true})));
    await expect(attentionService.removePushSubscription('https://fcm.googleapis.com/old')).resolves.toEqual({ok:true});
    expect(fetchMock).toHaveBeenCalledWith('/api/push/unsubscribe',expect.objectContaining({method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer fixture-session'},
      body:JSON.stringify({endpoint:'https://fcm.googleapis.com/old'})}));
  });
});
