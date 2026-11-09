import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserNotificationButton } from '@/components/settings/BrowserNotificationButton';

const h = vi.hoisted(() => ({ status: vi.fn(), activate: vi.fn() }));
vi.mock('@/services/push.service', () => ({ pushService: { getSubscriptionStatus: h.status, ensureSubscription: h.activate } }));
beforeEach(() => { h.status.mockReset().mockResolvedValue({ enabled: false, reason: 'not_subscribed' }); h.activate.mockReset().mockResolvedValue({ enabled: true }); });
afterEach(cleanup);

describe('browser activation rehydration', () => {
  it('synchronizes all controls with background activation and ignores older initial checks', async () => {
    let resolve!: (value: unknown) => void;
    h.status.mockReturnValue(new Promise(done => { resolve = done; }));
    render(<><BrowserNotificationButton /><BrowserNotificationButton /></>);
    act(() => { window.dispatchEvent(new CustomEvent('sigap:push-activation', { detail: { enabled: true } })); });
    expect(screen.getAllByRole('button', { name: 'Notifikasi browser aktif' })).toHaveLength(2);
    await act(async () => { resolve({ enabled: false, reason: 'not_subscribed' }); });
    expect(screen.getAllByRole('button', { name: 'Notifikasi browser aktif' })).toHaveLength(2);
    expect(h.activate).not.toHaveBeenCalled();
  });
  it('restores actual activation on mount and remount without a permission prompt', async () => {
    h.status.mockResolvedValue({ enabled: true });
    const first = render(<BrowserNotificationButton />);
    expect(await screen.findByRole('button', { name: 'Notifikasi browser aktif' })).toBeDisabled();
    first.unmount(); render(<BrowserNotificationButton />);
    expect(await screen.findByRole('button', { name: 'Notifikasi browser aktif' })).toBeDisabled();
    expect(h.status).toHaveBeenCalledTimes(2); expect(h.activate).not.toHaveBeenCalled();
  });
  it('activates explicitly and detects revoked permission when returning to the tab', async () => {
    render(<BrowserNotificationButton />);
    fireEvent.click(await screen.findByRole('button', { name: 'Aktifkan notifikasi browser' }));
    expect(await screen.findByRole('button', { name: 'Notifikasi browser aktif' })).toBeDisabled();
    expect(h.activate).toHaveBeenCalledExactlyOnceWith({ requestPermission: true });
    h.status.mockResolvedValue({ enabled: false, reason: 'permission_denied' });
    fireEvent.focus(window);
    expect(await screen.findByRole('status')).toHaveTextContent('Notifikasi diblokir di browser.');
    expect(screen.getByRole('button', { name: 'Aktifkan notifikasi browser' })).toBeEnabled();
  });
  it('ignores a stale background status check after successful manual activation', async () => {
    let resolve!: (value: unknown) => void;
    render(<BrowserNotificationButton />);
    const button = await screen.findByRole('button', { name: 'Aktifkan notifikasi browser' });
    h.status.mockReturnValue(new Promise(done => { resolve = done; }));
    fireEvent.focus(window); fireEvent.click(button);
    expect(await screen.findByRole('button', { name: 'Notifikasi browser aktif' })).toBeDisabled();
    await act(async () => { resolve({ enabled: false, reason: 'not_subscribed' }); });
    expect(screen.getByRole('button', { name: 'Notifikasi browser aktif' })).toBeDisabled();
  });
  it('does not claim activation when status cannot be verified', async () => {
    h.status.mockRejectedValue(new Error('private details'));
    render(<BrowserNotificationButton />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Status notifikasi browser belum dapat diperiksa.'));
    expect(screen.getByRole('status')).not.toHaveTextContent('private'); expect(h.activate).not.toHaveBeenCalled();
  });
});
