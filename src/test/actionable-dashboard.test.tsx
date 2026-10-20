import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ActionableDashboard, DashboardSla } from '@/components/dashboard/ActionableDashboard';
import { AppLayout } from '@/components/layout/AppLayout';
import { dashboardRowLink, type ActionableDashboardData, type DashboardRow } from '@/services/actionable-dashboard.service';

const mocks = vi.hoisted(() => ({ get: vi.fn(), remind: vi.fn() }));
vi.mock('@/services/actionable-dashboard.service', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/actionable-dashboard.service')>(),
  getActionableDashboard: mocks.get, remindDashboardRequest: mocks.remind,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/layout/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('@/components/layout/Header', () => ({ Header: () => null }));
const row: DashboardRow = {
  id: 'doc-1', no_surat: '001/UAI/PO/X/2026', title: 'Servis kendaraan operasional',
  requester_name: 'Pemohon A', office_name: 'KC Solo', department_name: 'Marketing', bucket: 'ready',
  current_step: 2, my_step: 2, signature_id: 'sig-1', current_signer_id: 'manager-a', current_signer_name: 'Manager A', current_role: 'Memeriksa',
  needs_verification: false, needs_recommendation: false, revision_reason: null, started_at: null, elapsed_minutes: 30, sla_minutes: 120,
};
const bundle = (extra: Partial<ActionableDashboardData> = {}): ActionableDashboardData => ({
  scope: 'mine', team_label: 'KC Solo dan KCP', has_signatures: false, generated_at: new Date().toISOString(),
  summary: { active: 8, ready: 2, blocked: 1, upcoming: 3, returned: 2, completed: 4, rejected: 1, within_sla: 5, overdue: 1, completed_on_time: 3, completed_measured: 4 },
  count: 1, rows: [row], groups: [{ name: 'KC Solo', active: 1, overdue: 0 }, { name: 'KCP Karanganyar', active: 7, overdue: 1 }], ...extra,
});
const renderDashboard = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<MemoryRouter><QueryClientProvider client={client}><ActionableDashboard userId="actor-1" /></QueryClientProvider></MemoryRouter>);
};
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
describe('actionable dashboard', () => {
  it('keeps a single dashboard title inside the mobile application layout', async () => {
    vi.stubGlobal('innerWidth',390);mocks.get.mockResolvedValue(bundle());
    const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
    render(<MemoryRouter initialEntries={['/dashboard']}><QueryClientProvider client={client}><Routes><Route element={<AppLayout />}><Route path="/dashboard" element={<ActionableDashboard userId="actor-1" />} /></Route></Routes></QueryClientProvider></MemoryRouter>);
    await screen.findByText(row.title);
    expect(screen.getAllByRole('heading',{level:1,name:'Dashboard'})).toHaveLength(1);
  });
  it('removes legacy Agenda, shows distinct requester queue, SLA and responsible person with exact document drilldown', async () => {
    mocks.get.mockResolvedValue(bundle());renderDashboard();
    expect(await screen.findByText(row.title)).toHaveAttribute('href','/surat/monitoring?document=doc-1');
    expect(screen.queryByText('Agenda')).not.toBeInTheDocument();
    expect(screen.getByText('Manager A')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('Sisa 1 jam 30 menit kerja')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith(expect.objectContaining({ scope: 'mine', bucket: 'active', page: 1, signal: expect.any(AbortSignal) }));
  });
  it('selects signer view automatically only for actual approval assignments and separates upcoming work', async () => {
    mocks.get.mockResolvedValue(bundle({ has_signatures: true }));renderDashboard();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Tanda tangan saya' })).toHaveAttribute('aria-selected','true'));
    expect(mocks.get).toHaveBeenLastCalledWith(expect.objectContaining({ scope:'signer',bucket:'ready' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Belum sampai tahap saya' })[0]);
    await waitFor(() => expect(mocks.get).toHaveBeenLastCalledWith(expect.objectContaining({ bucket:'upcoming' })));
    expect(screen.getByRole('link', { name:row.title })).toHaveAttribute('href','/surat/inbox?task=approval%3Asig-1');
  });
  it('team view has branch groups and server-side search, SLA drilldown, pagination', async () => {
    mocks.get.mockResolvedValue(bundle({ count:25 }));renderDashboard();await screen.findByText(row.title);
    await userEvent.click(screen.getByRole('tab',{name:'Departemen / kantor'}));
    await screen.findByRole('heading',{name:'KC Solo dan KCP'});
    fireEvent.click(screen.getByRole('button',{name:/KCP Karanganyar 7 aktif/}));
    await waitFor(() => expect(mocks.get).toHaveBeenLastCalledWith(expect.objectContaining({ scope:'team',search:'KCP Karanganyar',bucket:'active' })));
    fireEvent.click(screen.getByRole('button',{name:/Antrean melewati SLA/}));
    await waitFor(() => expect(mocks.get).toHaveBeenLastCalledWith(expect.objectContaining({ bucket:'overdue',page:1 })));
    fireEvent.click(screen.getByRole('button',{name:'Halaman berikutnya'}));
    await waitFor(() => expect(mocks.get).toHaveBeenLastCalledWith(expect.objectContaining({ page:2 })));
  });
  it('does not show fake zero success when backend fails and supports retry', async () => {
    mocks.get.mockRejectedValue(new Error('Unavailable'));renderDashboard();
    expect(await screen.findByRole('alert')).toHaveTextContent('Ringkasan pengajuan gagal dimuat.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    mocks.get.mockResolvedValue(bundle());fireEvent.click(screen.getByRole('button',{name:'Coba lagi'}));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
  it('sends a reminder only on explicit click, using document identity not client-supplied recipients', async () => {
    mocks.get.mockResolvedValue(bundle());mocks.remind.mockResolvedValue({sent:true,recipient:'Manager A'});renderDashboard();
    await screen.findByText(row.title);expect(mocks.remind).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:`Ingatkan ${row.no_surat}`}));
    await waitFor(() => expect(mocks.remind).toHaveBeenCalledExactlyOnceWith('doc-1'));
  });
  it('shows explicit empty and paused/unstarted SLA states', async () => {
    mocks.get.mockResolvedValue(bundle({ rows:[],count:0 }));renderDashboard();
    expect(await screen.findByText('Tidak ada pengajuan pada kategori ini.')).toBeInTheDocument();
    const returned = render(<DashboardSla row={{...row,bucket:'returned',elapsed_minutes:null}} />);
    expect(within(returned.container).getByText('Dijeda untuk perbaikan')).toBeInTheDocument();returned.unmount();
    const upcoming = render(<DashboardSla row={{...row,bucket:'upcoming',elapsed_minutes:null}} />);
    expect(within(upcoming.container).getByText('Belum mulai')).toBeInTheDocument();
  });
  it('routes returned requester to follow up; never opens a future assignment as an actionable approval', () => {
    expect(dashboardRowLink({...row,bucket:'returned'},'mine')).toBe('/surat/tindak-lanjut');
    expect(dashboardRowLink({...row,bucket:'upcoming'},'signer')).toBe('/surat/monitoring?document=doc-1');
  });
  it('makes SLA performance measurable and preserves category counts and filters', async () => {
    mocks.get.mockResolvedValue(bundle());renderDashboard();await screen.findByText(row.title);
    expect(screen.getByRole('meter', { name: 'Selesai tepat waktu' })).toHaveAttribute('aria-valuenow', '75');
    expect(screen.getByText('3 dari 4 pengajuan terukur')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Kategori antrean' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Antrean dalam SLA/ }));
    await waitFor(() => expect(mocks.get).toHaveBeenLastCalledWith(expect.objectContaining({ bucket: 'within_sla', page: 1 })));
  });
  it('outlines the scope control as one strong solid group and preserves accessible keyboard selection', async () => {
    mocks.get.mockResolvedValue(bundle());renderDashboard();await screen.findByText(row.title);
    const group = screen.getByRole('tablist', { name: 'Lingkup pengajuan' });
    expect(group).toHaveClass('border-2', 'border-solid', 'border-primary');
    expect(group).not.toHaveClass('border-dashed');
    const scopes = within(group);
    for (const tab of scopes.getAllByRole('tab')) expect(tab).not.toHaveClass('border');
    const mine = scopes.getByRole('tab', { name: 'Pengajuan saya' });
    expect(mine).toHaveAttribute('aria-selected', 'true');
    act(() => mine.focus());await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(scopes.getByRole('tab', { name: 'Tanda tangan saya' })).toHaveAttribute('aria-selected', 'true'));
    expect(mocks.get).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'signer', bucket: 'ready' }));
  });
  it('outlines the queue control as one strong solid group without bordering individual choices', async () => {
    mocks.get.mockResolvedValue(bundle());renderDashboard();await screen.findByText(row.title);
    const group = screen.getByRole('group', { name: 'Kategori antrean' });
    expect(group).toHaveClass('border-2', 'border-solid', 'border-primary');
    expect(group).not.toHaveClass('border-dashed');
    const categories = within(group);
    const active = categories.getByRole('button', { name: 'Antrean aktif' });
    const returned = categories.getByRole('button', { name: 'Perlu perbaikan' });
    for (const button of categories.getAllByRole('button')) expect(button).not.toHaveClass('border');
    expect(active).toHaveClass('bg-card');expect(returned).not.toHaveClass('bg-card');
    await userEvent.click(returned);
    expect(active).toHaveAttribute('aria-pressed', 'false');expect(active).not.toHaveClass('bg-card');
    expect(returned).toHaveAttribute('aria-pressed', 'true');expect(returned).toHaveClass('bg-card');
    await waitFor(() => expect(mocks.get).toHaveBeenLastCalledWith(expect.objectContaining({ bucket: 'returned', page: 1 })));
    await userEvent.click(screen.getByRole('tab', { name: 'Tanda tangan saya' }));
    for (const button of categories.getAllByRole('button')) expect(button).not.toHaveClass('border');
    expect(categories.getByRole('button', { name: 'Perlu tanda tangan' })).toHaveClass('bg-card');
  });
  it('does not invent a performance percentage without measured completions', async () => {
    const data = bundle();data.summary.completed_measured = 0;data.summary.completed_on_time = 0;
    mocks.get.mockResolvedValue(data);renderDashboard();await screen.findByText(row.title);
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
    expect(screen.getByText('Belum ada pengajuan terukur')).toBeInTheDocument();
  });
  it('keeps KPI and SLA card borders neutral even when selected without changing their filters', async () => {
    mocks.get.mockResolvedValue(bundle());renderDashboard();await screen.findByText(row.title);
    const summary = screen.getByLabelText('Ringkasan pengajuan');
    const cards = within(summary).getAllByRole('button');
    const assertNeutralBorders = () => {
      for (const card of [...cards, ...within(screen.getByLabelText('SLA pengajuan')).getAllByRole('button')]) {
        expect(card).toHaveClass('border-border');
        expect(card).not.toHaveClass('ring-1');
        expect(card).not.toHaveClass('border-primary');
        expect(card).not.toHaveClass('border-emerald-600');
        expect(card).not.toHaveClass('border-red-600');
      }
    };
    expect(cards[0]).toHaveAttribute('aria-pressed', 'true');assertNeutralBorders();
    await userEvent.click(within(summary).getByRole('button', { name: /Selesai/ }));
    await waitFor(() => expect(mocks.get).toHaveBeenLastCalledWith(expect.objectContaining({ bucket: 'completed' })));
    assertNeutralBorders();
    await userEvent.click(screen.getByRole('button', { name: /Antrean dalam SLA/ }));
    await waitFor(() => expect(mocks.get).toHaveBeenLastCalledWith(expect.objectContaining({ bucket: 'within_sla' })));
    assertNeutralBorders();
  });
  it('preserves SLA boundaries while displaying hours and minutes without assuming a workday length', () => {
    const { rerender } = render(<DashboardSla row={{ ...row, elapsed_minutes: 2417 }} />);
    expect(screen.getByText('Lewat 38 jam 17 menit kerja')).toBeInTheDocument();
    expect(screen.getByText('Melewati SLA')).toBeInTheDocument();
    rerender(<DashboardSla row={{ ...row, elapsed_minutes: 120 }} />);
    expect(screen.getByText('Sisa 0 menit kerja')).toBeInTheDocument();
    expect(screen.getByText('Dalam SLA')).toBeInTheDocument();
    rerender(<DashboardSla row={{ ...row, bucket: 'completed', elapsed_minutes: 125 }} />);
    expect(screen.getByText('2 jam 5 menit kerja')).toBeInTheDocument();
    rerender(<DashboardSla row={{ ...row, bucket: 'returned', elapsed_minutes: 2417 }} />);
    expect(screen.getByText('Dijeda untuk perbaikan')).toBeInTheDocument();
    expect(screen.queryByText('Melewati SLA')).not.toBeInTheDocument();
  });
});
