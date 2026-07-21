import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar as DatePickerCalendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Search,
  Loader2,
  AlertCircle,
  History,
  Eye,
  Calendar as CalendarIcon,
  UserRound,
  ClipboardCheck,
  FileText,
  ExternalLink,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import { format } from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { documentOperationKey, useDocumentOpener } from '@/hooks/useDocumentOpener';
import { appStorageService } from '@/services/storage.service';
import { suratService } from '@/services/surat.service';
import { getActiveRecommendationDocuments } from '@/components/surat/linked-documents';
import { RegistrationSummaryDocument } from '@/components/surat/RegistrationSummaryDialog';
import { buildRegistrationSummaryData } from '@/components/surat/registration-summary-data';
import { toast } from 'react-hot-toast';

type InvolvementKey = 'MEMBUAT' | 'MEMERIKSA' | 'MENYETUJUI';

interface SignatureItem {
  id: string;
  surat_id: string;
  user_id: string;
  role_name: string;
  step_order: number;
  is_signed: boolean;
  status: string;
  signed_at: string | null;
  catatan?: string | null;
  profiles?: { full_name?: string | null } | null;
}

interface SuratItem {
  id: string;
  no_surat: string;
  judul_surat: string;
  status: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  current_step: number | null;
  form_input_data?: Record<string, unknown> | null;
  data_snapshot?: Record<string, unknown> | null;
  file_path: string | null;
  lampiran_path: string | null;
  surat_attachments?: Array<{
    id: string;
    file_url: string;
    file_name: string | null;
    file_type?: string | null;
    file_size?: number | null;
  }>;
  creator?: { full_name?: string | null } | null;
  surat_signatures?: SignatureItem[];
}

interface PreparedSurat extends SuratItem {
  _involvementKeys: InvolvementKey[];
  _involvementLabels: string[];
  _creatorName: string;
  _membuatPeople: string[];
  _memeriksaPeople: string[];
  _menyetujuiPeople: string[];
}

const ROLE_ORDER: InvolvementKey[] = ['MEMBUAT', 'MEMERIKSA', 'MENYETUJUI'];
type SignatureStatusFilter = 'ALL' | 'APPROVED' | 'REJECTED';

const currentMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const format = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  return { from: format(start), to: format(now) };
};

const parseDateInput = (value: string) => {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
};

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatRangeLabel = (from: string, to: string) => {
  const fromDate = parseDateInput(from);
  const toDate = parseDateInput(to);
  if (!fromDate && !toDate) return 'Pilih rentang tanggal';
  if (fromDate && !toDate) return format(fromDate, 'd MMM yyyy', { locale: localeID });
  if (!fromDate && toDate) return `sampai ${format(toDate, 'd MMM yyyy', { locale: localeID })}`;
  return `${format(fromDate!, 'd MMM yyyy', { locale: localeID })} - ${format(toDate!, 'd MMM yyyy', { locale: localeID })}`;
};

const ROLE_LABEL: Record<InvolvementKey, string> = {
  MEMBUAT: 'Membuat',
  MEMERIKSA: 'Memeriksa',
  MENYETUJUI: 'Menyetujui',
};

const ROLE_BADGE_CLASS: Record<InvolvementKey, string> = {
  MEMBUAT: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  MEMERIKSA: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  MENYETUJUI: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
};

function uniq(arr: (string | null | undefined)[]) {
  return Array.from(new Set(arr.map((v) => String(v ?? '').trim()).filter(Boolean)));
}

