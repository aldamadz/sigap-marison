import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DepartmentSlaSettingsPage from '@/pages/settings/DepartmentSlaSettingsPage';
import SettingsPage from '@/pages/settings/SettingsPage';
import { DepartmentSlaManagers } from '@/components/configuration/DepartmentSlaManagers';
import { DEFAULT_DEPARTMENT_KPI_CONFIG } from '@/services/department-kpi.service';

const h = vi.hoisted(() => ({ getScope: vi.fn(), getConfig: vi.fn(), saveConfig: vi.fn(), getFilterOptions: vi.fn(), getSummary: vi.fn(), getDetails: vi.fn(), getManagerCandidates: vi.fn(), setManagers: vi.fn() }));
vi.mock('@/services/department-receiving.service', () => ({ departmentReceivingService: h }));
vi.mock('@/services/department-kpi.service', async original => ({ ...await original<typeof import('@/services/department-kpi.service')>(), departmentKpiService: h }));
vi.mock('@/components/configuration/DepartmentReceivingPolicy', () => ({ DepartmentReceivingPolicy: ({ deptId }: { deptId: string }) => <section aria-label="Receiving policy">{deptId}</section> }));
vi.mock('@/components/settings/SettingsView', () => ({ SettingsView: () => <div>Profile settings</div> }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
const clients: QueryClient[] = [];
const mount = (view: React.ReactNode, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) => {
  clients.push(client);
  return { client, ...render(<QueryClientProvider client={client}><MemoryRouter>{view}</MemoryRouter></QueryClientProvider>) };
};
beforeEach(() => {
  vi.resetAllMocks();
  h.getScope.mockResolvedValue([{ dept_id: 'finance', name: 'Keuangan' }]);
  h.getConfig.mockImplementation(async (deptId: string) => ({ ...DEFAULT_DEPARTMENT_KPI_CONFIG, dept_id: deptId, sla_minutes: deptId === 'finance' ? 180 : 90, is_active: false }));
  h.saveConfig.mockResolvedValue(undefined);
  h.getManagerCandidates.mockResolvedValue([{ user_id: 'alice', full_name: 'Alice', selected: true }, { user_id: 'bob', full_name: 'Bob', selected: false }]);
  h.setManagers.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

describe('delegated department SLA settings', () => {
  it.each(['empty', 'error'])('fails closed for %s scope and fetches no department/config/report data', async result => {
    if (result === 'empty') h.getScope.mockResolvedValue([]);
    else h.getScope.mockRejectedValue(Error('denied'));
    mount(<DepartmentSlaSettingsPage userId="delegate" />);
    await screen.findByText(result === 'empty' ? 'Anda tidak memiliki akses pengelolaan SLA departemen.' : 'Akses departemen belum dapat dikonfirmasi.');
    expect(h.getConfig).not.toHaveBeenCalled();
    expect(h.getFilterOptions).not.toHaveBeenCalled(); expect(h.getSummary).not.toHaveBeenCalled(); expect(h.getDetails).not.toHaveBeenCalled();
    expect(h.getManagerCandidates).not.toHaveBeenCalled();
  });
  it('loads and saves only scoped config; keeps signer fields and exposes no report or delegation UI', async () => {
    mount(<DepartmentSlaSettingsPage userId="delegate" />);
    expect(await screen.findByLabelText('SLA menit')).toHaveValue(180);
    expect(screen.getByRole('region', { name: 'Receiving policy' })).toHaveTextContent('finance');
    fireEvent.change(screen.getByLabelText('SLA menit'), { target: { value: '240' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan konfigurasi' }));
    await waitFor(() => expect(h.saveConfig).toHaveBeenCalledWith({ ...DEFAULT_DEPARTMENT_KPI_CONFIG, dept_id: 'finance', sla_minutes: 240, is_active: false }));
    expect(h.getScope).toHaveBeenCalledTimes(2);
    expect(h.getFilterOptions).not.toHaveBeenCalled(); expect(h.getSummary).not.toHaveBeenCalled(); expect(h.getDetails).not.toHaveBeenCalled();
    expect(h.getManagerCandidates).not.toHaveBeenCalled(); expect(screen.queryByText('Simpan pengelola')).not.toBeInTheDocument();
  });
  it('clears the editor and blocks writes when a transferred/revoked manager loses scope', async () => {
    mount(<DepartmentSlaSettingsPage userId="delegate" />); await screen.findByLabelText('SLA menit');
    h.getScope.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Simpan konfigurasi' }));
    await screen.findByText('Anda tidak memiliki akses pengelolaan SLA departemen.');
    expect(h.saveConfig).not.toHaveBeenCalled(); expect(screen.queryByLabelText('SLA menit')).not.toBeInTheDocument();
  });
  it('does not mount cached authorized department data before scope revalidation', async () => {
    const client = new QueryClient();
    client.setQueryData(['department-sla-scope', 'delegate'], [{ dept_id: 'finance', name: 'Keuangan' }]);
    let resolve!: (value: []) => void;
    h.getScope.mockImplementation(() => new Promise<[]>(done => { resolve = done; }));
    mount(<DepartmentSlaSettingsPage userId="delegate" />, client);
    expect(screen.getByText('Memeriksa akses departemen...')).toBeInTheDocument(); expect(h.getConfig).not.toHaveBeenCalled();
    resolve([]); await screen.findByText('Anda tidak memiliki akses pengelolaan SLA departemen.'); expect(h.getConfig).not.toHaveBeenCalled();
  });
  it('uses only authorized department options and resets edits when switching department', async () => {
    h.getScope.mockResolvedValue([{ dept_id: 'finance', name: 'Keuangan' }, { dept_id: 'legal', name: 'Legal' }]);
    mount(<DepartmentSlaSettingsPage userId="admin" />); await screen.findByLabelText('SLA menit');
    fireEvent.change(screen.getByLabelText('SLA menit'), { target: { value: '999' } });
    fireEvent.change(screen.getByLabelText('Departemen'), { target: { value: 'legal' } });
    await waitFor(() => expect(screen.getByLabelText('SLA menit')).toHaveValue(90));
    expect(screen.getByRole('region', { name: 'Receiving policy' })).toHaveTextContent('legal');
    expect(h.getFilterOptions).not.toHaveBeenCalled();
  });
  it('blocks configuration edits after a read failure and retries without loading reports', async () => {
    h.getConfig.mockRejectedValueOnce(Error('private detail'));
    mount(<DepartmentSlaSettingsPage userId="delegate" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Konfigurasi SLA belum dapat dimuat.');
    expect(screen.queryByRole('button', { name: 'Simpan konfigurasi' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' })); await screen.findByLabelText('SLA menit');
  });
  it('reports failed writes without success and validates invalid schedules', async () => {
    mount(<DepartmentSlaSettingsPage userId="delegate" />); await screen.findByLabelText('SLA menit');
    fireEvent.change(screen.getByLabelText('Selesai kerja'), { target: { value: '07:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan konfigurasi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Periksa SLA'); expect(h.saveConfig).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Selesai kerja'), { target: { value: '17:00' } }); h.saveConfig.mockRejectedValueOnce(Error('denied'));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan konfigurasi' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Konfigurasi belum dapat dikonfirmasi.'));
    expect(screen.queryByText('Konfigurasi SLA tersimpan.')).not.toBeInTheDocument();
  });
});

describe('settings navigation', () => {
  it.each(['empty', 'error', 'allowed'])('shows the SLA link only after a nonempty successful scope (%s)', async result => {
    if (result === 'empty') h.getScope.mockResolvedValue([]);
    if (result === 'error') h.getScope.mockRejectedValue(Error('denied'));
    const { client } = mount(<SettingsPage userId="delegate" />);
    await waitFor(() => expect(client.getQueryState(['department-sla-scope', 'delegate'])?.fetchStatus).toBe('idle'));
    if (result === 'allowed') expect(await screen.findByRole('link', { name: 'SLA departemen' })).toHaveAttribute('href', '/settings/department-sla');
    else expect(screen.queryByRole('link', { name: 'SLA departemen' })).not.toBeInTheDocument();
  });
});

describe('admin department manager assignments', () => {
  it('renders only candidate names, preselects managers and supports complete revocation', async () => {
    h.setManagers.mockImplementationOnce(async () => {
      h.getManagerCandidates.mockResolvedValue([{ user_id: 'alice', full_name: 'Alice', selected: false }, { user_id: 'bob', full_name: 'Bob', selected: false }]);
    });
    mount(<DepartmentSlaManagers deptId="finance" />);
    const alice = await screen.findByRole('checkbox', { name: 'Alice' }); expect(alice).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Bob' })).not.toBeChecked();
    fireEvent.click(alice); fireEvent.click(screen.getByRole('button', { name: 'Simpan pengelola' }));
    await waitFor(() => expect(h.setManagers).toHaveBeenCalledWith('finance', []));
    expect(await screen.findByText('Pengelola SLA tersimpan.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Alice' })).not.toBeChecked();
  });
  it('saves only selected candidates in the department', async () => {
    mount(<DepartmentSlaManagers deptId="finance" />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Bob' }));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan pengelola' }));
    await waitFor(() => expect(h.setManagers).toHaveBeenCalledWith('finance', ['alice', 'bob']));
  });
  it('fails closed on candidate fetch errors and reports assignment denial', async () => {
    h.getManagerCandidates.mockRejectedValueOnce(Error('admin only')); mount(<DepartmentSlaManagers deptId="finance" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Anggota departemen belum dapat dimuat.');
    expect(screen.queryByRole('button', { name: 'Simpan pengelola' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' })); await screen.findByRole('checkbox', { name: 'Alice' });
    h.setManagers.mockRejectedValueOnce(Error('inactive member')); fireEvent.click(screen.getByRole('button', { name: 'Simpan pengelola' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Pengelola belum dapat dikonfirmasi.'));
    expect(screen.queryByText('Pengelola SLA tersimpan.')).not.toBeInTheDocument();
  });
});
