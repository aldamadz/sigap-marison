import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSubordinates, getUsers } from '@/services/user.service';
import { adminService } from '@/services/admin.service';

const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), result: { data: null, error: null } as { data: unknown; error: unknown } }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from } }));

const profile = {
  id: 'employee', full_name: 'Employee', email: 'employee@example.test', role: 'user',
  job_title: 'Staff', office_id: 'office', department_id: 'department',
  master_departments: { name: 'Marketing' }, master_offices: { name: 'KC Solo' },
};

describe('profile directory office embedding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.result = { data: [profile], error: null };
    const query = { select: mocks.select, is: () => query, eq: () => query,
      order: () => Promise.resolve(mocks.result),
      then: (resolve: (result: unknown) => unknown) => Promise.resolve(mocks.result).then(resolve) };
    mocks.from.mockReturnValue(query);
    mocks.select.mockReturnValue(query);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(['directory', 'subordinates', 'admin'])('pins %s to the primary-office FK, not delegated offices', async (reader) => {
    const rows = reader === 'directory' ? await getUsers()
      : reader === 'subordinates' ? await getSubordinates('manager') : await adminService.getAllUsers();
    expect(mocks.from).toHaveBeenCalledWith('profiles');
    expect(mocks.select).toHaveBeenCalledWith(expect.stringContaining('master_offices!profiles_office_id_new_fkey'));
    expect(rows).toHaveLength(1);
    if (reader !== 'admin') expect(rows[0].officeName).toBe('KC Solo');
  });
  it('keeps nullable primary office and department readable', async () => {
    mocks.result.data = [{ ...profile, master_offices: null, master_departments: null }];
    expect(await getUsers()).toEqual([expect.objectContaining({ officeName: null, departmentName: null })]);
  });
  it('distinguishes a real empty directory from a failed query', async () => {
    mocks.result.data = [];
    expect(await getUsers()).toEqual([]);
    mocks.result = { data: null, error: { code: 'PGRST201', message: 'Internal relationship details' } };
    await expect(getUsers()).rejects.toThrow('Gagal memuat data karyawan. Coba lagi.');
  });
  it('also rejects transport failures rather than returning zero employees', async () => {
    mocks.from.mockImplementationOnce(() => { throw new Error('Network unavailable'); });
    await expect(getUsers()).rejects.toThrow('Gagal memuat data karyawan. Coba lagi.');
  });
  it('pins the profile hook embedding to the same FK', () => {
    const source = readFileSync('src/hooks/use-auth.ts', 'utf8');
    expect(source).toContain('master_offices!profiles_office_id_new_fkey');
    expect(source).not.toMatch(/master_offices\s*\(/);
  });
});
