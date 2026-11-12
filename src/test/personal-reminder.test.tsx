import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PersonalReminderButton } from '@/components/notifications/PersonalReminderButton';
const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
vi.mock('@/services/personal-reminder.service', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/personal-reminder.service')>(),
  getPersonalReminder: mocks.get, savePersonalReminder: mocks.save,
}));
vi.mock('@/components/settings/BrowserNotificationButton', () => ({ BrowserNotificationButton: () => <button>Aktifkan notifikasi browser</button> }));
beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue({ status: 'off', version: 0 }); mocks.save.mockResolvedValue({ status: 'scheduled', version: 1 }); });
afterEach(cleanup);
const open = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Atur pengingat pribadi' }));
  return screen.findByRole('switch', { name: 'Aktifkan pengingat' });
};
describe('personal reminder editor', () => {
  it('is lazy and default off; opening does not save or request popup', async () => {
    render(<PersonalReminderButton kind="surat" targetId="doc" />);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(await open()).not.toBeChecked();
    expect(mocks.get).toHaveBeenCalledWith('surat', 'doc');
    expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Waktu pengingat (WIB)')).not.toBeInTheDocument();
    expect(screen.queryByText('Aktifkan notifikasi browser')).not.toBeInTheDocument();
  });
  it('requires future time and sends only target, time, popup and expected version', async () => {
    render(<PersonalReminderButton kind="calendar" targetId="work" />);
    fireEvent.click(await open());
    fireEvent.click(screen.getByRole('button', { name: 'Simpan pengingat' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('masa mendatang');
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Waktu pengingat (WIB)'), { target: { value: '2099-01-01T13:00' } });
    expect(screen.getByRole('switch', { name: 'Popup browser' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('switch', { name: 'Popup browser' }));
    expect(screen.getByText('Aktifkan notifikasi browser')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Simpan pengingat' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('calendar', 'work', '2099-01-01T06:00:00.000Z', true, 0));
  });
  it('loads saved time in WIB and can disable without creating a new date', async () => {
    mocks.get.mockResolvedValue({ status: 'scheduled', remind_at: '2099-01-02T06:00:00Z', popup: true, version: 4 });
    render(<PersonalReminderButton kind="surat" targetId="doc" />);
    const toggle = await open(); expect(toggle).toBeChecked();
    expect(screen.getByLabelText('Waktu pengingat (WIB)')).toHaveValue('2099-01-02T13:00');
    fireEvent.click(toggle); fireEvent.click(screen.getByRole('button', { name: 'Simpan pengingat' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('surat', 'doc', null, false, 4));
  });
  it('preserves unsaved edits on failure, blocks stale overwrite and permits reload', async () => {
    mocks.save.mockRejectedValue({ code: '40001', message: 'private internal detail' });
    render(<PersonalReminderButton kind="surat" targetId="doc" />);
    fireEvent.click(await open());
    fireEvent.change(screen.getByLabelText('Waktu pengingat (WIB)'), { target: { value: '2099-01-01T13:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan pengingat' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Muat ulang sebelum menyimpan');
    expect(screen.getByLabelText('Waktu pengingat (WIB)')).toHaveValue('2099-01-01T13:00');
    expect(screen.queryByText('private internal detail')).not.toBeInTheDocument();
    mocks.get.mockResolvedValue({ status: 'off', version: 5 });
    fireEvent.click(screen.getByRole('button', { name: 'Muat ulang pengingat' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Aktifkan pengingat' })).not.toBeChecked());
  });
  it('does not expose save after a read failure', async () => {
    mocks.get.mockRejectedValue(new Error('private'));
    render(<PersonalReminderButton kind="surat" targetId="doc" />);
    fireEvent.click(screen.getByRole('button', { name: 'Atur pengingat pribadi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('belum dapat dimuat');
    expect(screen.queryByRole('button', { name: 'Simpan pengingat' })).not.toBeInTheDocument();
  });
  it('does not prefill another target from an old response', async () => {
    let resolve: (value: unknown) => void = () => {};
    mocks.get.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const view = render(<PersonalReminderButton kind="surat" targetId="old" />);
    fireEvent.click(screen.getByRole('button', { name: 'Atur pengingat pribadi' }));
    view.rerender(<PersonalReminderButton kind="surat" targetId="new" />);
    resolve({ status: 'scheduled', version: 99, popup: true, remind_at: '2099-01-01T06:00:00Z' });
    expect(await open()).not.toBeChecked();
    expect(mocks.get).toHaveBeenLastCalledWith('surat', 'new');
  });
});
