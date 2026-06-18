import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  Calendar,
  UserRound,
  ClipboardCheck,
  FileText,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { documentPreviewService } from '@/services/document-preview.service';
import { appStorageService } from '@/services/storage.service';
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
  file_path, lampiran_path,
  surat_attachments(id, file_url, file_name, file_type, file_size),
  creator:profiles!surat_registrasi_created_by_fkey(full_name),
  surat_signatures(
    id, surat_id, user_id, role_name, step_order, is_signed, status, signed_at, catatan,
    profiles:user_id(full_name)
  )
`;

const RiwayatKeterlibatanPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | InvolvementKey>('ALL');
  const initialRange = useMemo(() => currentMonthRange(), []);
  const [statusFilter, setStatusFilter] = useState<SignatureStatusFilter>('ALL');
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [selected, setSelected] = useState<PreparedSurat | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

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
    // Polling fallback (jika websocket terputus)
    refetchInterval: 20_000,
  });

  // Realtime invalidation untuk timeline/list
  useEffect(() => {
    let channel: any;

    const initRealtime = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const userId = session.user.id;

      channel = supabase
        .channel(`riwayat-keterlibatan:${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'surat_registrasi' }, () => {
          queryClient.invalidateQueries({ queryKey: ['surat-riwayat-keterlibatan'] });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'surat_signatures' }, () => {
          queryClient.invalidateQueries({ queryKey: ['surat-riwayat-keterlibatan'] });
        })
        .subscribe();
    };

    initRealtime();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [queryClient]);

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
      label: `Lampiran Permohonan ${index + 1}`,
      path: attachment.file_url,
    }));
    return [{
      label: 'Lampiran Permohonan',
      path: surat.lampiran_path,
    }];
  };

  const openGeneratedPdf = async (suratId: string) => {
    setPreviewingId(suratId);
    try {
      const pdfUrl = await documentPreviewService.getPdfUrl(suratId);
      await documentPreviewService.openStoredFileInNewTab(suratId, pdfUrl);
    } catch (error: any) {
      toast.error(error.message || 'Gagal membuka PDF dokumen.');
    } finally {
      setPreviewingId(null);
    }
  };

  const openStoredFile = async (suratId: string, path: string | null | undefined) => {
    if (!path) return;
    try {
      await documentPreviewService.openStoredFileInNewTab(suratId, path);
    } catch (error: any) {
      toast.error(error.message || 'Gagal membuka dokumen.');
    }
  };

  const counts = useMemo(() => ({
    total: prepared.length,
    membuat: prepared.filter((x) => x._involvementKeys.includes('MEMBUAT')).length,
    memeriksa: prepared.filter((x) => x._involvementKeys.includes('MEMERIKSA')).length,
    menyetujui: prepared.filter((x) => x._involvementKeys.includes('MENYETUJUI')).length,
    approved: prepared.filter((x) => (x.surat_signatures || []).some((sig) => sig.user_id === data?.userId && sig.status === 'APPROVED')).length,
    rejected: prepared.filter((x) => (x.surat_signatures || []).some((sig) => sig.user_id === data?.userId && sig.status === 'REJECTED')).length,
  }), [prepared, data?.userId]);

  if (error) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertCircle className="mx-auto text-destructive" size={34} />
          <p className="font-bold uppercase tracking-widest text-sm">Gagal memuat riwayat</p>
          <p className="text-xs text-muted-foreground">{(error as any).message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="border-b border-border pb-4 sm:pb-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-8 rounded-full bg-primary" />
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight uppercase">Riwayat Keterlibatan Surat</h1>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
                Membuat, memeriksa, menyetujui, dan timeline dokumen terkait
              </p>
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
          <div key={c.label} className="rounded-xl border border-border bg-card/40 p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{c.label}</p>
            <p className="text-2xl font-black mt-1 tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-card/30 border border-border rounded-2xl p-3 sm:p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="relative w-full md:w-[380px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari judul atau nomor surat..."
              className="pl-9 h-10"
            />
          </div>

          <div className="grid w-full gap-2 sm:grid-cols-2 md:w-auto md:grid-cols-[150px_150px]">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Dari</label>
              <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-10" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sampai</label>
              <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-10" />
            </div>
          </div>
        </div>
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
                'px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all',
                statusFilter === value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-transparent text-muted-foreground border-border hover:border-primary/40'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
            {(['ALL', ...ROLE_ORDER] as Array<'ALL' | InvolvementKey>).map((v) => (
              <button
                key={v}
                onClick={() => setRoleFilter(v)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all',
                  roleFilter === v
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-transparent text-muted-foreground border-border hover:border-primary/40'
                )}
              >
                {v === 'ALL' ? 'Semua' : ROLE_LABEL[v]}
              </button>
            ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-56 flex flex-col items-center justify-center gap-3">
          <Loader2 className="animate-spin text-primary" size={30} />
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Memuat riwayat...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="h-56 flex flex-col items-center justify-center gap-3 opacity-60">
          <History size={40} />
          <p className="text-sm font-bold uppercase tracking-widest">Tidak ada data</p>
          <p className="text-xs text-muted-foreground">Coba ubah filter pencarian</p>
        </div>
      ) : (
        <>
          <div className="hidden lg:block rounded-2xl border border-border overflow-hidden bg-card/20">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1160px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wider">No Surat</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wider">Judul</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wider">Keterlibatan Saya</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wider">Membuat</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wider">Memeriksa</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wider">Menyetujui</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wider">Update</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="border-t border-border/70">
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
            {filtered.map((s) => (
              <div key={s.id} className="rounded-2xl border border-border bg-card/20 p-4 space-y-3">
                <div className="space-y-1">
                  <p className="text-[11px] font-mono text-muted-foreground">{s.no_surat || '-'}</p>
                  <h3 className="text-sm font-bold line-clamp-2">{s.judul_surat}</h3>
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
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base sm:text-lg">Detail Riwayat Keterlibatan</DialogTitle>
                <DialogDescription>{selected.no_surat || '-'} • {selected.judul_surat}</DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                <div className="rounded-xl border border-border p-3 bg-card/40 space-y-2">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
                    <UserRound size={13} /> Pihak Terlibat
                  </p>
                  <p className="text-sm"><span className="text-muted-foreground">Membuat:</span> {selected._membuatPeople.join(', ') || '-'}</p>
                  <p className="text-sm"><span className="text-muted-foreground">Memeriksa:</span> {selected._memeriksaPeople.join(', ') || '-'}</p>
                  <p className="text-sm"><span className="text-muted-foreground">Menyetujui:</span> {selected._menyetujuiPeople.join(', ') || '-'}</p>
                </div>

                <div className="rounded-xl border border-border p-3 bg-card/40 space-y-2">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
                    <Calendar size={13} /> Metadata
                  </p>
                  <p className="text-sm"><span className="text-muted-foreground">Status:</span> {selected.status}</p>
                  <p className="text-sm"><span className="text-muted-foreground">Created:</span> {formatDate(selected.created_at)}</p>
                  <p className="text-sm"><span className="text-muted-foreground">Updated:</span> {formatDate(selected.updated_at)}</p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-border p-3 bg-card/30">
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-3 flex items-center gap-1">
                  <FileText size={13} /> Dokumen Terkait
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    {
                      label: 'Dokumen Permohonan',
                      path: selected.file_path,
                      kind: 'pdf',
                    },
                    ...getAttachments(selected).map((doc) => ({ ...doc, kind: 'file' })),
                  ].map((doc) => (
                    <div key={doc.label} className="rounded-lg border border-border/60 p-2.5 bg-background/40">
                      <p className="text-xs font-semibold mb-2">{doc.label}</p>
                      {doc.path ? (
                        <button
                          type="button"
                          onClick={() => doc.kind === 'pdf' ? openGeneratedPdf(selected.id) : openStoredFile(selected.id, doc.path)}
                          disabled={doc.kind === 'pdf' && previewingId === selected.id}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          {doc.kind === 'pdf' && previewingId === selected.id ? (
                            <>
                              <Loader2 size={12} className="animate-spin" /> Menyiapkan PDF
                            </>
                          ) : (
                            <>
                              Lihat Dokumen <ExternalLink size={12} />
                            </>
                          )}
                        </button>
                      ) : (
                        <p className="text-xs text-muted-foreground">Belum tersedia</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-border p-3 bg-card/30">
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-3 flex items-center gap-1">
                  <ClipboardCheck size={13} /> Timeline Tanda Tangan (Realtime)
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
