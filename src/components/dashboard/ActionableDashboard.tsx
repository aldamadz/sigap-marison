import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { addMonths, format, startOfMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { ArrowRight, BellRing, Building2, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FilePenLine, FileText, Inbox, RefreshCw, Search, Timer, TriangleAlert, Undo2, Users, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/Breadcrumbs';
import { cn } from '@/lib/utils';
import { dashboardRowLink, getActionableDashboard, remindDashboardRequest, type DashboardBucket, type DashboardRow, type DashboardScope } from '@/services/actionable-dashboard.service';
import { todayWorkDate } from '@/features/work-calendar/lib/work-calendar-date';
import { toast } from 'sonner';

export const DASHBOARD_BUCKET_LABELS: Record<DashboardBucket, string> = {
  all: 'Semua', active: 'Antrean aktif', ready: 'Perlu tanda tangan', blocked: 'Menunggu kelengkapan',
  upcoming: 'Belum sampai tahap saya', waiting: 'Menunggu persetujuan', returned: 'Perlu perbaikan',
  completed: 'Selesai', rejected: 'Ditolak', within_sla: 'Dalam SLA', overdue: 'Melewati SLA',
};
const summaryCards = (scope: DashboardScope) => scope === 'signer'
  ? [{ key: 'ready', icon: FilePenLine }, { key: 'upcoming', icon: Inbox }, { key: 'blocked', icon: Clock3 }, { key: 'completed', icon: CheckCircle2 }]
  : [{ key: 'active', icon: Clock3 }, { key: 'returned', icon: Undo2 }, { key: 'completed', icon: CheckCircle2 }, { key: 'rejected', icon: XCircle }];

const metricIcons: Record<string, string> = {
  active: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  ready: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  upcoming: 'bg-muted text-muted-foreground',
  blocked: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  returned: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  rejected: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
};

const workDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes.toLocaleString('id-ID')} menit`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours.toLocaleString('id-ID')} jam${remainder ? ` ${remainder} menit` : ''}`;
};

export const DashboardSla = ({ row }: { row: DashboardRow }) => {
  if (row.bucket === 'returned') return <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"><Undo2 className="h-3.5 w-3.5" />Dijeda untuk perbaikan</span>;
  if (row.elapsed_minutes === null) return <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{['completed', 'rejected'].includes(row.bucket) ? 'Tidak terukur' : 'Belum mulai'}</span>;
  const late = row.elapsed_minutes > row.sla_minutes;
  const difference = Math.abs(row.elapsed_minutes - row.sla_minutes);
  return <div className="space-y-2 text-xs"><span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 font-medium', late ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300')}>
    {late ? <TriangleAlert className="h-3.5 w-3.5" /> : <Timer className="h-3.5 w-3.5" />}
    {late ? 'Melewati SLA' : 'Dalam SLA'}</span>
    <div className="max-w-44 text-muted-foreground">{row.bucket === 'completed' ? `${workDuration(row.elapsed_minutes)} kerja` : `${late ? 'Lewat' : 'Sisa'} ${workDuration(difference)} kerja`}</div></div>;
};

