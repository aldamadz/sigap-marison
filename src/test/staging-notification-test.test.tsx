import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StagingNotificationTest } from '@/components/settings/StagingNotificationTest';

const h = vi.hoisted(() => ({ send: vi.fn(), popup: vi.fn() }));
vi.mock('@/services/notification.service', () => ({ notificationService: { createNotification: h.send } }));
vi.mock('@/services/push.service', () => ({ pushService: { testPopup: h.popup } }));
beforeEach(() => {
  vi.stubEnv('VITE_APP_PUBLIC_URL', 'https://sigap.marison-testing.biz.id');
  h.send.mockReset().mockResolvedValue({ inserted: 1, push: { queued: 1 } });
  h.popup.mockReset().mockResolvedValue({ requested: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('staging self notification test', () => {
  it('tests the actual device popup only after a click, without creating an in-app notice', async () => {
    render(<StagingNotificationTest userId="self" />);
    expect(h.popup).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tes popup browser' })); });
    expect(h.popup).toHaveBeenCalledTimes(1); expect(h.send).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Popup tes dikirim ke browser perangkat ini.');
    expect(screen.getByRole('button', { name: /Tes lagi dalam/ })).toBeDisabled();
  });
  it('does not claim a popup or start cooldown when permission is denied', async () => {
    h.popup.mockResolvedValue({ requested: false, reason: 'permission_not_granted' });
    render(<StagingNotificationTest userId="self" />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tes popup browser' })); });
    expect(screen.getByRole('status')).toHaveTextContent('Izin popup belum diberikan.');
    expect(screen.getByRole('button', { name: 'Tes popup browser' })).toBeEnabled();
    expect(h.send).not.toHaveBeenCalled();
  });
  it.each(['https://sigap.marisoncloud.com', '', 'https://sigap.marison-testing.biz.id.attacker.test'])('is absent outside staging (%s)', url => {
    vi.stubEnv('VITE_APP_PUBLIC_URL', url);
    render(<StagingNotificationTest userId="self" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.popup).not.toHaveBeenCalled();
  });
  it('does not send automatically, targets only the current account, and uses an approved destination', async () => {
    render(<StagingNotificationTest userId="self" />);
    expect(h.send).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tes pengiriman SIGAP' })); });
    expect(h.send).toHaveBeenCalledExactlyOnceWith('self', 'Tes notifikasi SIGAP',
      'Ini adalah notifikasi pengujian staging untuk akun Anda.', 'info', '/dashboard');
    expect(screen.getByRole('status')).toHaveTextContent('Notifikasi tes dibuat untuk akun Anda.');
    expect(screen.getByRole('status')).not.toHaveTextContent(/popup terkirim|popup ditampilkan/i);
    expect(screen.getByRole('button', {name:/Tes lagi dalam/})).toBeDisabled();
    expect(h.popup).not.toHaveBeenCalled();
  });
  it('blocks overlapping clicks and enables another test after the cooldown', async () => {
    vi.useFakeTimers();
    let resolve!: (value: unknown) => void;
    h.send.mockReturnValue(new Promise(value => { resolve = value; }));
    render(<StagingNotificationTest userId="self" />);
    const button = screen.getByRole('button', {name:'Tes pengiriman SIGAP'});
    fireEvent.click(button); fireEvent.click(button);
    expect(h.send).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ inserted: 1 }); });
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent('Tes pengiriman SIGAP');
  });
  it.each([new Error('private endpoint and credential'), null])('reports a failed creation without leaking details or claiming delivery', async result => {
    if (result) h.send.mockRejectedValue(result); else h.send.mockResolvedValue({ inserted: 0 });
    render(<StagingNotificationTest userId="self" />);
    await act(async () => { fireEvent.click(screen.getByRole('button', {name:'Tes pengiriman SIGAP'})); });
    expect(screen.getByRole('status')).toHaveTextContent('Notifikasi tes belum dapat dikirim. Coba lagi.');
    expect(screen.getByRole('status')).not.toHaveTextContent(/private|credential/);
    expect(screen.getByRole('button', {name:'Tes pengiriman SIGAP'})).toBeEnabled();
  });
  it('keeps a missing identity inert', () => {
    render(<StagingNotificationTest userId="" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(h.send).not.toHaveBeenCalled();
  });
});