function formatDate(d: string | null | undefined) {
  if (!d) return '-';
  return new Date(d).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function classifyRole(sig: SignatureItem, totalSteps: number): InvolvementKey {
  const v = String(sig.role_name ?? '').toLowerCase();

  // Exact matches first
  if (v === 'membuat') return 'MEMBUAT';
  if (v === 'memeriksa') return 'MEMERIKSA';
  if (v === 'menyetujui') return 'MENYETUJUI';

  // Keyword-first detection
  if (
    v.includes('setuju') ||
    v.includes('menyetujui') ||
    v.includes('approve') ||
    v.includes('approval') ||
    v.includes('otoris') ||
    v.includes('final')
  ) return 'MENYETUJUI';

  if (
    v.includes('periksa') ||
    v.includes('memeriksa') ||
    v.includes('review') ||
    v.includes('verifikasi') ||
    v.includes('cek') ||
    v.includes('paraf')
  ) return 'MEMERIKSA';

  if (v.includes('buat') || v.includes('membuat') || v.includes('draft') || v.includes('pemohon') || v.includes('requester')) {
    return 'MEMBUAT';
  }

  // Fallback by sequence: step terakhir diasumsikan menyetujui
  if (totalSteps >= 2 && sig.step_order === totalSteps) return 'MENYETUJUI';
  return 'MEMERIKSA';
}

function resolveStorageUrl(path: string | null | undefined, preferredBucket?: string): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;

  const p = String(path);

  const bucket = preferredBucket ?? (
    p.startsWith('lampiran_') || p.startsWith('lampiran_surat/') ? 'lampiran_surat' :
    'dokumen_surat'
  );

  const normalized = p.startsWith(`${bucket}/`) ? p.slice(bucket.length + 1) : p;
  return appStorageService.getLegacyPublicUrl(bucket, normalized);
}

const SELECT_SURAT = `
  id, no_surat, judul_surat, status, created_at, updated_at,
  created_by, current_step,
  form_input_data, data_snapshot,
  file_path, lampiran_path,
  surat_attachments(id, file_url, file_name, file_type, file_size),
  creator:profiles!surat_registrasi_created_by_fkey(full_name),
  surat_signatures(
    id, surat_id, user_id, role_name, step_order, is_signed, status, signed_at, catatan,
    profiles:user_id(full_name)
  )
`;

