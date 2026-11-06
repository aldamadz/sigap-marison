import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ArrowLeft, Loader2, RefreshCw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DepartmentReceivingPolicy } from '@/components/configuration/DepartmentReceivingPolicy';
import { departmentReceivingService } from '@/services/department-receiving.service';
import { departmentKpiService, type DepartmentKpiConfig } from '@/services/department-kpi.service';

export default function DepartmentSlaSettingsPage({ userId }: { userId: string }) {
  const scope = useQuery({
    queryKey: ['department-sla-scope', userId], queryFn: () => departmentReceivingService.getScope(),
    retry: false, gcTime: 0, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: 'always', refetchInterval: 30_000,
  });
  const [selected, setSelected] = useState('');
  const departments = scope.isSuccess && scope.isFetchedAfterMount ? scope.data : [];
  const deptId = departments.some(row => row.dept_id === selected) ? selected : departments[0]?.dept_id;

  return <div className="sigap-page space-y-5">
    <header className="space-y-3">
      <Button asChild variant="ghost" className="px-0"><Link to="/settings"><ArrowLeft className="h-4 w-4" />Pengaturan</Link></Button>
      <h1 className="text-xl font-semibold">SLA departemen</h1>
    </header>
    {scope.isPending || !scope.isFetchedAfterMount ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Memeriksa akses departemen...</p> : scope.isError ?
      <div role="alert" className="space-y-3 text-sm"><p>Akses departemen belum dapat dikonfirmasi.</p><Button variant="outline" onClick={() => { void scope.refetch(); }}><RefreshCw className="h-4 w-4" />Coba lagi</Button></div> : !deptId ?
        <p role="status" className="text-sm text-muted-foreground">Anda tidak memiliki akses pengelolaan SLA departemen.</p> : <>
          <label className="block max-w-md space-y-1.5 text-sm"><span>Departemen</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={deptId} onChange={event => setSelected(event.target.value)}>{departments.map(row => <option key={row.dept_id} value={row.dept_id}>{row.name}</option>)}</select></label>
          <DepartmentEditor key={`${userId}-${deptId}`} userId={userId} deptId={deptId} checkAccess={async () => {
            const result = await scope.refetch();
            return !result.isError && Boolean(result.data?.some(row => row.dept_id === deptId));
          }} />
        </>}
  </div>;
}

function DepartmentEditor({ userId, deptId, checkAccess }: { userId: string; deptId: string; checkAccess: () => Promise<boolean> }) {
  const config = useQuery({
    queryKey: ['department-sla-config', userId, deptId], queryFn: () => departmentKpiService.getConfig(deptId),
    retry: false, gcTime: 0, refetchOnMount: 'always',
  });
  if (config.isError) return <div role="alert" className="space-y-3 text-sm"><p>Konfigurasi SLA belum dapat dimuat.</p><Button variant="outline" onClick={() => { void config.refetch(); }}><RefreshCw className="h-4 w-4" />Coba lagi</Button></div>;
  if (!config.isSuccess || !config.isFetchedAfterMount) return <p role="status" className="text-sm">Memuat konfigurasi SLA...</p>;
  return <div className="space-y-5">
    <ConfigEditor config={config.data} save={async value => {
      if (!await checkAccess()) throw Error('access');
      await departmentKpiService.saveConfig(value);
      const result = await config.refetch();
      if (result.isError) throw Error('reload');
    }} />
    <DepartmentReceivingPolicy key={deptId} deptId={deptId} />
  </div>;
}

function ConfigEditor({ config, save }: { config: DepartmentKpiConfig; save: (value: DepartmentKpiConfig) => Promise<void> }) {
  const [form, setForm] = useState(config);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => { setForm(config); }, [config]);
  const submit = async () => {
    if (busy) return;
    setNotice('');
    setFailed(false);
    const times = [form.work_start, form.work_end, form.break_start, form.break_end];
    const [start, end, breakStart, breakEnd] = times.map(time => time.slice(0, 5));
    let validTimezone = true;
    try { new Intl.DateTimeFormat('id-ID', { timeZone: form.timezone }); } catch { validTimezone = false; }
    if (!Number.isInteger(form.sla_minutes) || form.sla_minutes < 1 || form.sla_minutes > 525600 ||
      !form.work_days.length || !times.every(time => /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) ||
      start >= end || breakStart < start || breakStart >= breakEnd || breakEnd > end || !validTimezone) {
      setFailed(true);
      setNotice('Periksa SLA, hari kerja, urutan jam kerja/istirahat, dan zona waktu.');
      return;
    }
    setBusy(true);
    try {
      await save({ ...form, dept_id: config.dept_id });
      setNotice('Konfigurasi SLA tersimpan.');
    } catch {
      setFailed(true);
      setNotice('Konfigurasi belum dapat dikonfirmasi. Periksa akses lalu coba lagi.');
    } finally {
      setBusy(false);
    }
  };
  const timeFields = [
    ['work_start', 'Mulai kerja'], ['work_end', 'Selesai kerja'],
    ['break_start', 'Mulai istirahat'], ['break_end', 'Selesai istirahat'],
  ] as const;
  return <section className="space-y-4 border-t pt-5" aria-label="SLA dan jam kerja">
    <h2 className="text-base font-semibold">SLA dan jam kerja</h2>
    <fieldset disabled={busy} className="min-w-0 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className="space-y-1.5 text-sm"><span>SLA menit</span><Input type="number" min="1" max="525600" value={form.sla_minutes} onChange={event => setForm(previous => ({ ...previous, sla_minutes: Number(event.target.value) }))} /></label>
        {timeFields.map(([key, label]) => <label key={key} className="space-y-1.5 text-sm"><span>{label}</span><Input type="time" value={form[key].slice(0, 5)} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} /></label>)}
        <label className="space-y-1.5 text-sm"><span>Zona waktu</span><Input value={form.timezone} onChange={event => setForm(previous => ({ ...previous, timezone: event.target.value }))} /></label>
      </div>
      <fieldset className="flex min-w-0 flex-wrap gap-x-5 gap-y-2"><legend className="mb-2 text-sm">Hari kerja</legend>{['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'].map((day, index) => <label key={day} className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={form.work_days.includes(index + 1)} onChange={event => setForm(previous => ({ ...previous, work_days: event.target.checked ? [...previous.work_days, index + 1].sort((a, b) => a - b) : previous.work_days.filter(value => value !== index + 1) }))} />{day}</label>)}</fieldset>
      <Button onClick={() => { void submit(); }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Simpan konfigurasi</Button>
    </fieldset>
    {notice && <p role={failed ? 'alert' : 'status'} className="text-sm">{notice}</p>}
  </section>;
}
