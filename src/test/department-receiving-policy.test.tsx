import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DepartmentReceivingPolicy } from '@/components/configuration/DepartmentReceivingPolicy';
import { defaultReceivingRule, defaultWeeklyReceivingRule, validateReceivingRule, validateWeeklyReceivingRule } from '@/services/department-receiving.service';
const h = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), remove: vi.fn(), listWeekly: vi.fn(), saveWeekly: vi.fn(), removeWeekly: vi.fn(), getSettings: vi.fn(), saveSettings: vi.fn(), confirm: vi.fn() }));
vi.mock('@/services/department-receiving.service', async original => ({ ...await original<typeof import('@/services/department-receiving.service')>(), departmentReceivingService: h }));
vi.mock('@/components/app/AppDialogProvider', () => ({ useAppDialog: () => ({ confirm: h.confirm }) }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
const clients: QueryClient[] = [];
const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  return render(<QueryClientProvider client={client}><DepartmentReceivingPolicy deptId="finance" /></QueryClientProvider>);
};
const tab = (name: string) => fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false });
const ready = async () => { await waitFor(() => expect(screen.getByRole('switch', { name: 'Aktifkan kebijakan penerimaan departemen' })).toBeEnabled()); };
const enablePolicy = async () => {
  h.getSettings.mockResolvedValue({ dept_id: 'finance', enabled: true });
  fireEvent.click(screen.getByRole('switch', { name: 'Aktifkan kebijakan penerimaan departemen' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Simpan periode' })).toBeEnabled());
};
beforeEach(() => {
  vi.resetAllMocks(); h.list.mockResolvedValue([]); h.listWeekly.mockResolvedValue([]);
  h.getSettings.mockResolvedValue({ dept_id: 'finance', enabled: false });
  h.save.mockResolvedValue(undefined); h.saveWeekly.mockResolvedValue(undefined); h.saveSettings.mockResolvedValue(undefined);
  h.remove.mockResolvedValue(undefined); h.removeWeekly.mockResolvedValue(undefined); h.confirm.mockResolvedValue(true);
});
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); });