const RiwayatKeterlibatanPage = () => {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | InvolvementKey>('ALL');
  const initialRange = useMemo(() => currentMonthRange(), []);
  const [statusFilter, setStatusFilter] = useState<SignatureStatusFilter>('ALL');
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [selected, setSelected] = useState<PreparedSurat | null>(null);
  const { openPdf, openFile, isOpening } = useDocumentOpener();
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isDateRangeOpen, setIsDateRangeOpen] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['surat-riwayat-keterlibatan', dateFrom, dateTo],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Session tidak ditemukan');
      const userId = session.user.id;
      const fromIso = dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : null;
      const toIso = dateTo ? (() => {
        const date = new Date(`${dateTo}T00:00:00`);
        date.setDate(date.getDate() + 1);
        return date.toISOString();
      })() : null;

      let directQuery = supabase
        .from('surat_registrasi')
        .select(SELECT_SURAT)
        .eq('created_by', userId)
        .order('updated_at', { ascending: false });
      if (fromIso) directQuery = directQuery.gte('updated_at', fromIso);
      if (toIso) directQuery = directQuery.lt('updated_at', toIso);

      const [directRes, signRes] = await Promise.all([
        directQuery,
        supabase
          .from('surat_signatures')
          .select('surat_id')
          .eq('user_id', userId),
      ]);

      if (directRes.error) throw directRes.error;
      if (signRes.error) throw signRes.error;

      const signatureIds = uniq((signRes.data ?? []).map((x: any) => x.surat_id));

      let signatureDocs: SuratItem[] = [];
      if (signatureIds.length > 0) {
        let sigDocsQuery = supabase
          .from('surat_registrasi')
          .select(SELECT_SURAT)
          .in('id', signatureIds)
          .order('updated_at', { ascending: false });
        if (fromIso) sigDocsQuery = sigDocsQuery.gte('updated_at', fromIso);
        if (toIso) sigDocsQuery = sigDocsQuery.lt('updated_at', toIso);
        const sigDocsRes = await sigDocsQuery;
        if (sigDocsRes.error) throw sigDocsRes.error;
        signatureDocs = (sigDocsRes.data ?? []) as SuratItem[];
      }

      const map = new Map<string, SuratItem>();
      ([...(directRes.data ?? []), ...signatureDocs] as SuratItem[]).forEach((row) => {
        map.set(row.id, row);
      });

      return {
        userId,
        items: Array.from(map.values()),
      };
    },
  });

  const prepared: PreparedSurat[] = useMemo(() => {
    if (!data) return [];

    return data.items.map((s) => {
      const signatures = [...(s.surat_signatures ?? [])].sort((a, b) => a.step_order - b.step_order);
      const totalSteps = signatures.length;

      const mineBySignature = signatures
        .filter((sig) => sig.user_id === data.userId)
        .map((sig) => classifyRole(sig, totalSteps));

      const mySet = new Set<InvolvementKey>(mineBySignature);
      if (s.created_by === data.userId) mySet.add('MEMBUAT');
      const myKeys = ROLE_ORDER.filter((k) => mySet.has(k));

      const membuatPeople = uniq([
        s.creator?.full_name,
        ...signatures
          .filter((sig) => classifyRole(sig, totalSteps) === 'MEMBUAT')
          .map((sig) => sig.profiles?.full_name),
      ]);

      const memeriksaPeople = uniq(
        signatures
          .filter((sig) => classifyRole(sig, totalSteps) === 'MEMERIKSA')
          .map((sig) => sig.profiles?.full_name)
      );

      const menyetujuiPeople = uniq(
        signatures
          .filter((sig) => classifyRole(sig, totalSteps) === 'MENYETUJUI')
          .map((sig) => sig.profiles?.full_name)
      );

      return {
        ...s,
        _involvementKeys: myKeys,
        _involvementLabels: myKeys.map((k) => ROLE_LABEL[k]),
        _creatorName: s.creator?.full_name ?? '-',
        _membuatPeople: membuatPeople,
        _memeriksaPeople: memeriksaPeople,
        _menyetujuiPeople: menyetujuiPeople,
      };
    });
  }, [data]);

  // Keep selected modal synced with latest data
  useEffect(() => {
    if (!selected) return;
    const latest = prepared.find((x) => x.id === selected.id);
    if (!latest) return;

    const selectedSigCount = selected.surat_signatures?.length ?? 0;
    const latestSigCount = latest.surat_signatures?.length ?? 0;

    if (
      latest.updated_at !== selected.updated_at ||
      latestSigCount !== selectedSigCount
    ) {
      setSelected(latest);
    }
  }, [prepared, selected]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return prepared.filter((s) => {
      const hitSearch = !q || s.judul_surat?.toLowerCase().includes(q) || s.no_surat?.toLowerCase().includes(q);
      const hitRole = roleFilter === 'ALL' || s._involvementKeys.includes(roleFilter);
      const mine = (s.surat_signatures || []).filter((sig) => sig.user_id === data?.userId);
      const hitStatus = statusFilter === 'ALL' || mine.some((sig) => sig.status === statusFilter);
      return hitSearch && hitRole && hitStatus;
    });
  }, [prepared, search, roleFilter, statusFilter, data?.userId]);

  const getAttachments = (surat: SuratItem) => {
    const attachments = surat.surat_attachments ?? [];
    if (attachments.length > 0) return attachments.map((attachment, index) => ({
      id: attachment.id || `attachment-${index}`,
      label: `Lampiran Permohonan ${index + 1}`,
      path: attachment.file_url,
    }));
    return [{
      id: 'legacy-attachment',
      label: 'Lampiran Permohonan',
      path: surat.lampiran_path,
    }];
  };

  const counts = useMemo(() => ({
    total: prepared.length,
    membuat: prepared.filter((x) => x._involvementKeys.includes('MEMBUAT')).length,
    memeriksa: prepared.filter((x) => x._involvementKeys.includes('MEMERIKSA')).length,
    menyetujui: prepared.filter((x) => x._involvementKeys.includes('MENYETUJUI')).length,
    approved: prepared.filter((x) => (x.surat_signatures || []).some((sig) => sig.user_id === data?.userId && sig.status === 'APPROVED')).length,
    rejected: prepared.filter((x) => (x.surat_signatures || []).some((sig) => sig.user_id === data?.userId && sig.status === 'REJECTED')).length,
  }), [prepared, data?.userId]);

  const activeFilterCount = useMemo(() => {
    let total = 0;
    if (dateFrom !== initialRange.from || dateTo !== initialRange.to) total += 1;
    if (statusFilter !== 'ALL') total += 1;
    if (roleFilter !== 'ALL') total += 1;
    return total;
  }, [dateFrom, dateTo, initialRange.from, initialRange.to, roleFilter, statusFilter]);

  const selectedDateRange = useMemo<DateRange>(() => ({
    from: parseDateInput(dateFrom),
    to: parseDateInput(dateTo),
  }), [dateFrom, dateTo]);

  const { data: selectedLinkedDocuments = [], isFetching: linkedDocumentsLoading } = useQuery({
    queryKey: ['surat-linked-documents', selected?.id],
    queryFn: () => suratService.getLinkedDocuments(selected!.id),
    enabled: Boolean(selected?.id),
    staleTime: 15_000,
  });

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center space-y-3">
          <AlertCircle className="mx-auto text-destructive" size={34} />
          <p className="text-base font-semibold">Gagal memuat riwayat</p>
          <p className="text-sm text-muted-foreground">{(error as any).message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Coba lagi</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="sigap-page animate-in fade-in duration-300">
      <div className="sigap-panel sigap-panel-accent p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <History size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold sm:text-2xl">Riwayat Keterlibatan</h1>
              <p className="mt-1 text-sm text-muted-foreground">Dokumen yang pernah Anda buat, periksa, atau setujui.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()}>
            <RefreshCw size={14} className={cn(isFetching && 'animate-spin')} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total', value: counts.total },
          { label: 'Membuat', value: counts.membuat },
          { label: 'Memeriksa', value: counts.memeriksa },
          { label: 'Menyetujui', value: counts.menyetujui },
          { label: 'Setuju', value: counts.approved },
          { label: 'Tolak', value: counts.rejected },
        ].map((c) => (
          <div key={c.label} className="min-h-24 rounded-lg border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="sigap-panel space-y-3 p-4 sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-[440px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari judul atau nomor surat..."
              className="pl-9 h-10"
            />
          </div>

          <div className="flex items-center justify-between gap-2 md:justify-end">
            <p className="text-xs text-muted-foreground">
              {filtered.length} dari {prepared.length} riwayat
            </p>
            <Button
              type="button"
              variant={isFilterOpen ? "default" : "outline"}
              size="sm"
              className="h-10 gap-2"
              onClick={() => setIsFilterOpen((value) => !value)}
              aria-expanded={isFilterOpen}
            >
              <SlidersHorizontal size={15} />
              Filter
              {activeFilterCount > 0 && (
                <span className={cn(
                  "ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
                  isFilterOpen ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary text-primary-foreground"
                )}>
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </div>
        </div>

        {isFilterOpen && (
          <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-3 sm:p-4">
            <div className="hidden space-y-1 md:block">
              <label className="text-xs font-medium text-muted-foreground">Rentang tanggal</label>
              <Popover open={isDateRangeOpen} onOpenChange={setIsDateRangeOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full justify-start gap-2 bg-background text-left font-normal lg:w-[330px]"
                  >
                    <CalendarIcon size={15} className="text-muted-foreground" />
                    <span className={cn(!dateFrom && !dateTo && "text-muted-foreground")}>
                      {formatRangeLabel(dateFrom, dateTo)}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0" sideOffset={8}>
                  <DatePickerCalendar
                    mode="range"
                    numberOfMonths={2}
                    selected={selectedDateRange}
                    defaultMonth={selectedDateRange.from}
                    onSelect={(range) => {
                      setDateFrom(range?.from ? toDateInputValue(range.from) : '');
                      setDateTo(range?.to ? toDateInputValue(range.to) : '');
                      if (range?.from && range?.to) setIsDateRangeOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid w-full gap-2 sm:grid-cols-2 md:hidden">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Dari tanggal</label>
                <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-10" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Sampai tanggal</label>
                <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-10" />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Status tindakan</p>
              <div className="flex flex-wrap gap-2">
                {([
                  ['ALL', 'Semua Status'],
                  ['APPROVED', 'Setuju'],
                  ['REJECTED', 'Tolak'],
                ] as Array<[SignatureStatusFilter, string]>).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setStatusFilter(value)}
                    className={cn(
                      'min-h-9 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                      statusFilter === value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:border-primary/40'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Keterlibatan</p>
              <div className="flex flex-wrap gap-2">
            {(['ALL', ...ROLE_ORDER] as Array<'ALL' | InvolvementKey>).map((v) => (
              <button
                key={v}
                onClick={() => setRoleFilter(v)}
                className={cn(
                  'min-h-9 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  roleFilter === v
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/40'
                )}
              >
                {v === 'ALL' ? 'Semua' : ROLE_LABEL[v]}
              </button>
            ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="h-56 flex flex-col items-center justify-center gap-3">
          <Loader2 className="animate-spin text-primary" size={30} />
          <p className="text-sm text-muted-foreground">Memuat riwayat...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="h-56 flex flex-col items-center justify-center gap-3 opacity-60">
          <History size={40} />
          <p className="text-base font-semibold">Tidak ada riwayat yang sesuai</p>
          <p className="text-sm text-muted-foreground">Ubah kata pencarian atau rentang tanggal.</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-border bg-card shadow-sm lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1160px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="w-16 px-4 py-3 text-xs font-semibold">#</th>
                    <th className="px-4 py-3 text-xs font-semibold">Nomor surat</th>
                    <th className="px-4 py-3 text-xs font-semibold">Judul</th>
                    <th className="px-4 py-3 text-xs font-semibold">Keterlibatan saya</th>
                    <th className="px-4 py-3 text-xs font-semibold">Membuat</th>
                    <th className="px-4 py-3 text-xs font-semibold">Memeriksa</th>
                    <th className="px-4 py-3 text-xs font-semibold">Menyetujui</th>
                    <th className="px-4 py-3 text-xs font-semibold">Diperbarui</th>
                    <th className="px-4 py-3 text-xs font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, index) => (
                    <tr key={s.id} className="border-t border-border/70">
                      <td className="px-4 py-3 text-xs font-semibold tabular-nums text-muted-foreground">{index + 1}</td>
                      <td className="px-3 py-3 text-xs font-mono">{s.no_surat || '-'}</td>
                      <td className="px-3 py-3 text-xs font-semibold max-w-[220px] truncate">{s.judul_surat}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {s._involvementKeys.map((k) => (
                            <Badge key={k} variant="outline" className={cn('text-[10px]', ROLE_BADGE_CLASS[k])}>
                              {ROLE_LABEL[k]}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{s._membuatPeople.join(', ') || '-'}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{s._memeriksaPeople.join(', ') || '-'}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{s._menyetujuiPeople.join(', ') || '-'}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{formatDate(s.updated_at)}</td>
                      <td className="px-3 py-3">
                        <Button size="sm" variant="outline" onClick={() => setSelected(s)} className="h-8 gap-1">
                          <Eye size={13} /> Detail
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:hidden">
            {filtered.map((s, index) => (
              <div key={s.id} className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="flex gap-3">
                  <div className="flex h-7 min-w-7 items-center justify-center rounded-md bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
                    {index + 1}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="text-[11px] font-mono text-muted-foreground">{s.no_surat || '-'}</p>
                    <h3 className="text-sm font-bold line-clamp-2">{s.judul_surat}</h3>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {s._involvementKeys.map((k) => (
                    <Badge key={k} variant="outline" className={cn('text-[10px]', ROLE_BADGE_CLASS[k])}>
                      {ROLE_LABEL[k]}
                    </Badge>
                  ))}
                </div>

                <div className="space-y-1 text-xs">
                  <p><span className="text-muted-foreground">Membuat:</span> {s._membuatPeople.join(', ') || '-'}</p>
                  <p><span className="text-muted-foreground">Memeriksa:</span> {s._memeriksaPeople.join(', ') || '-'}</p>
                  <p><span className="text-muted-foreground">Menyetujui:</span> {s._menyetujuiPeople.join(', ') || '-'}</p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/60">
                  <span className="text-[11px] text-muted-foreground">{formatDate(s.updated_at)}</span>
                  <Button size="sm" variant="outline" onClick={() => setSelected(s)} className="h-8 gap-1">
                    <Eye size={13} /> Detail
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[92vh] w-[min(96vw,1120px)] max-w-none overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base sm:text-lg">Detail Riwayat Keterlibatan</DialogTitle>
                <DialogDescription>{selected.no_surat || '-'} • {selected.judul_surat}</DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                <div className="rounded-xl border border-border p-3 bg-card/40 space-y-2">
                  <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                    <UserRound size={13} /> Pihak Terlibat
                  </p>
                  <p className="text-sm"><span className="text-muted-foreground">Membuat:</span> {selected._membuatPeople.join(', ') || '-'}</p>
                  <p className="text-sm"><span className="text-muted-foreground">Memeriksa:</span> {selected._memeriksaPeople.join(', ') || '-'}</p>
                  <p className="text-sm"><span className="text-muted-foreground">Menyetujui:</span> {selected._menyetujuiPeople.join(', ') || '-'}</p>
                </div>

                <div className="rounded-xl border border-border p-3 bg-card/40 space-y-2">
                  <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                    <CalendarIcon size={13} /> Metadata
                  </p>
                  <p className="text-sm"><span className="text-muted-foreground">Status:</span> {selected.status}</p>
                  <p className="text-sm"><span className="text-muted-foreground">Dibuat:</span> {formatDate(selected.created_at)}</p>
                  <p className="text-sm"><span className="text-muted-foreground">Diperbarui:</span> {formatDate(selected.updated_at)}</p>
                </div>
              </div>

              <div className="mt-4">
                <RegistrationSummaryDocument
                  data={buildRegistrationSummaryData(selected)}
                  openingAttachmentId={
                    getAttachments(selected).find((attachment) => {
                      const key = documentOperationKey.file(selected.id, String(attachment.id || attachment.path || attachment.label));
                      return isOpening(key);
                    })?.id || null
                  }
                  onOpenAttachment={(attachment) => {
                    if (!attachment.fileUrl) return;
                    const operationKey = documentOperationKey.file(selected.id, String(attachment.id || attachment.fileUrl || attachment.name));
                    void openFile(selected.id, attachment.fileUrl, operationKey);
                  }}
                />
              </div>

              <div className="mt-4 rounded-xl border border-border p-3 bg-card/30">
                <p className="mb-3 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                  <FileText size={13} /> Dokumen Terkait
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([
                    {
                      id: 'main-document',
                      label: 'Dokumen Permohonan',
                      path: selected.file_path,
                      kind: 'pdf',
                      title: undefined,
                      subtitle: undefined,
                    },
                    ...getActiveRecommendationDocuments(selectedLinkedDocuments).map((doc) => ({
                      id: doc.id,
                      label: doc.label,
                      path: doc.suratId,
                      kind: 'recommendation-pdf',
                      title: doc.title,
                      subtitle: doc.subtitle,
                    })),
                  ] as Array<{
                    id: string;
                    label: string;
                    path: string | null;
                    kind: 'pdf' | 'file' | 'recommendation-pdf';
                    title?: string;
                    subtitle?: string;
                  }>).map((doc) => {
                    const operationKey = doc.kind === 'pdf' || doc.kind === 'recommendation-pdf'
                      ? documentOperationKey.pdf(doc.kind === 'recommendation-pdf' ? doc.path : selected.id, `history-${doc.id}`)
                      : documentOperationKey.file(selected.id, String(doc.id || doc.path || doc.label));
                    const opening = isOpening(operationKey);

                    return (
                      <div key={`${doc.kind}-${doc.id || doc.path || doc.label}`} className="rounded-lg border border-border/60 p-2.5 bg-background/40">
                        <p className="text-xs font-semibold mb-2">{doc.label}</p>
                        {doc.kind === 'recommendation-pdf' && (
                          <>
                            <p className="mb-1 truncate text-xs text-muted-foreground">{doc.title}</p>
                            <p className="mb-2 truncate text-[11px] text-muted-foreground">{doc.subtitle}</p>
                          </>
                        )}
                        {doc.path ? (
                          <button
                            type="button"
                            onClick={() => doc.kind === 'pdf'
                              ? void openPdf(selected.id, operationKey)
                              : doc.kind === 'recommendation-pdf'
                                ? void openPdf(doc.path, operationKey)
                              : void openFile(selected.id, doc.path, operationKey)}
                            disabled={opening}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:cursor-wait disabled:opacity-70"
                          >
                            {opening ? (
                              <>
                                <Loader2 size={12} className="animate-spin" /> {doc.kind === 'file' ? 'Membuka lampiran' : 'Menyiapkan PDF'}
                              </>
                            ) : (
                              <>
                                {doc.kind === 'file' ? 'Lihat Lampiran' : 'Lihat PDF'} <ExternalLink size={12} />
                              </>
                            )}
                          </button>
                        ) : (
                          <p className="text-xs text-muted-foreground">Belum tersedia</p>
                        )}
                      </div>
                    );
                  })}
                  {linkedDocumentsLoading && (
                    <div className="rounded-lg border border-border/60 bg-background/40 p-2.5 text-xs text-muted-foreground">
                      <Loader2 size={12} className="mr-1 inline animate-spin" />
                      Memuat rekomendasi...
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-border p-3 bg-card/30">
                <p className="mb-3 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                  <ClipboardCheck size={13} /> Progres persetujuan
                </p>
                <div className="space-y-2">
                  {[...(selected.surat_signatures ?? [])]
                    .sort((a, b) => a.step_order - b.step_order)
                    .map((sig) => {
                      const totalSteps = selected.surat_signatures?.length ?? 0;
                      const roleClassified = classifyRole(sig, totalSteps);
                      return (
                        <div key={sig.id} className="flex items-start gap-3 p-2 rounded-lg border border-border/60 bg-background/40">
                          <div className={cn(
                            'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold',
                            sig.status === 'REJECTED'
                              ? 'bg-red-500 text-white'
                              : sig.is_signed
                                ? 'bg-emerald-500 text-white'
                                : 'bg-muted text-muted-foreground'
                          )}>
                            {sig.step_order}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold truncate">{sig.role_name || 'Signer'}</p>
                              <Badge variant="outline" className={cn('text-[10px]', ROLE_BADGE_CLASS[roleClassified])}>
                                {ROLE_LABEL[roleClassified]}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{sig.profiles?.full_name || '-'}</p>
                            <p className="text-[11px] text-muted-foreground mt-1">
                              Status: <span className="font-semibold">{sig.status || (sig.is_signed ? 'SIGNED' : 'PENDING')}</span>
                              {sig.signed_at ? ` • ${formatDate(sig.signed_at)}` : ''}
                            </p>
                            {sig.catatan && <p className="text-xs mt-1 text-muted-foreground">Catatan: {sig.catatan}</p>}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RiwayatKeterlibatanPage;