export function ActionableDashboard({ userId }: { userId: string }) {
  const [scope, setScope] = useState<DashboardScope>('mine');
  const [bucket, setBucket] = useState<DashboardBucket>('active');
  const [month, setMonth] = useState(() => startOfMonth(new Date(`${todayWorkDate()}T12:00:00`)));
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [reminding, setReminding] = useState<string | null>(null);
  const remind = async (row: DashboardRow) => {
    setReminding(row.id);
    try {
      const result = await remindDashboardRequest(row.id);
      toast.success(result.sent ? `Pengingat dikirim ke ${result.recipient}.` : `${result.recipient} sudah diingatkan dalam 6 jam terakhir.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Pengingat belum dapat dikirim.'); }
    finally { setReminding(null); }
  };
  const deferredSearch = useDeferredValue(search);
  const from = new Date(`${format(month, 'yyyy-MM')}-01T00:00:00+07:00`).toISOString();
  const to = new Date(`${format(addMonths(month, 1), 'yyyy-MM')}-01T00:00:00+07:00`).toISOString();
  const query = useQuery({
    queryKey: ['actionable-dashboard', userId, scope, bucket, from, to, deferredSearch, page],
    queryFn: ({ signal }) => getActionableDashboard({ scope, bucket, from, to, search: deferredSearch, page, signal }),
    enabled: Boolean(userId), staleTime: 20_000, refetchInterval: 60_000,
  });
  const data = query.data;
  const selectBucket = (value: DashboardBucket) => { setBucket(value); setPage(1); };
  const initialTabChosen = useRef(false);
  const changeScope = (value: DashboardScope) => { initialTabChosen.current = true; setScope(value); selectBucket(value === 'signer' ? 'ready' : 'active'); setSearch(''); };
  useEffect(() => {
    if (!data || initialTabChosen.current) return;
    initialTabChosen.current = true;
    if (data.has_signatures) { setScope('signer'); setBucket('ready'); setPage(1); }
  }, [data]);
  const completedMeasured = data?.summary.completed_measured ?? 0;
  const onTime = data?.summary.completed_on_time ?? 0;
  const onTimePercent = completedMeasured ? Math.round(onTime / completedMeasured * 100) : null;
  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / 12));
  useEffect(() => { if (data && !query.isFetching && page > totalPages) setPage(totalPages); }, [data, query.isFetching, page, totalPages]);
  return <>
    <PageHeader title="Dashboard" subtitle="Pengajuan dan tindak lanjut">
      <Button asChild size="sm"><Link to="/surat/registrasi"><FilePenLine className="mr-2 h-4 w-4" />Buat pengajuan</Link></Button>
    </PageHeader>
    <Tabs value={scope} onValueChange={value => changeScope(value as DashboardScope)} aria-label="Pemantauan pengajuan" className="space-y-5">
      <div className="flex items-start justify-between gap-2 border-b border-border pb-3 sm:items-center sm:gap-4">
        <TabsList className="grid h-auto min-w-0 flex-1 grid-cols-3 gap-1 rounded-lg border border-dashed border-input bg-muted/30 p-1 sm:flex sm:flex-none sm:flex-wrap sm:justify-start" aria-label="Lingkup pengajuan">
          {([{ value: 'mine', label: 'Pengajuan saya', icon: FilePenLine }, { value: 'signer', label: 'Tanda tangan saya', icon: Inbox }, { value: 'team', label: 'Departemen / kantor', icon: Users }] as const).map(tab =>
            <TabsTrigger key={tab.value} value={tab.value} className="min-h-16 min-w-0 flex-col gap-1 whitespace-normal px-2 text-center text-xs data-[state=active]:text-primary sm:min-h-10 sm:flex-row sm:gap-2 sm:px-3 sm:text-left sm:text-sm">
              <tab.icon className="h-4 w-4 shrink-0" />{tab.label}</TabsTrigger>)}
        </TabsList>
        <Button variant="ghost" size="icon" title="Muat ulang ringkasan" aria-label="Muat ulang ringkasan" disabled={query.isFetching} onClick={() => { void query.refetch(); }}>
          <RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} /></Button>
      </div>
      <TabsContent value={scope} className="space-y-5">
      {scope === 'team' && data && <h2 className="flex items-center gap-2 text-base font-semibold"><Building2 className="h-4 w-4" />{data.team_label}</h2>}
      {query.isError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 p-4">
        <p className="text-sm">Ringkasan pengajuan gagal dimuat.</p><Button variant="outline" size="sm" onClick={() => { void query.refetch(); }}>Coba lagi</Button>
      </div> : <>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Ringkasan pengajuan">
          {summaryCards(scope).map(card => <button key={card.key} onClick={() => selectBucket(card.key as DashboardBucket)}
            aria-pressed={bucket === card.key} className={cn('group min-h-28 min-w-0 rounded-lg border bg-card p-4 text-left shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-32 sm:p-5', bucket === card.key ? 'border-primary ring-1 ring-primary/30' : 'border-border hover:border-primary/50')}>
            <div className="mb-3 flex items-start justify-between gap-2 sm:mb-4"><span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', metricIcons[card.key])}><card.icon className="h-4 w-4" /></span>
              <ArrowRight aria-hidden="true" className={cn('h-4 w-4 shrink-0 transition-colors', bucket === card.key ? 'text-primary' : 'text-muted-foreground/50 group-hover:text-primary')} /></div>
            <div className="mb-1 text-2xl font-semibold tabular-nums sm:text-3xl">{query.isPending ? <span className="block h-9 w-16 animate-pulse rounded bg-muted" /> : data?.summary[card.key as keyof typeof data.summary] ?? 0}</div>
            <span className="text-sm font-medium text-muted-foreground">{DASHBOARD_BUCKET_LABELS[card.key as DashboardBucket]}</span>
          </button>)}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3" aria-label="SLA pengajuan">
          <button onClick={() => selectBucket('within_sla')} aria-pressed={bucket === 'within_sla'} className={cn('group flex min-w-0 items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-4 sm:p-4', bucket === 'within_sla' ? 'border-emerald-600 ring-1 ring-emerald-600/30' : 'border-border')}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 sm:h-10 sm:w-10"><Timer className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><div className="mb-1 text-xs text-muted-foreground sm:text-sm">Antrean dalam SLA</div><strong className="text-2xl font-semibold tabular-nums">{data?.summary.within_sla ?? '—'}</strong></div>
            <ArrowRight aria-hidden="true" className="hidden h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-emerald-700 sm:block dark:group-hover:text-emerald-300" /></button>
          <button onClick={() => selectBucket('overdue')} aria-pressed={bucket === 'overdue'} className={cn('group flex min-w-0 items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-4 sm:p-4', bucket === 'overdue' ? 'border-red-600 ring-1 ring-red-600/30' : 'border-border')}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300 sm:h-10 sm:w-10"><TriangleAlert className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><div className="mb-1 text-xs text-muted-foreground sm:text-sm">Antrean melewati SLA</div><strong className={cn('text-2xl font-semibold tabular-nums', !!data?.summary.overdue && 'text-red-700 dark:text-red-300')}>{data?.summary.overdue ?? '—'}</strong></div>
            <ArrowRight aria-hidden="true" className="hidden h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-red-700 sm:block dark:group-hover:text-red-300" /></button>
          <div className="col-span-2 flex min-w-0 items-center gap-4 rounded-lg border border-border bg-card p-4 md:col-span-1"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"><CheckCircle2 className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><div className="mb-1 text-sm text-muted-foreground">Selesai tepat waktu</div>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><strong className="text-2xl font-semibold tabular-nums">{onTimePercent === null ? '—' : `${onTimePercent}%`}</strong>
                <span className="text-xs text-muted-foreground">{completedMeasured ? `${onTime} dari ${completedMeasured} pengajuan terukur` : 'Belum ada pengajuan terukur'}</span></div>
              {onTimePercent !== null && <div role="meter" aria-label="Selesai tepat waktu" aria-valuemin={0} aria-valuemax={100} aria-valuenow={onTimePercent} className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-blue-600 dark:bg-blue-400" style={{ width: `${onTimePercent}%` }} /></div>}
            </div></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">{DASHBOARD_BUCKET_LABELS[bucket]} <span className="inline-flex min-w-7 items-center justify-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">{data?.count ?? 0}</span></h2>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="mr-1">Riwayat selesai / ditolak</span>
            <div className="flex items-center rounded-md border border-border bg-card p-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Bulan sebelumnya" onClick={() => { setMonth(m => addMonths(m, -1)); setPage(1); }}><ChevronLeft className="h-4 w-4" /></Button>
            <CalendarDays className="ml-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="min-w-28 px-2 text-center text-sm font-medium text-foreground">{format(month, 'MMMM yyyy', { locale: id })}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Bulan berikutnya" disabled={month >= startOfMonth(new Date())} onClick={() => { setMonth(m => addMonths(m, 1)); setPage(1); }}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Kategori antrean" className="flex max-w-full flex-wrap gap-1 rounded-lg border border-dashed border-input bg-muted/30 p-1">
            {(['active', ...(scope === 'signer' ? ['ready','blocked','upcoming'] : ['returned']), 'completed','rejected'] as DashboardBucket[]).map(value =>
              <Button key={value} variant="ghost" size="sm" aria-pressed={bucket === value} className={cn('h-auto min-h-9 whitespace-normal rounded-md text-left font-medium', bucket === value ? 'bg-card text-primary shadow-sm hover:bg-card hover:text-primary' : 'text-muted-foreground hover:text-foreground')} onClick={() => selectBucket(value)}>{DASHBOARD_BUCKET_LABELS[value]}</Button>)}
          </div>
          <div className="relative w-full sm:w-72"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input aria-label="Cari pengajuan" placeholder="Nomor, judul, nama, atau kantor" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" /></div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm" aria-busy={query.isFetching}>
          <table role="table" className="block w-full text-left text-sm lg:table lg:min-w-[860px]"><thead className="hidden border-b bg-muted/50 text-xs text-muted-foreground lg:table-header-group"><tr>
            <th className="w-[36%] px-4 py-3 font-medium">Pengajuan</th><th className="px-4 py-3 font-medium">Pengaju</th><th className="px-4 py-3 font-medium">Posisi saat ini</th><th className="px-4 py-3 font-medium">SLA</th><th className="relative px-4 py-3"><span className="sr-only">Tindakan</span></th>
          </tr></thead><tbody className="block divide-y divide-border lg:table-row-group">
            {query.isPending ? <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Memuat pengajuan…</td></tr> : !data?.rows.length ?
              <tr><td colSpan={5} className="p-10 text-center text-muted-foreground"><Inbox className="mx-auto mb-3 h-7 w-7 text-muted-foreground/60" aria-hidden="true" />Tidak ada pengajuan pada kategori ini.</td></tr> : data.rows.map(row => <tr key={row.id} className="grid grid-cols-2 align-top transition-colors hover:bg-muted/30 lg:table-row">
                <td className={cn('col-span-2 block border-l-2 px-4 py-4 lg:table-cell lg:py-5', row.elapsed_minutes !== null && row.elapsed_minutes > row.sla_minutes && row.bucket !== 'returned' ? 'border-l-red-500' : 'border-l-transparent')}>
                  <div className="flex gap-3"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground"><FileText className="h-4 w-4" aria-hidden="true" /></span><div className="min-w-0">
                  <div className="mb-1.5 break-all text-xs font-medium tabular-nums text-muted-foreground">{row.no_surat || 'Nomor belum tersedia'}</div>
                  <Link className="line-clamp-2 break-words font-semibold leading-relaxed hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" to={dashboardRowLink(row, scope)}>{row.title}</Link>
                  <span className={cn('mt-2 inline-flex rounded-md px-2 py-0.5 text-xs font-medium', ['completed', 'ready'].includes(row.bucket) ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300' : row.bucket === 'rejected' ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' : row.bucket === 'returned' ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300' : 'bg-muted text-muted-foreground')}>{DASHBOARD_BUCKET_LABELS[row.bucket]}</span></div></div></td>
                <td className="block min-w-0 px-4 pb-4 lg:table-cell lg:py-5"><span className="mb-1 block text-xs text-muted-foreground lg:hidden">Pengaju</span><div className="break-words font-medium">{row.requester_name || 'Nama tidak tersedia'}</div><div className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground"><Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">{row.office_name}<br />{row.department_name}</span></div></td>
                <td className="block min-w-0 px-4 pb-4 lg:table-cell lg:py-5"><span className="mb-1 block text-xs text-muted-foreground lg:hidden">Posisi saat ini</span><div className="break-words font-medium">{row.bucket === 'returned' ? row.requester_name : row.current_signer_name || row.current_role || 'Belum ditetapkan'}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{row.bucket === 'returned' ? 'Perbaikan pemohon' : row.current_role}</div>
                  {row.bucket === 'upcoming' && <div className="mt-1 text-xs text-muted-foreground">Tahap {row.current_step} → tahap saya {row.my_step}</div>}
                  {row.needs_verification && row.bucket !== 'completed' && <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"><Clock3 className="h-3 w-3 shrink-0" />Menunggu tim pemeriksa</div>}
                  {row.needs_recommendation && row.bucket !== 'completed' && <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"><Clock3 className="h-3 w-3 shrink-0" />Menunggu rekomendasi</div>}
                  {row.revision_reason && <p className="mt-2 line-clamp-2 max-w-56 text-xs text-muted-foreground">{row.revision_reason}</p>}</td>
                <td className="block min-w-0 px-4 pb-4 lg:table-cell lg:py-5"><span className="mb-1 block text-xs text-muted-foreground lg:hidden">SLA</span><DashboardSla row={row} /></td><td className="block self-end px-4 pb-4 lg:table-cell lg:py-5"><div className="flex justify-end gap-2 lg:justify-start">
                  {row.current_signer_id !== userId && ((row.bucket === 'returned' && scope !== 'mine') || (['ready','waiting'].includes(row.bucket) && !row.needs_verification && !row.needs_recommendation)) &&
                    <Button variant="ghost" size="icon" title="Ingatkan penanggung jawab" aria-label={`Ingatkan ${row.no_surat || row.title}`} disabled={reminding !== null} onClick={() => { void remind(row); }}><BellRing className={cn('h-4 w-4', reminding === row.id && 'animate-pulse')} /></Button>}
                  <Button asChild variant="outline" size="icon" title="Buka pengajuan" aria-label={`Buka ${row.no_surat || row.title}`}><Link to={dashboardRowLink(row, scope)}><ArrowRight className="h-4 w-4" /></Link></Button>
                </div></td>
              </tr>)}
          </tbody></table>
        </div>
        <div className="flex items-center justify-between text-sm text-muted-foreground"><span>Halaman {page} dari {totalPages}</span><div className="flex gap-2">
          <Button variant="outline" size="icon" aria-label="Halaman sebelumnya" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" aria-label="Halaman berikutnya" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div></div>
        {scope === 'team' && !!data?.groups.length && <section className="border-t border-border pt-4" aria-label="Ringkasan kantor"><h3 className="mb-3 text-sm font-semibold">Antrean per kantor</h3>
          <div className="flex flex-wrap gap-x-8 gap-y-3">{data.groups.map(group => <button key={group.name} className="text-left hover:underline" onClick={() => { setSearch(group.name); selectBucket('active'); }}>
            <span className="text-sm font-medium">{group.name}</span><span className="ml-2 text-xs text-muted-foreground">{group.active} aktif · {group.overdue} lewat SLA</span></button>)}</div></section>}
      </>}
      </TabsContent>
    </Tabs>
  </>;
}
