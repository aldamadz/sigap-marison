import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsView } from '@/components/settings/SettingsView';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  audit: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('@/services/user-ui.service', () => ({ getCurrentUser: async () => ({ id: 'tester', full_name: 'SIGAP Tester' }) }));
vi.mock('@/services/office.service', () => ({ getOffices: async () => [] }));
vi.mock('@/components/settings/NotificationPreferences', () => ({ NotificationPreferences: () => null }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
    auth: { getUser: h.getUser, updateUser: h.updateUser },
    rpc: h.audit,
  },
}));

async function openPasswordDialog() {
  fireEvent.click(await screen.findByRole('button', { name: 'Ganti kata sandi' }));
  return within(await screen.findByRole('dialog', { name: 'Ganti kata sandi' }));
}

beforeEach(() => {
  vi.resetAllMocks();
  h.getUser.mockResolvedValue({ data: { user: { id: 'tester' } } });
  h.updateUser.mockResolvedValue({ error: null });
  h.audit.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe('change password dialog', () => {
  it('hides the form and clears a canceled entry without making a request', async () => {
    render(<MemoryRouter><SettingsView /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Ganti kata sandi' });
    expect(screen.queryByLabelText('Kata sandi baru')).not.toBeInTheDocument();
    const dialog = await openPasswordDialog();
    fireEvent.change(dialog.getByLabelText('Kata sandi baru'), { target: { value: 'test-secret' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Batal' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect((await openPasswordDialog()).getByLabelText('Kata sandi baru')).toHaveValue('');
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('keeps failed submissions open and closes the dialog after an audited success', async () => {
    render(<MemoryRouter><SettingsView /></MemoryRouter>);
    const dialog = await openPasswordDialog();
    const value = 'fixture-new-password';
    fireEvent.change(dialog.getByLabelText('Kata sandi baru'), { target: { value } });
    fireEvent.change(dialog.getByLabelText('Konfirmasi kata sandi'), { target: { value: 'different' } });
    const save = dialog.getByRole('button', { name: 'Simpan kata sandi' });
    fireEvent.click(save);
    expect(h.updateUser).not.toHaveBeenCalled();
    fireEvent.change(dialog.getByLabelText('Konfirmasi kata sandi'), { target: { value } });
    h.updateUser.mockResolvedValueOnce({ error: { message: 'Update failed' } });
    fireEvent.click(save);
    await waitFor(() => expect(save).toBeEnabled());
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(h.audit).not.toHaveBeenCalled();
    fireEvent.click(save);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(h.updateUser).toHaveBeenLastCalledWith({ password: value });
    expect(h.audit).toHaveBeenCalledWith('record_auth_audit_event', { p_event: 'password_changed' });
    expect((await openPasswordDialog()).getByLabelText('Kata sandi baru')).toHaveValue('');
  });
});
