import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReleaseNoticeArchive } from '@/pages/docs/ReleaseNoticeArchive';
import { VersionHistoryPanel } from '@/pages/docs/VersionHistoryPanel';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';

const mocks=vi.hoisted(()=>({history:vi.fn()}));
vi.mock('@/services/release-notice.service',()=>({releaseNoticeService:mocks}));
const release={id:'release-1',publishedAt:'2026-11-12T07:00:00Z',expiresAt:'2026-11-12T17:00:00Z',items:['- Pengajuan lebih rapi','- Pengingat pekerjaan']};
const mount=(userId?:string)=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})}><ReleaseNoticeArchive userId={userId} /></QueryClientProvider>);
beforeEach(()=>{vi.clearAllMocks();mocks.history.mockResolvedValue({releases:[release]});});
afterEach(cleanup);

describe('published notices on the existing documentation changelog',()=>{
  it('does not request private announcements without an authenticated session',()=>{
    mount();expect(screen.getByText(/Masuk ke SIGAP/)).toBeInTheDocument();expect(mocks.history).not.toHaveBeenCalled();
  });
  it('keeps expired or dismissed announcements readable with WIB dates and bullets',async()=>{
    mount('user-a');await screen.findByText('Pengajuan lebih rapi');
    expect(screen.getByText(/12 November 2026/)).toHaveAttribute('dateTime',release.publishedAt);
    expect(screen.getByRole('list')).toHaveClass('list-disc');expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('renders a dated timeline and marks only the first release as latest', async () => {
    mocks.history.mockResolvedValue({releases:[
      {...release, items:['Pembaruan SIGAP', '- Pengajuan lebih rapi']},
      {...release, id:'older', publishedAt:'2026-11-11T01:00:00Z', items:['1. Rilis lama']},
    ]});
    mount('user-a');
    await screen.findByText('Pengajuan lebih rapi');
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getAllByText('Terbaru')).toHaveLength(1);
    expect(screen.getByText('14.00 WIB')).toBeInTheDocument();
    expect(screen.getAllByText('Pembaruan SIGAP')).toHaveLength(1);
    expect(screen.getByText('Rilis lama')).toBeInTheDocument();
  });
  it('shows an empty state without stale or invented releases',async()=>{
    mocks.history.mockResolvedValue({releases:[]});mount('user-a');
    expect(await screen.findByText('Belum ada pengumuman pembaruan.')).toBeInTheDocument();
  });
  it('offers retry instead of displaying internal errors',async()=>{
    mocks.history.mockRejectedValue(Error('private SQL'));mount('user-a');
    await screen.findByRole('alert',{}, {timeout:3000});expect(screen.queryByText('private SQL')).toBeNull();
    mocks.history.mockResolvedValue({releases:[release]});fireEvent.click(screen.getByRole('button',{name:'Coba lagi'}));
    expect(await screen.findByText('Pengajuan lebih rapi')).toBeInTheDocument();
  });
  it('never shows a previous account cache after logout',async()=>{
    const view=mount('user-a');await screen.findByText('Pengajuan lebih rapi');view.unmount();
    mount();await waitFor(()=>expect(screen.queryByText('Pengajuan lebih rapi')).toBeNull());
  });
});

describe('version tabs', () => {
  const mountTabs = (path: string, userId?: string) => render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>
        <VersionHistoryPanel userId={userId} />
      </QueryClientProvider>
    </MemoryRouter>,
  );

  it('keeps the existing changelog link on release announcements and separates guides', async () => {
    mountTabs('/docs/versi/changelog', 'user-a');
    await screen.findByText('Pengajuan lebih rapi');
    expect(screen.getByRole('tab', {name:'Pembaruan aplikasi'})).toHaveAttribute('aria-selected','true');
    await userEvent.click(screen.getByRole('tab', {name:'Riwayat dokumentasi'}));
    expect(screen.getByRole('link', {name:'Kalender Kerja'})).toHaveAttribute('href','/docs/kalender/overview');
    expect(screen.queryByText('Pengajuan lebih rapi')).toBeNull();
  });

  it('opens a documentation deep link without requesting private notices', () => {
    mountTabs('/docs/versi/changelog?tab=dokumentasi');
    expect(screen.getByRole('tab', {name:'Riwayat dokumentasi'})).toHaveAttribute('aria-selected','true');
    expect(screen.getByRole('link', {name:'Pembaruan dan Maintenance'})).toBeInTheDocument();
    expect(mocks.history).not.toHaveBeenCalled();
  });
});
