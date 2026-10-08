import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditUserModal } from '@/components/users/EditUserModal';
import { adminUserService } from '@/services/admin-user.service';
import type { User } from '@/types/agenda';

vi.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => ({
  select: () => ({ order: () => Promise.resolve({ error: null, data: table === 'master_offices'
    ? [{ id: 'branch', name: 'Magelang', kedudukan: 'KC' }, { id: 'hq', name: 'Pusat', kedudukan: 'Pusat' },
      { id: 'kost', name: 'Palur', kedudukan: 'Kost' }]
    : [] }) }),
}) } }));
vi.mock('@/services/user.service', () => ({ updateUserProfile: vi.fn().mockResolvedValue(undefined) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const user: User = {
  id: 'employee', email: 'employee@example.test', fullName: 'Employee', nik: 'EMP-1',
  role: 'user', jobTitle: 'Supervisor Marketing', departmentId: null, officeId: null,
  parentId: 'old-bm',
};
// User's legacy office type is numeric; exercise office selection using its actual DOM control.
const chooseOffice = async (name: string) => {
  const controls = screen.getAllByRole('combobox');
  fireEvent.click(controls[1]);
  fireEvent.click(await screen.findByRole('option', { name }));
};

describe('branch reporting edit UI', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  });
  beforeEach(() => vi.restoreAllMocks());

  it('sends no stale parent after selecting a branch; shows a read-only automatic relation', async () => {
    const save = vi.spyOn(adminUserService, 'updateUser').mockResolvedValue({ user: {
      id: 'employee', email: user.email, full_name: user.fullName, role: 'user',
      is_active: true, department_id: null, office_id: 'branch', parent_id: 'new-bm',
    } });
    render(<EditUserModal user={user} allUsers={[]} isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole('combobox')).toHaveLength(4));
    await chooseOffice('KC Magelang');
    expect(screen.getByRole('textbox', { name: 'Atasan Langsung Otomatis' })).toHaveValue('Atasan kantor (otomatis)');
    expect(screen.getByRole('textbox', { name: 'Atasan Langsung Otomatis' })).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('employee', expect.objectContaining({ office_id: 'branch', parent_id: null })));
  });

  it('keeps the configured parent selector for headquarters and branch managers', async () => {
    render(<EditUserModal user={{ ...user, jobTitle: 'Branch Manager' }} allUsers={[]} isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole('combobox')).toHaveLength(4));
    await chooseOffice('KC Magelang');
    expect(screen.queryByRole('textbox', { name: 'Atasan Langsung Otomatis' })).toBeNull();
    expect(screen.getAllByRole('combobox')).toHaveLength(4);
  });
  it('keeps the configured supervisor selector for Kost', async () => {
    render(<EditUserModal user={user} allUsers={[]} isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole('combobox')).toHaveLength(4));
    await chooseOffice('Kost Palur');
    expect(screen.queryByRole('textbox', { name: 'Atasan Langsung Otomatis' })).toBeNull();
    expect(screen.getAllByRole('combobox')).toHaveLength(4);
  });
});
