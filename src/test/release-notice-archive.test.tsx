import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReleaseNoticeArchive } from '@/pages/docs/ReleaseNoticeArchive';
import { VersionHistoryPanel } from '@/pages/docs/VersionHistoryPanel';
import { MemoryRouter, useLocation } from 'react-router';
import userEvent from '@testing-library/user-event';
import { APP_RELEASES } from '@/lib/app-releases';

const mocks=vi.hoisted(()=>({history:vi.fn()}));
vi.mock('@/services/release-notice.service',()=>({releaseNoticeService:mocks}));
const release={id:'release-1',publishedAt:'2026-11-12T07:00:00Z',expiresAt:'2026-11-12T17:00:00Z',items:['- Pengajuan lebih rapi','- Pengingat pekerjaan']};
const appVersion = () => screen.getByRole('button', {name:/^Versi v1\.10\.0/});
const previousAnnouncementId = APP_RELEASES.find(item => item.version === 'v1.10.0')!.announcementId;
const LocationSearch = () => <output aria-label="Alamat pencarian">{useLocation().search}</output>;
const mount = (userId?: string, search = '') => render(
  <MemoryRouter initialEntries={[`/docs/versi/changelog${search}`]}>
    <QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>
      <ReleaseNoticeArchive userId={userId} />
      <LocationSearch />
    </QueryClientProvider>
  </MemoryRouter>,
);
beforeEach(()=>{vi.clearAllMocks();mocks.history.mockResolvedValue({releases:[release]});});
afterEach(cleanup);

