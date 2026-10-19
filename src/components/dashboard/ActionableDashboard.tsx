import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { addMonths, format, startOfMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { ArrowRight, BellRing, Building2, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FilePenLine, Inbox, RefreshCw, Search, Timer, TriangleAlert, Undo2, Users, XCircle } from 'lucide-react';
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

export const DashboardSla = ({ row }: { row: DashboardRow }) => {
  if (row.bucket === 'returned') return <span className="text-xs text-muted-foreground">Dijeda untuk perbaikan</span>;
  if (row.elapsed_minutes === null) return <span className="text-xs text-muted-foreground">{['completed', 'rejected'].includes(row.bucket) ? 'Tidak terukur' : 'Belum mulai'}</span>;
  const late = row.elapsed_minutes > row.sla_minutes;
  const difference = Math.abs(row.elapsed_minutes - row.sla_minutes);
  return <div className="space-y-1 text-xs"><span className={cn('inline-flex items-center gap-1 font-medium', late ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400')}>
    {late ? <TriangleAlert className="h-3.5 w-3.5" /> : <Timer className="h-3.5 w-3.5" />}
    {late ? 'Melewati SLA' : 'Dalam SLA'}</span>
    <div className="text-muted-foreground">{row.bucket === 'completed' ? `${row.elapsed_minutes} menit kerja` : `${late ? 'Lewat' : 'Sisa'} ${difference} menit kerja`}</div></div>;
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
  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / 12));
  useEffect(() => { if (data && !query.isFetching && page > totalPages) setPage(totalPages); }, [data, query.isFetching, page, totalPages]);
  return <>
    <PageHeader title="Dashboard" subtitle="Pengajuan dan tindak lanjut">
      <Button asChild size="sm"><Link to="/surat/registrasi"><FilePenLine className="mr-2 h-4 w-4" />Buat pengajuan</Link></Button>
    </PageHeader>
    <Tabs value={scope} onValueChange={value => changeScope(value as DashboardScope)} aria-label="Pemantauan pengajuan" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-3">
        <TabsList className="h-auto flex-wrap justify-start" aria-label="Lingkup pengajuan">
          {([{ value: 'mine', label: 'Pengajuan saya', icon: FilePenLine }, { value: 'signer', label: 'Tanda tangan saya', icon: Inbox }, { value: 'team', label: 'Departemen / kantor', icon: Users }] as const).map(tab =>
            <TabsTrigger key={tab.value} value={tab.value} className="min-h-10 gap-2 whitespace-normal text-left">
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
            aria-pressed={bucket === card.key} className={cn('min-h-28 min-w-0 rounded-lg border bg-card p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', bucket === card.key ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/60')}>
            <div className="mb-3 flex items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{DASHBOARD_BUCKET_LABELS[card.key as DashboardBucket]}</span>
              <card.icon className={cn('h-4 w-4 shrink-0', card.key === 'completed' ? 'text-emerald-600' : card.key === 'returned' ? 'text-amber-600' : 'text-muted-foreground')} /></div>
            <div className="text-3xl font-semibold tabular-nums">{query.isPending ? <span className="block h-9 w-16 animate-pulse rounded bg-muted" /> : data?.summary[card.key as keyof typeof data.summary] ?? 0}</div>
          </button>)}
        </div>
        <div className="grid gap-4 border-y border-border py-4 md:grid-cols-3" aria-label="SLA pengajuan">
          <button onClick={() => selectBucket('within_sla')} aria-pressed={bucket === 'within_sla'} className="flex items-center gap-3 rounded-md p-2 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
            <Timer className="h-5 w-5 shrink-0 text-emerald-600" /><div><div className="text-sm text-muted-foreground">Antrean dalam SLA</div><strong className="text-xl tabular-nums">{data?.summary.within_sla ?? '—'}</strong></div></button>
          <button onClick={() => selectBucket('overdue')} aria-pressed={bucket === 'overdue'} className="flex items-center gap-3 rounded-md p-2 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
            <TriangleAlert className="h-5 w-5 shrink-0 text-destructive" /><div><div className="text-sm text-muted-foreground">Antrean melewati SLA</div><strong className="text-xl tabular-nums">{data?.summary.overdue ?? '—'}</strong></div></button>
          <div className="flex items-center gap-3 p-2"><CheckCircle2 className="h-5 w-5 shrink-0 text-muted-foreground" /><div><div className="text-sm text-muted-foreground">Selesai tepat waktu</div>
            <strong className="text-xl tabular-nums">{completedMeasured ? `${Math.round(onTime / completedMeasured * 100)}%` : '—'}</strong>
            <span className="ml-2 text-xs text-muted-foreground">{onTime} / {completedMeasured} terukur</span></div></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{DASHBOARD_BUCKET_LABELS[bucket]} <span className="ml-1 text-sm font-normal text-muted-foreground">{data?.count ?? 0}</span></h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><span>Riwayat selesai / ditolak</span>
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Bulan sebelumnya" onClick={() => { setMonth(m => addMonths(m, -1)); setPage(1); }}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-28 text-center text-sm font-medium text-foreground">{format(month, 'MMMM yyyy', { locale: id })}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Bulan berikutnya" disabled={month >= startOfMonth(new Date())} onClick={() => { setMonth(m => addMonths(m, 1)); setPage(1); }}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1">
            {(['active', ...(scope === 'signer' ? ['ready','blocked','upcoming'] : ['returned']), 'completed','rejected'] as DashboardBucket[]).map(value =>
              <Button key={value} variant={bucket === value ? 'secondary' : 'ghost'} size="sm" aria-pressed={bucket === value} onClick={() => selectBucket(value)}>{DASHBOARD_BUCKET_LABELS[value]}</Button>)}
          </div>
          <div className="relative w-full sm:w-72"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input aria-label="Cari pengajuan" placeholder="Nomor, judul, nama, atau kantor" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" /></div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border" aria-busy={query.isFetching}>
          <table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b bg-muted/40 text-xs text-muted-foreground"><tr>
            <th className="w-[36%] px-4 py-3 font-medium">Pengajuan</th><th className="px-4 py-3 font-medium">Pengaju</th><th className="px-4 py-3 font-medium">Posisi saat ini</th><th className="px-4 py-3 font-medium">SLA</th><th className="relative px-4 py-3"><span className="sr-only">Tindakan</span></th>
          </tr></thead><tbody className="divide-y divide-border">
            {query.isPending ? <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Memuat pengajuan…</td></tr> : !data?.rows.length ?
              <tr><td colSpan={5} className="p-10 text-center text-muted-foreground">Tidak ada pengajuan pada kategori ini.</td></tr> : data.rows.map(row => <tr key={row.id} className="align-top hover:bg-muted/20">
                <td className="px-4 py-4"><div className="mb-1 text-xs font-medium text-muted-foreground">{row.no_surat || 'Nomor belum tersedia'}</div>
                  <Link className="line-clamp-2 break-words font-medium hover:underline" to={dashboardRowLink(row, scope)}>{row.title}</Link>
                  <div className="mt-2 text-xs text-muted-foreground">{DASHBOARD_BUCKET_LABELS[row.bucket]}</div></td>
                <td className="px-4 py-4"><div>{row.requester_name || 'Nama tidak tersedia'}</div><div className="mt-1 text-xs text-muted-foreground">{row.office_name}<br />{row.department_name}</div></td>
                <td className="px-4 py-4"><div className="font-medium">{row.bucket === 'returned' ? row.requester_name : row.current_signer_name || row.current_role || 'Belum ditetapkan'}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{row.bucket === 'returned' ? 'Perbaikan pemohon' : row.current_role}</div>
                  {row.bucket === 'upcoming' && <div className="mt-1 text-xs text-muted-foreground">Tahap {row.current_step} → tahap saya {row.my_step}</div>}
                  {row.needs_verification && row.bucket !== 'completed' && <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">Menunggu tim pemeriksa</div>}
                  {row.needs_recommendation && row.bucket !== 'completed' && <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">Menunggu rekomendasi</div>}
                  {row.revision_reason && <p className="mt-2 line-clamp-2 max-w-56 text-xs text-muted-foreground">{row.revision_reason}</p>}</td>
                <td className="px-4 py-4"><DashboardSla row={row} /></td><td className="px-4 py-4"><div className="flex gap-2">
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
