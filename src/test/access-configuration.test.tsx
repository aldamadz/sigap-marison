import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AccessConfigurationPage from '@/pages/admin/AccessConfigurationPage';
import { accessService } from '@/services/access.service';

const users = [
  { id: 'carissa', full_name: 'Carissa', email: 'carissa@example.test', office_id: 'karanganyar' },
  { id: 'other', full_name: 'Other', email: 'other@example.test', office_id: 'solo' },
];
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => {
  const query = { select: () => query, eq: () => query, is: () => query, not: () => query,
    order: () => query, ilike: () => query, limit: () => query,
    then: (resolve: (v: unknown) => void) => resolve({ data: users, error: null }) };
  return query;
} } }));
vi.mock('@/services/access.service', () => ({ accessService: {
  getUserOfficeGrants: vi.fn(), setUserOfficeGrants: vi.fn(), getOfficeCatalog: vi.fn(),
} }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(accessService.getUserOfficeGrants).mockResolvedValue([]);
  vi.mocked(accessService.setUserOfficeGrants).mockResolvedValue();
  vi.mocked(accessService.getOfficeCatalog).mockResolvedValue([
    { id: 'solo', name: 'Solo', kedudukan: 'KC', code: 'SL', parent_id: null },
    { id: 'karanganyar', name: 'Karanganyar', kedudukan: 'KCP', code: 'KA', parent_id: 'solo' },
  ]);
});

describe('admin office access editor', () => {
  it('starts with no additional offices, protects own office and saves only explicit grants', async () => {
    render(<AccessConfigurationPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Carissa carissa/ }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'KCP Karanganyar' })).toBeDisabled());
    expect(screen.getByRole('checkbox', { name: 'KC Solo' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'KC Solo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Hak Akses' }));
    await waitFor(() => expect(accessService.setUserOfficeGrants).toHaveBeenCalledWith('carissa', ['solo']));
  });
  it('does not apply a late response from a previously selected user', async () => {
    let finish!: (ids: string[]) => void;
    vi.mocked(accessService.getUserOfficeGrants).mockImplementation(id => id === 'carissa'
      ? new Promise(resolve => { finish = resolve; }) : Promise.resolve([]));
    render(<AccessConfigurationPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Carissa carissa/ }));
    fireEvent.click(screen.getByRole('button', { name: /Other other/ }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'KC Solo' })).toBeDisabled());
    await act(async () => { finish(['karanganyar']); });
    expect(screen.getByRole('checkbox', { name: 'KCP Karanganyar' })).not.toBeChecked();
  });
  it('fails closed when grants cannot be loaded', async () => {
    vi.mocked(accessService.getUserOfficeGrants).mockRejectedValue(new Error('offline'));
    render(<AccessConfigurationPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Carissa carissa/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat hak akses');
    expect(screen.getByRole('button', { name: 'Simpan Hak Akses' })).toBeDisabled();
  });
  it('cannot overwrite grants when the office catalog fails', async () => {
    vi.mocked(accessService.getOfficeCatalog).mockRejectedValue(new Error('offline'));
    render(<AccessConfigurationPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Carissa carissa/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat daftar kantor');
    expect(screen.getByRole('button', { name: 'Simpan Hak Akses' })).toBeDisabled();
    expect(accessService.setUserOfficeGrants).not.toHaveBeenCalled();
  });
});
