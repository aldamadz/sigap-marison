import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import MonitoringPage from '@/pages/surat/MonitoringPage';

const state = vi.hoisted(() => ({ getPage: vi.fn(), setStarred: vi.fn() }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'viewer' } }) }));
vi.mock('@/hooks/useDocumentOpener', () => ({
  useDocumentOpener: () => ({ isOpening: () => false }),
  documentOperationKey: { pdf: (id: string) => id },
}));
vi.mock('@/services/surat-monitoring.service', () => ({
  suratMonitoringService: {
    getPage: state.getPage, setStarred: state.setStarred,
    getMyStats: async () => ({ total: 1, proses: 1, selesai: 0, ditolak: 0 }),
  },
}));

it('marks a request, opens the server-filtered list, and removes the mark without changing its status', async () => {
  let starred = false;
  state.getPage.mockImplementation(async ({ status }: { status: string }) => {
    const rows = status === 'marked' && !starred ? [] : [{
      id: 'surat-1', no_surat: '001/UAI/XI/2026', judul_surat: 'Pengajuan uji',
      status: 'PROSES', created_at: '2026-11-17T16:00:00Z', can_read_document: false, is_starred: starred,
    }];
    return { rows, count: rows.length, page: 1, pageSize: 24 };
  });
  state.setStarred.mockImplementation(async (_id: string, value: boolean) => { starred = value; });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={client}><MonitoringPage /></QueryClientProvider></MemoryRouter>);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Tandai 001/UAI/XI/2026' }));
  expect(await screen.findByRole('button', { name: 'Hapus tanda 001/UAI/XI/2026' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: 'Ditandai' }));
  await waitFor(() => expect(state.getPage).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'marked', page: 1 })));
  await user.click(await screen.findByRole('button', { name: 'Hapus tanda 001/UAI/XI/2026' }));
  expect(await screen.findByText('Belum ada pengajuan yang ditandai.')).toBeInTheDocument();
  expect(state.setStarred.mock.calls).toEqual([['surat-1', true], ['surat-1', false]]);
  await user.click(screen.getByRole('button', { name: 'Semua' }));
  expect(await screen.findByRole('button', { name: 'Tandai 001/UAI/XI/2026' })).toHaveAttribute('aria-pressed', 'false');
});
