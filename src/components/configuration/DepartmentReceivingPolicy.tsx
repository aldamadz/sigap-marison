import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Loader2, RefreshCw, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppDialog } from '@/components/app/AppDialogProvider';
import {
  departmentReceivingService, defaultReceivingRule, defaultWeeklyReceivingRule,
  regularReceivingMonth, regularReceivingWeek, isReceivingWeekStart, validateReceivingRule, validateWeeklyReceivingRule,
} from '@/services/department-receiving.service';
import { todayWorkDate } from '@/features/work-calendar/lib/work-calendar-date';

const weekdays = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const thisMonday = () => {
  const date = new Date(`${todayWorkDate()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
};

export function DepartmentReceivingPolicy({ deptId }: { deptId: string }) {
  const [cadence, setCadence] = useState('weekly');
  const [mode, setMode] = useState('regular');
  const [month, setMonth] = useState(() => todayWorkDate().slice(0, 7));
  const [week, setWeek] = useState(thisMonday);
  const [monthlyForm, setMonthlyForm] = useState({ ...defaultReceivingRule });
  const [weeklyForm, setWeeklyForm] = useState({ ...defaultWeeklyReceivingRule });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  const [validationError, setValidationError] = useState('');
  const dialog = useAppDialog();
  const monthly = useQuery({ queryKey: ['department-receiving-rules', deptId], queryFn: () => departmentReceivingService.list(deptId), retry: false });
  const weekly = useQuery({ queryKey: ['department-receiving-weekly-rules', deptId], queryFn: () => departmentReceivingService.listWeekly(deptId), retry: false });
  const settings = useQuery({ queryKey: ['department-receiving-settings', deptId], queryFn: () => departmentReceivingService.getSettings(deptId), retry: false });
  const isWeekly = cadence === 'weekly';
  const isSpecific = mode === 'specific';
  const periodMonth = isSpecific ? `${month}-01` : regularReceivingMonth;
  const weekStart = isSpecific ? week : regularReceivingWeek;
  const existingMonthly = monthly.data?.find(row => row.period_month === periodMonth);
  const existingWeekly = weekly.data?.find(row => row.week_start === weekStart);
  const existing = isWeekly ? existingWeekly : existingMonthly;
  const queries = [monthly, weekly, settings];
  const unavailable = queries.some(query => query.isError);
  const loading = queries.some(query => query.isPending || !query.isFetchedAfterMount);
  const enabled = settings.data?.enabled === true;
  const locked = busy || loading || unavailable;
  const ruleEnabled = isWeekly ? weeklyForm.enabled : monthlyForm.enabled;
  const fieldsDisabled = locked || !enabled || !ruleEnabled;
  const invalidPeriod = isSpecific && (isWeekly ? !isReceivingWeekStart(week) || week === regularReceivingWeek : !month || periodMonth === regularReceivingMonth);

  useEffect(() => {
    setMonthlyForm(existingMonthly ? { ...existingMonthly, cutoff_time: existingMonthly.cutoff_time.slice(0, 5), reopen_time: existingMonthly.reopen_time.slice(0, 5) } : { ...defaultReceivingRule });
  }, [existingMonthly, periodMonth, deptId]);
  useEffect(() => {
    setWeeklyForm(existingWeekly ? { ...existingWeekly, open_time: existingWeekly.open_time.slice(0, 5), cutoff_time: existingWeekly.cutoff_time.slice(0, 5) } : { ...defaultWeeklyReceivingRule });
  }, [existingWeekly, weekStart, deptId]);
  useEffect(() => { setNotice(''); }, [cadence, mode, week, month, deptId]);

  const run = async (action: () => Promise<void>, success: string) => {
    if (locked) return;
    setBusy(true);
    setNotice('');
    setFailed(false);
    try {
      await action();
      const results = await Promise.all(queries.map(query => query.refetch()));
      if (results.some(result => result.isError)) throw Error('Perubahan tersimpan, tetapi data terbaru belum dapat dimuat. Coba lagi.');
      setNotice(success);
    } catch {
      setFailed(true);
      setNotice('Perubahan belum dapat dikonfirmasi. Muat ulang data lalu coba lagi.');
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    try {
      const weeklyRule = { ...weeklyForm, dept_id: deptId, week_start: weekStart };
      const monthlyRule = { ...monthlyForm, dept_id: deptId, period_month: periodMonth };
      if (isWeekly) validateWeeklyReceivingRule(weeklyRule);
      else validateReceivingRule(monthlyRule);
      await run(() => isWeekly ? departmentReceivingService.saveWeekly(weeklyRule) : departmentReceivingService.save(monthlyRule), 'Aturan penerimaan tersimpan.');
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Periksa aturan penerimaan.');
    }
  };
  const remove = async () => {
    if (!existing || locked || !enabled) return;
    const selectedCadence = cadence;
    const selectedPeriod = isWeekly ? weekStart : periodMonth;
    if (!await dialog.confirm({
      title: isWeekly ? 'Hapus pengecualian minggu ini?' : 'Hapus pengecualian bulan ini?',
      description: 'Aturan reguler akan digunakan kembali. Pengajuan yang sudah berjalan tidak berubah.',
      confirmText: 'Hapus pengecualian',
    })) return;
    await run(() => selectedCadence === 'weekly'
      ? departmentReceivingService.removeWeekly(deptId, selectedPeriod)
      : departmentReceivingService.remove(deptId, selectedPeriod), 'Pengecualian dihapus.');
  };
  const setSharedField = (key: 'enabled' | 'sla_minutes' | 'message', value: boolean | number | string | null) => {
    if (isWeekly) setWeeklyForm(previous => ({ ...previous, [key]: value }));
    else setMonthlyForm(previous => ({ ...previous, [key]: value }));
  };
  const form = isWeekly ? weeklyForm : monthlyForm;
  useEffect(() => { setValidationError(''); }, [weeklyForm, monthlyForm, cadence, mode, week, month]);

  return <section className="space-y-4 border-t pt-5" aria-label="Periode penerimaan">
    <h2 className="flex items-center gap-2 text-base font-semibold"><CalendarDays className="h-5 w-5" aria-hidden="true" />Periode penerimaan</h2>
    <label className="flex max-w-xl items-center justify-between gap-3 text-sm">
      <span>Aktifkan kebijakan penerimaan departemen</span>
      <Switch aria-label="Aktifkan kebijakan penerimaan departemen" checked={enabled} disabled={locked}
        onCheckedChange={value => { void run(() => departmentReceivingService.saveSettings({ dept_id: deptId, enabled: value }), value ? 'Kebijakan penerimaan diaktifkan.' : 'Kebijakan penerimaan dinonaktifkan. Aturan tetap tersimpan.'); }} />
    </label>
    {loading && <p role="status" className="text-sm text-muted-foreground">Memuat aturan penerimaan...</p>}
    {unavailable && <div role="alert" className="space-y-2 text-sm"><p>Aturan penerimaan belum dapat dimuat.</p><Button variant="outline" disabled={busy} onClick={() => { void Promise.all(queries.map(query => query.refetch())); }}><RefreshCw className="h-4 w-4" />Coba lagi</Button></div>}
    <fieldset disabled={locked || !enabled} className="min-w-0 space-y-4 disabled:opacity-60">
      <Tabs value={cadence} onValueChange={setCadence}><TabsList aria-label="Jenis periode"><TabsTrigger value="weekly" disabled={locked || !enabled}>Mingguan</TabsTrigger><TabsTrigger value="monthly" disabled={locked || !enabled}>Bulanan</TabsTrigger></TabsList>
      <TabsContent value={cadence} className="space-y-4">
      <Tabs value={mode} onValueChange={setMode}><TabsList aria-label="Cakupan aturan" className="h-auto max-w-full flex-wrap"><TabsTrigger value="regular" disabled={locked || !enabled}>{isWeekly ? 'Aturan mingguan' : 'Aturan bulanan'}</TabsTrigger><TabsTrigger value="specific" disabled={locked || !enabled}>{isWeekly ? 'Minggu tertentu' : 'Bulan tertentu'}</TabsTrigger></TabsList>
      <TabsContent value={mode} className="space-y-4">
      {isSpecific && <label className="block max-w-xs space-y-1.5 text-sm"><span>{isWeekly ? 'Minggu mulai (Senin)' : 'Bulan'}</span><Input type={isWeekly ? 'date' : 'month'} aria-label={isWeekly ? 'Awal minggu pengecualian' : 'Bulan pengecualian'} value={isWeekly ? week : month} onChange={event => isWeekly ? setWeek(event.target.value) : setMonth(event.target.value)} /></label>}
      {invalidPeriod && <p role="alert" className="text-sm text-destructive">{isWeekly ? 'Pilih tanggal Senin untuk minggu tertentu.' : 'Pilih bulan pengecualian.'}</p>}
      <label className="flex max-w-xl items-center justify-between gap-3 text-sm"><span>{isWeekly ? 'Gunakan batas mingguan' : 'Gunakan batas bulanan'}</span><Switch checked={ruleEnabled} disabled={locked || !enabled} onCheckedChange={value => setSharedField('enabled', value)} aria-label={isWeekly ? 'Gunakan batas mingguan' : 'Gunakan batas bulanan'} /></label>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {isWeekly ? <>
          <WeekdayField label="Hari buka" value={weeklyForm.open_weekday} disabled={fieldsDisabled} onChange={value => setWeeklyForm(previous => ({ ...previous, open_weekday: value }))} />
          <label className="space-y-1.5 text-sm"><span>Jam buka</span><Input type="time" value={weeklyForm.open_time} disabled={fieldsDisabled} onChange={event => setWeeklyForm(previous => ({ ...previous, open_time: event.target.value }))} /></label>
          <WeekdayField label="Hari tutup" value={weeklyForm.cutoff_weekday} disabled={fieldsDisabled} onChange={value => setWeeklyForm(previous => ({ ...previous, cutoff_weekday: value }))} />
          <label className="space-y-1.5 text-sm"><span>Jam tutup</span><Input type="time" value={weeklyForm.cutoff_time} disabled={fieldsDisabled} onChange={event => setWeeklyForm(previous => ({ ...previous, cutoff_time: event.target.value }))} /></label>
        </> : <>
          <label className="space-y-1.5 text-sm"><span>Tanggal buka kembali</span><Input type="number" min="1" max="28" value={monthlyForm.reopen_day} disabled={fieldsDisabled} onChange={event => setMonthlyForm(previous => ({ ...previous, reopen_day: Number(event.target.value) }))} /></label>
          <label className="space-y-1.5 text-sm"><span>Jam buka kembali</span><Input type="time" value={monthlyForm.reopen_time} disabled={fieldsDisabled} onChange={event => setMonthlyForm(previous => ({ ...previous, reopen_time: event.target.value }))} /></label>
          <label className="space-y-1.5 text-sm"><span>Tanggal tutup tiap bulan</span><Input type="number" min="1" max="31" placeholder="Tanpa batas" value={monthlyForm.cutoff_day ?? ''} disabled={fieldsDisabled} onChange={event => setMonthlyForm(previous => ({ ...previous, cutoff_day: event.target.value ? Number(event.target.value) : null }))} /></label>
          <label className="space-y-1.5 text-sm"><span>Jam tutup</span><Input type="time" value={monthlyForm.cutoff_time} disabled={fieldsDisabled} onChange={event => setMonthlyForm(previous => ({ ...previous, cutoff_time: event.target.value }))} /></label>
        </>}
      </div>
      <label className="block max-w-xs space-y-1.5 text-sm"><span>SLA pengerjaan (menit kerja)</span><Input type="number" min="1" max="525600" placeholder="Ikuti SLA departemen" value={form.sla_minutes ?? ''} disabled={fieldsDisabled} onChange={event => setSharedField('sla_minutes', event.target.value ? Number(event.target.value) : null)} /></label>
      <label className="block space-y-1.5 text-sm"><span>Pesan untuk pemohon</span><Textarea maxLength={300} value={form.message} disabled={fieldsDisabled} onChange={event => setSharedField('message', event.target.value)} /></label>
      <div className="flex flex-wrap gap-2"><Button disabled={locked || !enabled || invalidPeriod} onClick={() => { void save(); }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Simpan periode</Button>{isSpecific && existing && <Button variant="outline" disabled={locked || !enabled} onClick={() => { void remove(); }}><Trash2 className="h-4 w-4" />Hapus pengecualian</Button>}</div>
      </TabsContent></Tabs>
      </TabsContent></Tabs>
    </fieldset>
    {validationError && <p role="alert" className="text-sm text-destructive">{validationError}</p>}
    {notice && <p role={failed ? 'alert' : 'status'} className="text-sm">{notice}</p>}
  </section>;
}

function WeekdayField({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (value: number) => void }) {
  return <label className="space-y-1.5 text-sm"><span>{label}</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50" value={value} disabled={disabled} onChange={event => onChange(Number(event.target.value))}>{weekdays.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></label>;
}