describe('published notices on the existing documentation changelog',()=>{
  it('does not request private announcements without an authenticated session',()=>{
    mount();expect(screen.getByText(/Masuk ke SIGAP/)).toBeInTheDocument();expect(mocks.history).not.toHaveBeenCalled();
    expect(appVersion()).toHaveAttribute('aria-expanded', 'false');
  });
  it('keeps expired or dismissed announcements readable with WIB dates and bullets',async()=>{
    mount('user-a');
    const notice = await screen.findByRole('button', {name:/12 November 2026/});
    expect(within(notice).getByText('12 November 2026')).toHaveAttribute('dateTime',release.publishedAt);
    expect(screen.queryByText('Pengajuan lebih rapi')).toBeNull();
    notice.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByText('Pengajuan lebih rapi').closest('ul')).toHaveClass('list-disc');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('renders a dated timeline and marks only the first release as latest', async () => {
    mocks.history.mockResolvedValue({releases:[
      {...release, items:['Pembaruan SIGAP', '- Pengajuan lebih rapi']},
      {...release, id:'older', publishedAt:'2026-11-11T01:00:00Z', items:['1. Rilis lama']},
    ]});
    mount('user-a');
    const newerNotice = await screen.findByRole('button', {name:/12 November 2026/});
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.getAllByText('Terbaru')).toHaveLength(1);
    expect(screen.getByText('14.00 WIB')).toBeInTheDocument();
    await userEvent.click(newerNotice);
    expect(screen.getAllByText('Pembaruan SIGAP')).toHaveLength(1);
    expect(screen.getByText('Pengajuan lebih rapi')).toBeVisible();
    await userEvent.click(screen.getByRole('button', {name:/11 November 2026/}));
    expect(newerNotice).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Rilis lama')).toBeInTheDocument();
  });
  it('keeps the official version visible when there are no archived announcements',async()=>{
    mocks.history.mockResolvedValue({releases:[]});mount('user-a');
    expect(await screen.findByText('Belum ada pengumuman lain.')).toBeInTheDocument();
    expect(within(appVersion()).getByText('18 November 2026')).toHaveAttribute('datetime','2026-11-18');
    expect(screen.queryByText('Penambahan fitur')).toBeNull();
    await userEvent.click(appVersion());
    expect(screen.getByText('Penambahan fitur')).toBeVisible();
    expect(screen.queryByText('Optimasi')).toBeNull();
    expect(screen.queryByRole('navigation', {name:'Halaman pembaruan aplikasi'})).toBeNull();
  });
  it('attaches the existing notice by exact ID without assigning versions by date', async () => {
    mocks.history.mockResolvedValue({releases:[
      {...release, id:previousAnnouncementId, publishedAt:'2026-11-18T03:52:00Z', items:['Pengumuman asli']},
      {...release, id:'other-same-day', publishedAt:'2026-11-18T04:00:00Z', items:['Pengumuman berbeda di hari yang sama']},
    ]});
    mount('user-a');
    const other = await screen.findByRole('button', {name:/^18 November 2026/});
    await userEvent.click(appVersion());
    const version = screen.getByRole('region', {name:/^Versi v1\.10\.0/});
    const original = within(version).getByText("Lihat pengumuman What's New");
    await userEvent.click(original);
    expect(within(version).getByText('Pengumuman asli')).toBeVisible();
    await userEvent.click(other);
    expect(appVersion()).toHaveAttribute('aria-expanded', 'false');
    const archived = screen.getByRole('region', {name:/^18 November 2026/});
    expect(within(archived).getByText('Pengumuman berbeda di hari yang sama')).toBeVisible();
    expect(within(archived).queryByText(/v1\.10\.0/)).toBeNull();
  });
  it('nests the new published notice under its matching version instead of duplicating it', async () => {
    mocks.history.mockResolvedValue({ releases: [{ ...release, id: 'new-published-id', publishedAt: '2026-11-19T02:00:00Z',
      items: ['Pembaruan SIGAP v1.11.0', '- Jadwal per form'] }] });
    mount('user-a');
    expect(await screen.findByText('Belum ada pengumuman lain.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Versi v1\.11\.0/ }));
    await userEvent.click(screen.getByText("Lihat pengumuman What's New"));
    expect(screen.getByText('Jadwal per form')).toBeVisible();
  });
  it('offers retry instead of displaying internal errors',async()=>{
    mocks.history.mockRejectedValue(Error('private SQL'));mount('user-a');
    await screen.findByRole('alert',{}, {timeout:3000});expect(screen.queryByText('private SQL')).toBeNull();
    mocks.history.mockResolvedValue({releases:[release]});fireEvent.click(screen.getByRole('button',{name:'Coba lagi'}));
    expect(await screen.findByRole('button', {name:/12 November 2026/})).toBeInTheDocument();
  });
  it('never shows a previous account cache after logout',async()=>{
    const client = new QueryClient();
    const tree = (id?: string) => <MemoryRouter>
      <QueryClientProvider client={client}><ReleaseNoticeArchive userId={id} /></QueryClientProvider>
    </MemoryRouter>;
    const view = render(tree('user-a'));
    await userEvent.click(await screen.findByRole('button', {name:/12 November 2026/}));
    expect(screen.getByText('Pengajuan lebih rapi')).toBeVisible();
    view.rerender(tree());
    await waitFor(() => expect(screen.queryByText('Pengajuan lebih rapi')).toBeNull());
    expect(screen.queryByText('12 November 2026')).toBeNull();
    expect(screen.getByText(/Masuk ke SIGAP/)).toBeVisible();
  });

  const severalNotices = () => Array.from({length: 7}, (_, index) => ({
    ...release, id: `archive-${index}`, publishedAt: `2026-11-${17 - index}T07:00:00Z`,
    items: [`Isi arsip ${index + 1}`],
  }));

  it('counts the release and legacy announcements together without counting the linked notice twice', async () => {
    mocks.history.mockResolvedValue({ releases: [...severalNotices(), {...release, id: previousAnnouncementId}] });
    mount('user-a');
    const pagination = await screen.findByRole('navigation', {name:'Halaman pembaruan aplikasi'});
    expect(screen.getByText('Halaman 1 dari 2')).toBeVisible();
    expect(screen.getAllByRole('button', {expanded:false})).toHaveLength(5);
    expect(screen.queryByRole('button', {name:/13 November 2026/})).toBeNull();
    const previous = within(pagination).getByRole('button', {name:'Halaman sebelumnya'});
    const next = within(pagination).getByRole('button', {name:'Halaman berikutnya'});
    expect(previous).toBeDisabled();
    await userEvent.click(next);
    expect(screen.getByText('Halaman 2 dari 2')).toBeVisible();
    expect(screen.getByLabelText('Alamat pencarian')).toHaveTextContent('?page=2');
    expect(screen.getAllByRole('button', {expanded:false})).toHaveLength(4);
    expect(screen.queryByRole('button', {name:/^Versi v1\.10\.0/})).toBeNull();
    await userEvent.click(screen.getByRole('button', {name:/13 November 2026/}));
    expect(screen.getByText('Isi arsip 5')).toBeVisible();
    expect(next).toBeDisabled();
    await userEvent.click(previous);
    expect(appVersion()).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens a bookmarked app history page once the authenticated archive loads', async () => {
    mocks.history.mockResolvedValue({ releases: severalNotices() });
    mount('user-a', '?page=2');
    expect(await screen.findByText('Halaman 2 dari 2')).toBeVisible();
    expect(screen.getAllByRole('button', {expanded:false})).toHaveLength(4);
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
    await userEvent.click(await screen.findByRole('button', {name:/12 November 2026/}));
    expect(screen.getByRole('tab', {name:'Pembaruan aplikasi'})).toHaveAttribute('aria-selected','true');
    await userEvent.click(screen.getByRole('tab', {name:'Riwayat dokumentasi'}));
    await userEvent.click(screen.getByRole('button', {name:/v1\.28\.0/}));
    expect(screen.getByRole('link', {name:'Kalender Kerja'})).toHaveAttribute('href','/docs/kalender/overview');
    expect(screen.queryByText('Pengajuan lebih rapi')).toBeNull();
  });

  it('opens a documentation deep link with details collapsed, without requesting private notices', async () => {
    mountTabs('/docs/versi/changelog?tab=dokumentasi');
    expect(screen.getByRole('tab', {name:'Riwayat dokumentasi'})).toHaveAttribute('aria-selected','true');
    const latest = screen.getByRole('button', {name:/v1\.28\.0/});
    const older = screen.getByRole('button', {name:/v1\.27\.0/});
    expect(latest).toHaveAttribute('aria-expanded','false');
    expect(screen.queryByRole('link', {name:'Pembaruan dan Maintenance'})).toBeNull();
    latest.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('link', {name:'Pembaruan dan Maintenance'})).toBeInTheDocument();
    await userEvent.click(older);
    expect(latest).toHaveAttribute('aria-expanded','false');
    expect(screen.getByText(/Menambahkan panduan Lihat payload/)).toBeVisible();
    await userEvent.click(older);
    expect(older).toHaveAttribute('aria-expanded','false');
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it('paginates newest first and lets readers reach the final partial page and return', async () => {
    mountTabs('/docs/versi/changelog?tab=dokumentasi');
    const previous = screen.getByRole('button', {name:'Halaman sebelumnya'});
    const next = screen.getByRole('button', {name:'Halaman berikutnya'});
    expect(screen.getByText('Halaman 1 dari 5')).toBeVisible();
    expect(screen.getAllByRole('button', {name:/^v\d+\./})).toHaveLength(5);
    expect(previous).toBeDisabled();
    await userEvent.click(next);
    expect(screen.getByText('Halaman 2 dari 5')).toBeVisible();
    expect(screen.queryByRole('button', {name:/v1\.28\.0/})).toBeNull();
    expect(screen.getByRole('button', {name:/v1\.23\.0/})).toHaveAttribute('aria-expanded','false');
    await userEvent.click(next);
    await userEvent.click(next);
    await userEvent.click(next);
    expect(screen.getByText('Halaman 5 dari 5')).toBeVisible();
    expect(screen.getAllByRole('button', {name:/^v\d+\./})).toHaveLength(3);
    expect(screen.getByRole('button', {name:/v1\.5\.0/})).toBeVisible();
    expect(next).toBeDisabled();
    await userEvent.click(previous);
    expect(screen.getByText('Halaman 4 dari 5')).toBeVisible();
  });

  it.each([['2', '2', '1.23.0'], ['999', '5', '1.8.0'], ['-1', '1', '1.28.0']])(
    'opens documentation page %s as page %s',
    (param, page, firstVersion) => {
      mountTabs(`/docs/versi/changelog?tab=dokumentasi&page=${param}`);
      expect(screen.getByText(`Halaman ${page} dari 5`)).toBeVisible();
      expect(screen.getAllByRole('button', {name:/^v\d+\./})[0]).toHaveAccessibleName(expect.stringContaining(`v${firstVersion}`));
    },
  );
});
