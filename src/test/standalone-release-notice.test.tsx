import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WhatsNewConfigurationPage from '@/pages/admin/WhatsNewConfigurationPage';
import { ReleaseNoticeController } from '@/components/app/ReleaseNoticeController';
import type { ReleaseNoticeAdmin } from '@/services/release-notice.service';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), current: vi.fn(), update: vi.fn(), preference: vi.fn(), dismiss: vi.fn() }));
vi.mock('@/services/release-notice.service', () => ({ releaseNoticeService: mocks }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.preference }) }) }), rpc: mocks.dismiss } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
const now = new Date().toISOString();
const release = { id: '00000000-0000-4000-8000-000000000001', publishedAt: now, expiresAt: new Date(Date.now() + 3600000).toISOString(), items: ['Perbaikan: Penulisan data dana'] };
const state: ReleaseNoticeAdmin = { revision: 2, draftContent: 'Draft lama', release: null, updatedAt: now, serverNow: now, history: [] };
const mount = (child: React.ReactNode, path = '/dashboard') => render(<MemoryRouter initialEntries={[path]}><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>{child}</QueryClientProvider></MemoryRouter>);
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); mocks.admin.mockResolvedValue(structuredClone(state));
  mocks.current.mockResolvedValue({ serverNow: now, release }); mocks.preference.mockResolvedValue({ data: null, error: null });
  mocks.update.mockResolvedValue({ ...state, revision: 3 });
});
afterEach(cleanup);
describe('standalone announcement configuration', () => {
  it('loads saved draft and persists draft without publishing', async () => {
    mount(<WhatsNewConfigurationPage />); const input = await screen.findByLabelText('Isi pembaruan');
    expect(input).toHaveValue('Draft lama'); fireEvent.change(input, { target: { value: 'Perbaikan: Draft baru' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan draft' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('save', 2, 'Perbaikan: Draft baru', undefined));
  });
  it('preview is safe text and does not save or publish', async () => {
    mount(<WhatsNewConfigurationPage />); fireEvent.change(await screen.findByLabelText('Isi pembaruan'), { target: { value: '<img src=x onerror=alert(1)>\nPerbaikan: Dana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pratinjau' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('<img src=x onerror=alert(1)>');
    expect(document.querySelector('img')).toBeNull(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it('publish includes unsaved editor changes and requires confirmation; duplicate clicks send once', async () => {
    let finish!: (value: ReleaseNoticeAdmin) => void;
    mocks.update.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    mount(<WhatsNewConfigurationPage />); fireEvent.change(await screen.findByLabelText('Isi pembaruan'), { target: { value: 'Perbaikan: Isi belum disimpan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Terbitkan' })); expect(mocks.update).not.toHaveBeenCalled();
    const button = screen.getByRole('button', { name: 'Ya, terbitkan' }); fireEvent.click(button); fireEvent.click(button);
    expect(mocks.update).toHaveBeenCalledOnce(); expect(mocks.update).toHaveBeenCalledWith('publish', 2, 'Perbaikan: Isi belum disimpan', undefined);
    finish({ ...state, revision: 3, release, draftContent: 'Perbaikan: Isi belum disimpan' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('withdrawal requires confirmation and the exact current release', async () => {
    mocks.admin.mockResolvedValue({ ...state, release }); mount(<WhatsNewConfigurationPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tarik pengumuman' }));
    expect(mocks.update).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Ya, tarik' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('withdraw', 2, undefined, release.id));
  });
  it('keeps edited content on conflicts and allows explicit reload', async () => {
    mocks.update.mockRejectedValue(Error('Pengumuman telah diubah admin lain. Muat ulang dahulu.'));
    mount(<WhatsNewConfigurationPage />); const input = await screen.findByLabelText('Isi pembaruan');
    fireEvent.change(input, { target: { value: 'Perbaikan: Perubahan saya' } }); fireEvent.click(screen.getByRole('button', { name: 'Simpan draft' }));
    await screen.findByRole('alert'); expect(input).toHaveValue('Perbaikan: Perubahan saya');
    mocks.admin.mockResolvedValue({ ...state, revision: 5, draftContent: 'Draft admin lain' });
    fireEvent.click(screen.getByRole('button', { name: 'Muat ulang' })); await waitFor(() => expect(input).toHaveValue('Draft admin lain'));
  });
  it('withdraws an active publication without discarding unsaved draft edits', async () => {
    mocks.admin.mockResolvedValue({ ...state, release }); mount(<WhatsNewConfigurationPage />);
    const input = await screen.findByLabelText('Isi pembaruan'); fireEvent.change(input, { target: { value: 'Draft baru belum disimpan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tarik pengumuman' })); fireEvent.click(screen.getByRole('button', { name: 'Ya, tarik' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(input).toHaveValue('Draft baru belum disimpan'); expect(screen.getByText('Perubahan belum disimpan')).toBeInTheDocument();
  });
  it('blocks publication with excessive line count', async () => {
    mount(<WhatsNewConfigurationPage />); fireEvent.change(await screen.findByLabelText('Isi pembaruan'), { target: { value: Array(11).fill('Item').join('\n') } });
    expect(screen.getByRole('button', { name: 'Terbitkan' })).toBeDisabled();
  });
});
describe('independent announcement popup', () => {
  it('opens from an announcement without any maintenance status or completed event', async () => {
    mount(<ReleaseNoticeController userId="user-a" />);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Perbaikan: Penulisan data dana');
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('does not open on the editor or administrator recovery pages', async () => {
    for (const path of ['/admin/configuration/whats-new', '/admin/configuration/maintenance', '/maintenance-admin']) {
      const view = mount(<ReleaseNoticeController userId="user-a" />, path);
      await waitFor(() => expect(mocks.current).toHaveBeenCalled()); expect(screen.queryByRole('dialog')).toBeNull(); view.unmount();
    }
  });
  it('does not show drafts or withdrawn announcements', async () => {
    mocks.current.mockResolvedValue({ serverNow: now, release: null }); mount(<ReleaseNoticeController userId="user-a" />);
    await waitFor(() => expect(mocks.current).toHaveBeenCalled()); expect(screen.queryByRole('dialog')).toBeNull();
  });
});