describe('optional department receiving policy', () => {
  it('defaults off independently of saved rules and never writes on mount', async () => {
    h.listWeekly.mockResolvedValue([{ ...defaultWeeklyReceivingRule, dept_id: 'finance', week_start: '2000-01-03', enabled: true }]);
    mount(); await ready();
    expect(screen.getByRole('switch', { name: 'Aktifkan kebijakan penerimaan departemen' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Gunakan batas mingguan' })).toBeChecked();
    expect(screen.getByLabelText('Hari tutup')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Simpan periode' })).toBeDisabled();
    expect(h.saveSettings).not.toHaveBeenCalled(); expect(h.saveWeekly).not.toHaveBeenCalled();
  });
  it('enables only settings and retains all rules when turned off', async () => {
    mount(); await ready(); await enablePolicy();
    expect(h.saveSettings).toHaveBeenCalledWith({ dept_id: 'finance', enabled: true });
    expect(screen.getByRole('switch', { name: 'Gunakan batas mingguan' })).not.toBeChecked();
    h.getSettings.mockResolvedValue({ dept_id: 'finance', enabled: false });
    fireEvent.click(screen.getByRole('switch', { name: 'Aktifkan kebijakan penerimaan departemen' }));
    await waitFor(() => expect(h.saveSettings).toHaveBeenLastCalledWith({ dept_id: 'finance', enabled: false }));
    expect(h.remove).not.toHaveBeenCalled(); expect(h.removeWeekly).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled(); expect(h.saveWeekly).not.toHaveBeenCalled();
  });
  it('saves the regular Monday to Thursday weekly window and disabled specific-week bypass separately', async () => {
    mount(); await ready(); await enablePolicy();
    fireEvent.click(screen.getByRole('switch', { name: 'Gunakan batas mingguan' }));
    fireEvent.change(screen.getByLabelText('SLA pengerjaan (menit kerja)'), { target: { value: '180' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan periode' }));
    await waitFor(() => expect(h.saveWeekly).toHaveBeenCalledWith(expect.objectContaining({ week_start: '2000-01-03', enabled: true, open_weekday: 1, open_time: '08:00', cutoff_weekday: 4, cutoff_time: '16:00', sla_minutes: 180 })));
    await ready(); tab('Minggu tertentu');
    fireEvent.change(screen.getByLabelText('Awal minggu pengecualian'), { target: { value: '2026-12-28' } });
    expect(screen.getByRole('switch', { name: 'Gunakan batas mingguan' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Simpan periode' }));
    await waitFor(() => expect(h.saveWeekly).toHaveBeenLastCalledWith(expect.objectContaining({ week_start: '2026-12-28', enabled: false, sla_minutes: null })));
    expect(h.save).not.toHaveBeenCalled();
  });
  it('rejects non-Mondays and same-week reversed windows without a write', async () => {
    mount(); await ready(); await enablePolicy(); tab('Minggu tertentu');
    fireEvent.change(screen.getByLabelText('Awal minggu pengecualian'), { target: { value: '2026-11-06' } });
    expect(screen.getByRole('button', { name: 'Simpan periode' })).toBeDisabled();
    tab('Aturan mingguan'); fireEvent.click(screen.getByRole('switch', { name: 'Gunakan batas mingguan' }));
    fireEvent.change(screen.getByLabelText('Hari buka'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan periode' }));
    expect(await screen.findByText(/Jadwal buka harus sebelum tutup/)).toBeInTheDocument();
    expect(h.saveWeekly).not.toHaveBeenCalled();
  });
  it('preserves monthly regular and specific-month API payloads', async () => {
    mount(); await ready(); await enablePolicy(); tab('Bulanan');
    fireEvent.click(screen.getByRole('button', { name: 'Simpan periode' }));
    await waitFor(() => expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ dept_id: 'finance', period_month: '2000-01-01', enabled: false, cutoff_day: null })));
    await ready(); tab('Bulan tertentu');
    fireEvent.change(screen.getByLabelText('Bulan pengecualian'), { target: { value: '2026-12' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Gunakan batas bulanan' }));
    fireEvent.change(screen.getByLabelText('Tanggal tutup tiap bulan'), { target: { value: '23' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan periode' }));
    await waitFor(() => expect(h.save).toHaveBeenLastCalledWith(expect.objectContaining({ period_month: '2026-12-01', enabled: true, cutoff_day: 23 })));
    expect(h.saveWeekly).not.toHaveBeenCalled();
  });
  it.each(['weekly', 'monthly'])('confirms deletion of only the selected %s exception', async cadence => {
    h.listWeekly.mockResolvedValue([{ ...defaultWeeklyReceivingRule, dept_id: 'finance', week_start: '2026-11-02' }]);
    h.list.mockResolvedValue([{ ...defaultReceivingRule, dept_id: 'finance', period_month: '2026-11-01' }]);
    mount(); await ready(); await enablePolicy();
    if (cadence === 'monthly') tab('Bulanan');
    tab(cadence === 'weekly' ? 'Minggu tertentu' : 'Bulan tertentu');
    fireEvent.change(screen.getByLabelText(cadence === 'weekly' ? 'Awal minggu pengecualian' : 'Bulan pengecualian'), { target: { value: cadence === 'weekly' ? '2026-11-02' : '2026-11' } });
    const remove = await screen.findByRole('button', { name: 'Hapus pengecualian' });
    h.confirm.mockResolvedValueOnce(false); fireEvent.click(remove);
    await waitFor(() => expect(h.confirm).toHaveBeenCalled()); expect(h.remove).not.toHaveBeenCalled(); expect(h.removeWeekly).not.toHaveBeenCalled();
    fireEvent.click(remove);
    await waitFor(() => expect(cadence === 'weekly' ? h.removeWeekly : h.remove).toHaveBeenCalledWith('finance', cadence === 'weekly' ? '2026-11-02' : '2026-11-01'));
  });
  it('fails closed on read errors and supports retry', async () => {
    h.listWeekly.mockRejectedValue(Error('denied')); mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Aturan penerimaan belum dapat dimuat.');
    expect(screen.getByRole('switch', { name: 'Aktifkan kebijakan penerimaan departemen' })).toBeDisabled();
    h.listWeekly.mockResolvedValue([]); fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' })); await ready();
  });
  it('does not declare a failed settings or rule write successful', async () => {
    mount(); await ready(); h.saveSettings.mockRejectedValueOnce(Error('private backend detail'));
    fireEvent.click(screen.getByRole('switch', { name: 'Aktifkan kebijakan penerimaan departemen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Perubahan belum dapat dikonfirmasi');
    expect(screen.getByRole('switch', { name: 'Aktifkan kebijakan penerimaan departemen' })).not.toBeChecked();
    await ready(); await enablePolicy(); h.saveWeekly.mockRejectedValueOnce(Error('denied'));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan periode' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Perubahan belum dapat dikonfirmasi');
    expect(screen.queryByText('Aturan penerimaan tersimpan.')).not.toBeInTheDocument();
  });
});

describe('receiving rule validation', () => {
  it('retains monthly validation', () => {
    const rule = { ...defaultReceivingRule, dept_id: 'finance', period_month: '2026-11-01' };
    expect(validateReceivingRule(rule)).toEqual(rule);
    for (const patch of [{ cutoff_day: 32 }, { reopen_day: 29 }, { cutoff_day: 1, reopen_day: 2 }, { cutoff_day: 1, reopen_day: 1, cutoff_time: '07:00' }, { sla_minutes: 0 }, { period_month: '2026-11-15' }, { cutoff_time: '99:00' }, { message: 'x'.repeat(301) }]) expect(() => validateReceivingRule({ ...rule, ...patch })).toThrow();
  });
  it('validates Monday, weekday bounds, ordered times, leap dates, SLA and message limits', () => {
    const rule = { ...defaultWeeklyReceivingRule, dept_id: 'finance', week_start: '2026-11-02' };
    expect(validateWeeklyReceivingRule(rule)).toEqual(rule);
    expect(validateWeeklyReceivingRule({ ...rule, week_start: '2024-12-30' })).toBeTruthy();
    for (const patch of [{ week_start: '2026-11-06' }, { week_start: '2026-02-30' }, { week_start: '' }, { open_weekday: 0 }, { cutoff_weekday: 8 }, { open_weekday: 4.5 }, { open_weekday: 5 }, { open_weekday: 4, open_time: '16:00:00' }, { cutoff_time: '24:00' }, { sla_minutes: -1 }, { sla_minutes: 1.5 }, { sla_minutes: 525601 }, { message: 'x'.repeat(301) }]) expect(() => validateWeeklyReceivingRule({ ...rule, ...patch })).toThrow();
    expect(validateWeeklyReceivingRule({ ...rule, open_weekday: 4, open_time: '15:59:59', cutoff_time: '16:00' })).toBeTruthy();
  });
});
