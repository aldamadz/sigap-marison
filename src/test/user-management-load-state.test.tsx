import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UserManagementPage from '@/pages/admin/UserManagementPage';

const mocks = vi.hoisted(() => ({ users: vi.fn(), mappings: vi.fn(),
  issueError: null as unknown, reload: async () => {} }));
vi.mock('@/services/user.service', () => ({ getUsers: mocks.users }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => {
  const query = { select: () => query, eq: () => query,
    then: (resolve: (result: unknown) => unknown) => Promise.resolve({ count: 0, error: mocks.issueError }).then(resolve) };
  return query;
} } }));
vi.mock('@/hooks/use-master-realtime-reload', async () => {
  const React = await import('react');
  return { useMasterRealtimeReload: (_: string, __: string[], load: (background: boolean) => Promise<void>) => {
    const ref = React.useRef(load);
    ref.current = load;
    mocks.reload = () => ref.current(true);
    React.useEffect(() => { void ref.current(false); }, []);
    return () => ref.current(true);
  } };
});
vi.mock('@/services/marison-payload-mapping.service', () => ({ marisonPayloadMappingService: { list: mocks.mappings } }));
vi.mock('@/components/admin/MarisonPayloadMappingCell', () => ({ MarisonPayloadMappingCell: () => null }));
vi.mock('@/components/users/AddUserModal', () => ({ AddUserModal: () => null }));
vi.mock('@/components/users/EditUserModal', () => ({ EditUserModal: () => null }));
vi.mock('@/components/app/AppDialogProvider', () => ({ useAppDialog: () => ({ confirm: vi.fn() }) }));
vi.mock('@/lib/excel', () => ({ excelSerialToDateInput: vi.fn(), exportRowsToXlsx: vi.fn(), readSpreadsheetRows: vi.fn() }));

const employee = { id: 'employee', fullName: 'Employee Test', email: 'employee@example.test',
  role: 'user', jobTitle: 'Staff', officeName: 'KC Solo', departmentName: 'Marketing', is_active: true };
const renderPage = () => render(<MemoryRouter><UserManagementPage /></MemoryRouter>);

describe('employee directory load state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.issueError = null;
    mocks.users.mockResolvedValue([employee]);
    mocks.mappings.mockResolvedValue([]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows a retryable failure, not empty results or zero counters, and recovers', async () => {
    mocks.users.mockRejectedValueOnce(new Error('PGRST201 internal details'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat data karyawan. Coba lagi.');
    expect(screen.queryByText('Data tidak ditemukan')).toBeNull();
    expect(screen.getByText('- Total')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ekspor XLSX' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Impor' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByText('Employee Test')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('1 Total')).toBeVisible();
  });
  it('keeps last-good rows and counters on background failure', async () => {
    renderPage();
    await screen.findByText('Employee Test');
    mocks.users.mockRejectedValueOnce(new Error('Network failure'));
    await act(async () => { await mocks.reload(); });
    expect(screen.getByRole('alert')).toHaveTextContent('Data yang ditampilkan adalah data terakhir yang berhasil dimuat.');
    expect(screen.getByText('Employee Test')).toBeVisible();
    expect(screen.getByText('1 Total')).toBeVisible();
    expect(screen.queryByText('Data tidak ditemukan')).toBeNull();
  });
  it('shows the real empty state only after a successful empty query', async () => {
    mocks.users.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('Data tidak ditemukan')).toBeVisible();
    expect(screen.getByText('0 Total')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('does not replace previous rows when supplemental mapping refresh fails', async () => {
    renderPage();
    await screen.findByText('Employee Test');
    mocks.users.mockResolvedValue([]);
    mocks.mappings.mockRejectedValueOnce(new Error('Mapping unavailable'));
    await act(async () => { await mocks.reload(); });
    expect(screen.getByText('Employee Test')).toBeVisible();
    expect(screen.getByText('1 Total')).toBeVisible();
    expect(screen.getByRole('alert')).toBeVisible();
  });
  it('does not silently ignore supplemental sync query errors', async () => {
    mocks.issueError = { code: '503' };
    renderPage();
    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
    expect(screen.queryByText('Data tidak ditemukan')).toBeNull();
    expect(screen.getByText('- Total')).toBeVisible();
  });
});
