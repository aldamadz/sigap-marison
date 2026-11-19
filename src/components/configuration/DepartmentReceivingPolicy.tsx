import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
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
  type ReceivingTarget,
} from '@/services/department-receiving.service';
import { todayWorkDate } from '@/features/work-calendar/lib/work-calendar-date';

const weekdays = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const thisMonday = () => {
  const date = new Date(`${todayWorkDate()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
};

export function DepartmentReceivingPolicy({ deptId, allowSignerOverride = false, departmentField }: {
  deptId: string; allowSignerOverride?: boolean; departmentField?: ReactNode;
}) {
  const [selection, setSelection] = useState({ deptId, value: '' });
  const selected = selection.deptId === deptId ? selection.value : '';
  const options = useQuery({
    queryKey: ['department-receiving-options', deptId],
    queryFn: () => departmentReceivingService.getScopeOptions(deptId),
    retry: false,
  });
  const target = options.data?.find(option => `${option.kind}:${option.id}` === selected);
  return <section className="space-y-5 border-t pt-5" aria-label="Periode penerimaan">
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 text-base font-semibold"><CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />Periode penerimaan</h2>
      <div className={departmentField ? 'grid max-w-3xl gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]' : 'max-w-xl'}>
        {departmentField}
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          <span>Berlaku untuk</span>
          <select className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal" value={target ? selected : ''}
            disabled={options.isPending || options.isError} onChange={event => setSelection({ deptId, value: event.target.value })}>
            <option value="">Semua pengajuan (aturan umum)</option>
            {(['form', 'usage'] as const).map(kind => <optgroup key={kind} label={kind === 'form' ? 'Form' : 'Kegunaan'}>
              {options.data?.filter(option => option.kind === kind).map(option => <option key={option.id} value={`${kind}:${option.id}`}>{option.label}</option>)}
            </optgroup>)}
          </select>
        </label>
      </div>
    </div>
    {options.isError && <div className="flex flex-wrap items-center gap-3 text-sm" role="alert">
      Pilihan form dan kegunaan belum dapat dimuat.
      <Button size="sm" variant="outline" onClick={() => { void options.refetch(); }}>Muat ulang pilihan</Button>
    </div>}
    <ReceivingWindowEditor key={`${deptId}:${target?.kind ?? 'general'}:${target?.id ?? ''}`} deptId={deptId} target={target} allowSignerOverride={allowSignerOverride} />
  </section>;
}

function ReceivingWindowEditor({ deptId, target, allowSignerOverride }: { deptId: string; target?: ReceivingTarget; allowSignerOverride: boolean }) {
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
  const monthly = useQuery({ queryKey: ['department-receiving-rules', deptId, target?.kind, target?.id], queryFn: () => target ? departmentReceivingService.list(deptId, target) : departmentReceivingService.list(deptId), retry: false });
  const weekly = useQuery({ queryKey: ['department-receiving-weekly-rules', deptId, target?.kind, target?.id], queryFn: () => target ? departmentReceivingService.listWeekly(deptId, target) : departmentReceivingService.listWeekly(deptId), retry: false });
  const settings = useQuery({ queryKey: ['department-receiving-settings', deptId], queryFn: () => departmentReceivingService.getSettings(deptId), enabled: !target, retry: false });
  const isWeekly = cadence === 'weekly';
  const isSpecific = mode === 'specific';
  const periodMonth = isSpecific ? `${month}-01` : regularReceivingMonth;
  const weekStart = isSpecific ? week : regularReceivingWeek;
  const existingMonthly = monthly.data?.find(row => row.period_month === periodMonth);
  const existingWeekly = weekly.data?.find(row => row.week_start === weekStart);
  const existing = isWeekly ? existingWeekly : existingMonthly;
  const queries = target ? [monthly, weekly] : [monthly, weekly, settings];
  const unavailable = queries.some(query => query.isError);
  const loading = queries.some(query => query.isPending || !query.isFetchedAfterMount);
  const enabled = Boolean(target) || settings.data?.enabled === true;
  const weeklyManagedByAdmin = !allowSignerOverride && !target && weekly.data?.some(rule => rule.sla_minutes !== null);
  const monthlyManagedByAdmin = !allowSignerOverride && !target && monthly.data?.some(rule => rule.sla_minutes !== null);
  const managedByAdmin = weeklyManagedByAdmin || monthlyManagedByAdmin;
  const ruleManagedByAdmin = isWeekly ? weeklyManagedByAdmin : monthlyManagedByAdmin;
  const canRemove = Boolean(existing && (target || isSpecific && (allowSignerOverride || existing.sla_minutes === null)));
  const locked = busy || loading || unavailable;
  const ruleEnabled = isWeekly ? weeklyForm.enabled : monthlyForm.enabled;
  const fieldsDisabled = locked || !enabled || !ruleEnabled || ruleManagedByAdmin;
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
    if (ruleManagedByAdmin) return;
    try {
      const weeklyRule = { ...weeklyForm, dept_id: deptId, week_start: weekStart };
      const monthlyRule = { ...monthlyForm, dept_id: deptId, period_month: periodMonth };
      if (isWeekly) validateWeeklyReceivingRule(weeklyRule);
      else validateReceivingRule(monthlyRule);
      await run(() => isWeekly
        ? target || !allowSignerOverride ? departmentReceivingService.saveWeekly(weeklyRule, target, !allowSignerOverride) : departmentReceivingService.saveWeekly(weeklyRule)
        : target || !allowSignerOverride ? departmentReceivingService.save(monthlyRule, target, !allowSignerOverride) : departmentReceivingService.save(monthlyRule),
      'Aturan penerimaan tersimpan.');
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Periksa aturan penerimaan.');
    }
  };
  const remove = async () => {
    if (!canRemove || locked || !enabled || ruleManagedByAdmin) return;
    const selectedCadence = cadence;
    const selectedPeriod = isWeekly ? weekStart : periodMonth;
    if (!await dialog.confirm({
      title: target && !isSpecific ? 'Hapus aturan khusus ini?' : isWeekly ? 'Hapus pengecualian minggu ini?' : 'Hapus pengecualian bulan ini?',
      description: 'Aturan yang berlaku berikutnya digunakan. Jadwal yang sudah ditetapkan tidak berubah.',
      confirmText: 'Hapus aturan',
    })) return;
    await run(() => selectedCadence === 'weekly'
      ? target ? departmentReceivingService.removeWeekly(deptId, selectedPeriod, target) : departmentReceivingService.removeWeekly(deptId, selectedPeriod)
      : target ? departmentReceivingService.remove(deptId, selectedPeriod, target) : departmentReceivingService.remove(deptId, selectedPeriod),
    target ? 'Aturan khusus dihapus.' : 'Pengecualian dihapus.');
  };
  const setSharedField = (key: 'enabled' | 'sla_minutes' | 'message', value: boolean | number | string | null) => {
    if (isWeekly) setWeeklyForm(previous => ({ ...previous, [key]: value }));
    else setMonthlyForm(previous => ({ ...previous, [key]: value }));
  };
  const form = isWeekly ? weeklyForm : monthlyForm;
  useEffect(() => { setValidationError(''); }, [weeklyForm, monthlyForm, cadence, mode, week, month]);

  return <div className="space-y-5">
    {!target && <label className="flex min-h-12 items-center justify-between gap-3 rounded-md border bg-background px-3 py-2.5 text-sm font-medium">
      <span>Aktifkan kebijakan penerimaan departemen</span>
      <Switch className="shrink-0" aria-label="Aktifkan kebijakan penerimaan departemen" checked={enabled} disabled={locked || managedByAdmin}
        onCheckedChange={value => { void run(() => departmentReceivingService.saveSettings({ dept_id: deptId, enabled: value }), value ? 'Kebijakan penerimaan diaktifkan.' : 'Kebijakan penerimaan dinonaktifkan. Aturan tetap tersimpan.'); }} />
    </label>}
    {managedByAdmin && <p className="text-sm text-muted-foreground">Status kebijakan umum hanya dapat diubah admin karena terhubung ke SLA penandatangan.</p>}
    {loading && <p role="status" className="text-sm text-muted-foreground">Memuat aturan penerimaan...</p>}
    {unavailable && <div role="alert" className="space-y-2 text-sm"><p>Aturan penerimaan belum dapat dimuat.</p><Button variant="outline" disabled={busy} onClick={() => { void Promise.all(queries.map(query => query.refetch())); }}><RefreshCw className="h-4 w-4" />Coba lagi</Button></div>}
    <fieldset disabled={locked || !enabled} className="min-w-0">
      <Tabs value={cadence} onValueChange={setCadence}>
        <TabsList aria-label="Jenis periode" className="grid h-10 w-full grid-cols-2 rounded-md border sm:w-64">
          <TabsTrigger value="weekly" disabled={locked || !enabled}>Mingguan</TabsTrigger>
          <TabsTrigger value="monthly" disabled={locked || !enabled}>Bulanan</TabsTrigger>
        </TabsList>
        <TabsContent value={cadence} className="mt-4">
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList aria-label="Cakupan aturan" className="grid h-10 w-full grid-cols-2 rounded-md border sm:w-auto sm:inline-grid">
              <TabsTrigger value="regular" disabled={locked || !enabled}>{isWeekly ? 'Aturan mingguan' : 'Aturan bulanan'}</TabsTrigger>
              <TabsTrigger value="specific" disabled={locked || !enabled}>{isWeekly ? 'Minggu tertentu' : 'Bulan tertentu'}</TabsTrigger>
            </TabsList>
            <TabsContent value={mode} className="mt-4 space-y-5">
              {isSpecific && <label className="block max-w-xs space-y-1.5 text-sm"><span>{isWeekly ? 'Minggu mulai (Senin)' : 'Bulan'}</span><Input type={isWeekly ? 'date' : 'month'} aria-label={isWeekly ? 'Awal minggu pengecualian' : 'Bulan pengecualian'} value={isWeekly ? week : month} onChange={event => isWeekly ? setWeek(event.target.value) : setMonth(event.target.value)} /></label>}
              {invalidPeriod && <p role="alert" className="text-sm text-destructive">{isWeekly ? 'Pilih tanggal Senin untuk minggu tertentu.' : 'Pilih bulan pengecualian.'}</p>}
              <label className="flex min-h-12 items-center justify-between gap-3 border-y py-2 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium">{isWeekly ? 'Gunakan batas mingguan' : 'Gunakan batas bulanan'}</span>
                  {target && !locked && <span className="mt-0.5 block text-xs text-muted-foreground">
                    {ruleEnabled !== (existing?.enabled ?? false) ? 'Perubahan belum disimpan'
                      : existing ? existing.enabled ? 'Jadwal khusus tersimpan' : 'Tanpa batas pada periode ini'
                      : 'Mengikuti aturan yang lebih umum'}
                  </span>}
                </span>
                <Switch className="shrink-0" checked={ruleEnabled} disabled={locked || !enabled || ruleManagedByAdmin} onCheckedChange={value => setSharedField('enabled', value)} aria-label={isWeekly ? 'Gunakan batas mingguan' : 'Gunakan batas bulanan'} />
              </label>
              <div className="grid gap-5 md:grid-cols-2 md:gap-6">
                <ReceivingHours title="Buka penerimaan">
                  {isWeekly ? <WeekdayField label="Hari buka" value={weeklyForm.open_weekday} disabled={fieldsDisabled} onChange={value => setWeeklyForm(previous => ({ ...previous, open_weekday: value }))} />
                    : <label className="space-y-1.5 text-sm"><span>Tanggal buka kembali</span><Input type="number" min="1" max="28" value={monthlyForm.reopen_day} disabled={fieldsDisabled} onChange={event => setMonthlyForm(previous => ({ ...previous, reopen_day: Number(event.target.value) }))} /></label>}
                  <label className="space-y-1.5 text-sm"><span>{isWeekly ? 'Jam buka' : 'Jam buka kembali'}</span>
                    <Input type="time" className="min-w-0" value={isWeekly ? weeklyForm.open_time : monthlyForm.reopen_time} disabled={fieldsDisabled}
                      onChange={event => isWeekly
                        ? setWeeklyForm(previous => ({ ...previous, open_time: event.target.value }))
                        : setMonthlyForm(previous => ({ ...previous, reopen_time: event.target.value }))} />
                  </label>
                </ReceivingHours>
                <ReceivingHours title="Tutup penerimaan">
                  {isWeekly ? <WeekdayField label="Hari tutup" value={weeklyForm.cutoff_weekday} disabled={fieldsDisabled} onChange={value => setWeeklyForm(previous => ({ ...previous, cutoff_weekday: value }))} />
                    : <label className="space-y-1.5 text-sm"><span>Tanggal tutup tiap bulan</span><Input type="number" min="1" max="31" placeholder="Tanpa batas" value={monthlyForm.cutoff_day ?? ''} disabled={fieldsDisabled} onChange={event => setMonthlyForm(previous => ({ ...previous, cutoff_day: event.target.value ? Number(event.target.value) : null }))} /></label>}
                  <label className="space-y-1.5 text-sm"><span>Jam tutup</span>
                    <Input type="time" className="min-w-0" value={form.cutoff_time} disabled={fieldsDisabled}
                      onChange={event => isWeekly
                        ? setWeeklyForm(previous => ({ ...previous, cutoff_time: event.target.value }))
                        : setMonthlyForm(previous => ({ ...previous, cutoff_time: event.target.value }))} />
                  </label>
                </ReceivingHours>
              </div>
              {allowSignerOverride && !target && <label className="block max-w-xs space-y-1.5 text-sm"><span>SLA pengerjaan (menit kerja)</span><Input type="number" min="1" max="525600" placeholder="Ikuti SLA departemen" value={form.sla_minutes ?? ''} disabled={fieldsDisabled} onChange={event => setSharedField('sla_minutes', event.target.value ? Number(event.target.value) : null)} /></label>}
              <label className="block space-y-1.5 text-sm">
                <span className="flex flex-wrap items-baseline gap-x-2 font-medium">Pesan untuk pemohon <span className="text-xs font-normal text-muted-foreground" aria-hidden="true">Opsional</span></span>
                <Textarea className="min-h-20" maxLength={300} value={form.message} disabled={fieldsDisabled} onChange={event => setSharedField('message', event.target.value)} />
              </label>
              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Button disabled={locked || !enabled || invalidPeriod || ruleManagedByAdmin} onClick={() => { void save(); }}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Simpan periode
                </Button>
                {canRemove && <Button variant="outline" disabled={locked || !enabled || ruleManagedByAdmin} onClick={() => { void remove(); }}>
                  <Trash2 className="h-4 w-4" />{target && !isSpecific ? 'Hapus aturan khusus' : 'Hapus pengecualian'}
                </Button>}
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </fieldset>
    {validationError && <p role="alert" className="text-sm text-destructive">{validationError}</p>}
    {notice && <p role={failed ? 'alert' : 'status'} className="text-sm">{notice}</p>}
  </div>;
}

function ReceivingHours({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className="min-w-0 border-t">
    <legend className="pr-3 text-sm font-semibold">{title}</legend>
    <div className="grid grid-cols-2 items-end gap-3 pt-3 [&>label]:min-w-0">{children}</div>
  </fieldset>;
}

function WeekdayField({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (value: number) => void }) {
  return <label className="space-y-1.5 text-sm"><span>{label}</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50" value={value} disabled={disabled} onChange={event => onChange(Number(event.target.value))}>{weekdays.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></label>;
}
