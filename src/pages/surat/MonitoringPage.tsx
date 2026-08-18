import { useDeferredValue, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Loader2, Info, Eye,
  Clock, AlertCircle, CheckCircle2, User, ArrowUpRight,
  FileCheck, XCircle, Inbox, RefreshCw
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { documentOperationKey, useDocumentOpener } from "@/hooks/useDocumentOpener";
import { EmptyState, EmptyList, ErrorState, EmptyGridSkeleton } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/Breadcrumbs';
import { suratService } from '@/services/surat.service';
import { getActiveRecommendationDocuments } from '@/components/surat/linked-documents';
import {
  RegistrationSummaryDocument,
  type RegistrationSummaryData,
} from '@/components/surat/RegistrationSummaryDialog';
import { buildRegistrationSummaryData } from '@/components/surat/registration-summary-data';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { suratMonitoringService } from '@/services/surat-monitoring.service';
import { getSortedApprovalSignatures } from '@/components/surat/approval-signatures';

// ── Helpers ───────────────────────────────────────────────────────────────

type DocStatus = 'PROSES' | 'SELESAI' | 'DITOLAK' | 'MENUNGGU_PERBAIKAN';

interface ResolvedStatus {
  type: DocStatus;
  label: string;
  sublabel: string;
  barColor: string;
  badgeClass: string;
  accentClass: string;
  icon: React.ReactNode;
}

const resolveStatus = (surat: any, sigs: any[]): ResolvedStatus => {
  const hasRejectedSig = sigs.some(s => s.status === 'REJECTED');
  const allSigned = sigs.length > 0 && sigs.every(s => s.is_signed);

  if (hasRejectedSig || surat.status === 'REJECTED') {
    const rejectedSig = sigs.find(s => s.status === 'REJECTED');
    const externalDecision = surat.data_snapshot?.external_decision;
    const rejectedByDepartmentSystem = externalDecision?.decision === 'rejected';
    return {
      type: 'DITOLAK',
      label: rejectedByDepartmentSystem ? 'Ditolak sistem departemen' : 'Ditolak',
      sublabel: rejectedByDepartmentSystem
        ? String(externalDecision?.reason || 'Ditolak oleh sistem departemen')
        : rejectedSig ? `Ditolak pada tahap: ${rejectedSig.role_name}` : 'Ditolak',
      barColor: 'bg-red-500',
      badgeClass: 'bg-red-500/10 text-red-400 border-red-500/20',
      accentClass: 'bg-red-500',
      icon: <XCircle size={14} />,
    };
  }

  if (allSigned || surat.status === 'DONE') {
    return {
      type: 'SELESAI',
      label: 'Selesai',
      sublabel: 'Seluruh persetujuan selesai',
      barColor: 'bg-emerald-500',
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      accentClass: 'bg-emerald-500',
      icon: <CheckCircle2 size={14} />,
    };
  }

  if (surat.status === 'MENUNGGU_PERBAIKAN') {
    return {
      type: 'MENUNGGU_PERBAIKAN',
      label: 'Menunggu Perbaikan',
      sublabel: surat.data_snapshot?.revision?.reason || 'Ada perubahan yang perlu ditindaklanjuti',
      barColor: 'bg-orange-500',
      badgeClass: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      accentClass: 'bg-orange-500',
      icon: <RefreshCw size={14} />,
    };
  }

  const currentSig = sigs.find(s => !s.is_signed && s.status !== 'REJECTED');
  return {
    type: 'PROSES',
    label: 'Proses',
    sublabel: currentSig ? `Menunggu: ${currentSig.role_name}` : 'Menunggu persetujuan',
    barColor: 'bg-amber-400',
    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    accentClass: 'bg-amber-400',
    icon: <Clock size={14} />,
  };
};

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all',          label: 'Semua' },
  { value: 'PROSES',       label: 'Proses' },
  { value: 'MENUNGGU_PERBAIKAN', label: 'Perlu Perbaikan' },
  { value: 'SELESAI',      label: 'Selesai' },
  { value: 'DITOLAK',      label: 'Ditolak' },
];

const buildMonitoringSummary = (surat: any): RegistrationSummaryData => {
  return buildRegistrationSummaryData(surat);
};

const isGenericRevisionReason = (value: unknown) => {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return !normalized ||
    normalized === 'instruksi utama' ||
    normalized === 'catatan revisi' ||
    normalized === 'tuliskan instruksi perbaikan' ||
    normalized === 'tulis instruksi perbaikan' ||
    normalized === 'instruksi perbaikan';
};

const getRevisionDisplayReason = (event: any) => {
  const reason = String(event?.reason || '').trim();
  if (!isGenericRevisionReason(reason)) {
    return reason;
  }
  const itemReason = Array.isArray(event?.changes?.item_revisions)
    ? event.changes.item_revisions
        .map((row: any) => String(row?.alasan || row?.reason || '').trim())
        .find(Boolean)
    : '';
  return itemReason || 'Perbaikan sudah tercatat pada detail item.';
};

// ── Main Component ────────────────────────────────────────────────────────

const MonitoringPage = () => {
  const { user } = useAuth() as any;
  const [search, setSearch] = useState('');
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') ?? 'all');
  const { openPdf, openFile, isOpening } = useDocumentOpener();
  const isAdminUser = ['admin', 'super_admin'].includes(String(user?.role || '').toLowerCase());
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedSurat, setSelectedSurat] = useState<any>(null);
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);
  const [rebuildingPdfId, setRebuildingPdfId] = useState<string | null>(null);
  const selectedSuratId = selectedSurat?.id || "";
  const canReadSelectedDocument = selectedSurat?.can_read_document !== false;

  const { data: selectedLinkedDocuments = [], isFetching: linkedDocumentsLoading } = useQuery({
    queryKey: ['surat-linked-documents', selectedSuratId],
    queryFn: () => suratService.getLinkedDocuments(selectedSuratId),
    enabled: Boolean(selectedSuratId && isDetailOpen && canReadSelectedDocument),
    staleTime: 15_000,
  });

  const { data: selectedRevisionHistory = [] } = useQuery({
    queryKey: ['surat-revision-history', selectedSuratId],
    queryFn: () => suratService.getRevisionHistory(selectedSuratId),
    enabled: Boolean(selectedSuratId && isDetailOpen && canReadSelectedDocument),
    staleTime: 10_000,
  });

  const activeRevisionEvent = selectedRevisionHistory.find((event: any) =>
    event.status === 'open' || event.status === 'awaiting_requester'
  );
  const canRequesterActOnRevision = Boolean(
    selectedSurat &&
    activeRevisionEvent &&
    selectedSurat.created_by === user?.id &&
    selectedSurat.status === 'MENUNGGU_PERBAIKAN'
  );

  const { data: pageData, isLoading, error: queryError } = useQuery({
    queryKey: ['surat-monitoring-list', page, deferredSearch, statusFilter, user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error("Sesi pengguna belum tersedia.");
      return suratMonitoringService.getPage({
        page,
        search: deferredSearch,
        status: statusFilter,
      });
    },
    enabled: Boolean(user?.id),
    placeholderData: (previous) => previous,
    staleTime: 20_000,
  });

  const allData = pageData?.rows || [];
  const totalPages = Math.max(1, Math.ceil((pageData?.count || 0) / (pageData?.pageSize || 24)));
  const selectedSignatures = getSortedApprovalSignatures(selectedSurat);

  const { data: monitoringStats } = useQuery({
    queryKey: ['surat-stats-dashboard'],
    queryFn: () => suratMonitoringService.getMyStats(),
    staleTime: 30_000,
  });

  const { data: selectedDetail } = useQuery({
    queryKey: ['surat-detail', selectedSuratId],
    queryFn: () => suratMonitoringService.getDetail(selectedSuratId),
    enabled: Boolean(selectedSuratId && isDetailOpen),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (selectedDetail) setSelectedSurat(selectedDetail);
  }, [selectedDetail]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, statusFilter]);

  const getAttachments = (surat: any) => {
    const attachments = Array.isArray(surat?.surat_attachments) ? surat.surat_attachments : [];
    if (attachments.length > 0) return attachments;
    return surat?.lampiran_path
      ? [{ id: 'legacy-lampiran', file_url: surat.lampiran_path, file_name: surat.lampiran_path.split('/').pop() }]
      : [];
  };

  const enriched = allData.map(s => {
    const sigs = getSortedApprovalSignatures(s);
    return { ...s, _sigs: sigs, _status: resolveStatus(s, sigs) };
  });

  const filtered = enriched.filter(s => {
    const matchSearch =
      (s.judul_surat?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (s.no_surat?.toLowerCase() || '').includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || s._status.type === statusFilter;
    return matchSearch && matchStatus;
  });

  if (queryError) return (
    <div className="h-screen flex items-center justify-center p-10 text-center">
      <div className="space-y-4">
        <AlertCircle className="mx-auto text-destructive" size={40} />
        <p className="text-sm font-bold uppercase tracking-widest">Connection Error</p>
        <p className="text-xs text-muted-foreground">{(queryError as any).message}</p>
      </div>
    </div>
  );

  return (
    <div className="sigap-page animate-in fade-in duration-300">
      {/* HEADER */}
      <div className="sigap-panel sigap-panel-accent flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-foreground">
              Status Pengajuan
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Pantau dokumen yang Anda ajukan atau ikuti.
          </p>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      {!isLoading && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 'Total Pengajuan', value: monitoringStats?.total ?? pageData?.count ?? 0, icon: <Inbox size={16} />, cls: 'text-foreground', bg: 'bg-muted/30' },
            { label: 'Selesai', value: monitoringStats?.selesai ?? 0, icon: <CheckCircle2 size={16} />, cls: 'text-emerald-400', bg: 'bg-emerald-500/5' },
            { label: 'Proses', value: monitoringStats?.proses ?? 0, icon: <Clock size={16} />, cls: 'text-amber-400', bg: 'bg-amber-500/5' },
            { label: 'Ditolak', value: monitoringStats?.ditolak ?? 0, icon: <XCircle size={16} />, cls: 'text-red-400', bg: 'bg-red-500/5' },
          ].map(card => (
            <div key={card.label} className={cn("flex min-h-[124px] flex-col rounded-lg border border-border p-5", card.bg)}>
              <div className={cn("mb-3", card.cls)}>{card.icon}</div>
              <p className="text-xs font-semibold text-muted-foreground">{card.label}</p>
              <p className={cn("mt-1 text-3xl font-semibold tabular-nums", card.cls)}>{card.value}</p>
              <p className="mt-0.5 text-xs font-medium text-muted-foreground">dari {monitoringStats?.total ?? pageData?.count ?? 0} pengajuan</p>
            </div>
          ))}
        </div>
      )}

      {/* FILTER */}
      <div className="sigap-panel space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-96 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary" size={16} />
            <Input
              placeholder="Cari judul atau nomor surat"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 pl-10 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={cn(
                  "px-4 py-2 rounded-lg text-[9px] font-black tracking-widest border transition-all uppercase",
                  statusFilter === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="h-64 flex flex-col items-center justify-center space-y-4">
          <Loader2 className="animate-spin text-primary" size={32} />
          <span className="text-sm text-muted-foreground">Mensinkronkan Dokumen...</span>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          variant="no-results"
          title="Tidak Ada Dokumen"
          description={search ? `Tidak ditemukan dokumen dengan kata kunci "${search}"` : "Belum ada dokumen pengajuan surat."}
          action={search ? { label: 'Reset Pencarian', onClick: () => setSearch('') } : undefined}
          icon={<Inbox size={40} strokeWidth={1} />}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-20">
          {filtered.map((surat) => {
            const { _sigs: sigs, _status: docStatus } = surat;
            const finishedCount = sigs.filter((s: any) => s.is_signed).length;
            const progress = sigs.length > 0 ? (finishedCount / sigs.length) * 100 : 0;

            return (
              <div
                key={surat.id}
                className="group flex flex-col p-6 bg-card border border-border rounded-2xl hover:border-primary/40 transition-all duration-300 shadow-sm relative overflow-hidden"
              >
                <div className={cn("absolute top-0 left-0 w-1.5 h-full", docStatus.accentClass)} />

                <div className="flex justify-between items-center mb-6">
                  <span className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium",
                    docStatus.badgeClass
                  )}>
                    {docStatus.icon}
                    {docStatus.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {new Date(surat.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                </div>

                <div className="flex-1 space-y-6">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground leading-tight line-clamp-2">
                      {surat.judul_surat}
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono bg-muted w-fit px-2 py-0.5 rounded">
                      {surat.no_surat || 'NO-REF-PENDING'}
                    </p>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between items-end">
                      <span className="text-xs text-muted-foreground">Pipeline Progress</span>
                      <span className="text-sm font-semibold text-primary">{Math.round(progress)}%</span>
                    </div>
                    <div className="flex gap-1.5 h-2 w-full rounded-full overflow-hidden">
                      {sigs.map((s: any, i: number) => {
                        const isCurrentWaiting = !s.is_signed && s.step_order === surat.current_step && docStatus.type === 'PROSES';
                        return (
                          <div
                            key={i}
                            className={cn(
                              "flex-1 rounded-full transition-all duration-500",
                              s.status === 'REJECTED' ? "bg-red-500" :
                              s.is_signed ? "bg-emerald-500" :
                              isCurrentWaiting ? "bg-amber-400 animate-pulse" :
                              "bg-muted"
                            )}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-border/40 space-y-3">
                  <div className="flex items-center gap-2 overflow-hidden flex-1">
                    <Info size={14} className="text-muted-foreground shrink-0" />
                    <span className="text-sm text-foreground/70 truncate">
                      {docStatus.sublabel}
                    </span>
                  </div>

                  <div className={cn("grid gap-2", surat.can_read_document === false ? "grid-cols-1" : "grid-cols-2")}>
                    <button
                      onClick={() => {
                        setSelectedSurat(surat);
                        setIsDetailOpen(true);
                      }}
                      className="h-11 flex items-center justify-center gap-2 rounded-xl bg-muted hover:bg-muted/80 transition-all border border-border text-sm font-medium"
                    >
                      <Info size={16} />
                      <span>Detail</span>
                    </button>
                    {surat.can_read_document !== false && (
                      <button
                        onClick={() => void openPdf(surat.id)}
                        disabled={isOpening(documentOperationKey.pdf(surat.id))}
                        className="h-11 flex items-center justify-center gap-2 rounded-xl bg-primary text-white hover:bg-primary/90 transition-all shadow-sm"
                      >
                        {isOpening(documentOperationKey.pdf(surat.id)) ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                        <span>{isOpening(documentOperationKey.pdf(surat.id)) ? "Menyiapkan" : "Preview"}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && (pageData?.count || 0) > (pageData?.pageSize || 24) && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Halaman {page} dari {totalPages} · {pageData?.count || 0} dokumen
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="rounded-md border border-border px-3 py-2 text-xs font-semibold disabled:opacity-40"
            >
              Sebelumnya
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              className="rounded-md border border-border px-3 py-2 text-xs font-semibold disabled:opacity-40"
            >
              Berikutnya
            </button>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="flex max-h-[94dvh] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden border-border bg-card p-0 sm:w-[calc(100vw-2rem)]">
          <DialogHeader className="shrink-0 border-b border-border bg-muted/20 px-5 py-4 pr-12 sm:px-7">
            <div className="flex items-center gap-4">
              <div className="bg-primary/10 p-2 rounded-lg"><Info className="text-primary" size={20} /></div>
              <div>
                <DialogTitle className="text-base font-semibold">Detail pengajuan</DialogTitle>
                <DialogDescription className="mt-1 text-xs text-muted-foreground sm:text-sm">
                  Ringkasan isi, berkas, dan progres persetujuan
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain bg-muted/10 p-3 sm:p-6">

            {selectedSurat && <RegistrationSummaryDocument data={buildMonitoringSummary(selectedSurat)} />}

            {selectedSurat?.can_read_document === false && (
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                Anda dapat memantau status pengajuan ini karena berada dalam lingkup organisasi yang sama. Isi dokumen dan lampiran hanya tersedia untuk pemohon, signer, verifier, dan admin.
              </div>
            )}

            {/* Status badge */}
            {selectedSurat && (() => {
              const st = resolveStatus(selectedSurat, selectedSignatures);
              return (
                <div className={cn("flex items-center gap-2 px-4 py-3 rounded-xl border text-[10px] font-black uppercase", st.badgeClass)}>
                  {st.icon} {st.label} — {st.sublabel}
                </div>
              );
            })()}

            {selectedRevisionHistory.length > 0 && (
              <div className="space-y-2 rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
                <div className="flex items-center gap-2 text-orange-600">
                  <RefreshCw size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Riwayat Perbaikan</span>
                </div>
                <div className="space-y-2">
                  {selectedRevisionHistory.map((event: any) => (
                    <div key={event.id} className="rounded-xl border border-border bg-background/80 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-foreground">
                            {event.actor_name || 'User'} mengembalikan proses
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {event.created_at ? new Date(event.created_at).toLocaleString('id-ID') : '-'}
                            {event.from_step ? ` · Tahap ${event.from_step}` : ''}
                          </p>
                        </div>
                        <span className={cn(
                          "rounded-full border px-2 py-1 text-[9px] font-black uppercase",
                          event.status === 'open' ? "border-orange-500/30 bg-orange-500/10 text-orange-600" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                        )}>
                          {event.status === 'open' ? 'Menunggu Perbaikan' : event.status === 'cancelled' ? 'Dibatalkan' : 'Selesai'}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-foreground">{getRevisionDisplayReason(event)}</p>
                      {event.changes?.item_revisions?.length > 0 && (
                        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                          <table className="w-full min-w-[560px] text-left text-xs">
                            <thead className="bg-muted/40 text-muted-foreground">
                              <tr>
                                <th className="px-3 py-2">Item</th>
                                <th className="px-3 py-2">Keputusan</th>
                                <th className="px-3 py-2">Nilai diajukan</th>
                                <th className="px-3 py-2">Nilai disetujui</th>
                                <th className="px-3 py-2">Alasan</th>
                              </tr>
                            </thead>
                            <tbody>
                              {event.changes.item_revisions.map((row: any, index: number) => (
                                <tr key={`${event.id}-${index}`} className="border-t border-border">
                                  <td className={cn("px-3 py-2 font-semibold", row.action === 'reject' && "text-muted-foreground line-through")}>{row.nama_barang || `Item ${Number(row.index || index) + 1}`}</td>
                                  <td className="px-3 py-2">{row.action === 'reject' ? 'Tidak disetujui' : row.action === 'adjust' ? 'Disetujui sebagian' : 'Tidak berubah'}</td>
                                  <td className="px-3 py-2">{row.nilai_diajukan || '-'}</td>
                                  <td className="px-3 py-2">{row.nilai_disetujui || '-'}</td>
                                  <td className="px-3 py-2">{row.alasan || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {canRequesterActOnRevision && (
                  <div className="flex flex-col gap-2 border-t border-orange-500/20 pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      Keputusan pemohon diproses dari halaman Tindak Lanjut agar riwayat dan notifikasinya tidak tercampur dengan monitoring.
                    </p>
                    <Button type="button" asChild>
                      <Link to={`/surat/tindak-lanjut?surat=${selectedSurat.id}`}>Buka Tindak Lanjut</Link>
                    </Button>
                  </div>
                )}
              </div>
            )}

            {(selectedSurat?.file_path || getAttachments(selectedSurat).length > 0 || selectedLinkedDocuments.length > 0 || linkedDocumentsLoading) && (
              <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileCheck size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Berkas Pengajuan</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedSurat?.file_path && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => void openPdf(selectedSurat.id)}
                        disabled={isOpening(documentOperationKey.pdf(selectedSurat.id))}
                        className="flex w-full items-center gap-3 p-3 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-all group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          {isOpening(documentOperationKey.pdf(selectedSurat.id)) ? <Loader2 size={16} className="animate-spin text-primary" /> : <FileCheck size={16} className="text-primary" />}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-[10px] font-black uppercase text-foreground tracking-widest">Dokumen</p>
                          <p className="text-[9px] text-muted-foreground truncate font-mono mt-0.5">
                            {isOpening(documentOperationKey.pdf(selectedSurat.id)) ? "Menyiapkan PDF..." : "PDF Preview"}
                          </p>
                        </div>
                        <ArrowUpRight size={14} className="text-primary shrink-0 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                      </button>
                      {isAdminUser && (() => {
                        const refreshKey = documentOperationKey.pdf(selectedSurat.id, "monitoring-refresh");
                        const refreshing = rebuildingPdfId === selectedSurat.id || isOpening(refreshKey);
                        return (
                          <button
                            type="button"
                            onClick={() => void (async () => {
                              if (refreshing) return;
                              setRebuildingPdfId(selectedSurat.id);
                              try {
                                await suratService.rebuildDocumentSource(selectedSurat.id);
                                await openPdf(selectedSurat.id, refreshKey, { refresh: true });
                              } catch (error) {
                                toast.error(error instanceof Error ? error.message : "Gagal membangun ulang dokumen.");
                              } finally {
                                setRebuildingPdfId(null);
                              }
                            })()}
                            disabled={refreshing}
                            className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 transition-all hover:bg-amber-500/15 dark:text-amber-300"
                          >
                            {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                            {refreshing ? "Membuat ulang PDF..." : "Buat Ulang PDF"}
                          </button>
                        );
                      })()}
                    </div>
                  )}

                  {getAttachments(selectedSurat).map((attachment: any, index: number) => {
                    const fileKey = documentOperationKey.file(selectedSurat.id, String(attachment.id || index));
                    return (
                    <button
                      key={attachment.id ?? attachment.file_url}
                      type="button"
                      onClick={() => void openFile(selectedSurat.id, attachment.file_url, fileKey)}
                      disabled={isOpening(fileKey)}
                      className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-all group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        {isOpening(fileKey) ? <Loader2 size={16} className="animate-spin text-primary" /> : <FileCheck size={16} className="text-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase text-foreground tracking-widest">Lampiran {index + 1}</p>
                        <p className="text-[9px] text-muted-foreground truncate font-mono mt-0.5">
                          {isOpening(fileKey) ? "Membuka lampiran..." : attachment.file_name || attachment.file_url.split('/').pop()}
                        </p>
                      </div>
                      <ArrowUpRight size={14} className="text-primary shrink-0 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </button>
                    );
                  })}
                  {linkedDocumentsLoading && (
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                      <Loader2 size={16} className="animate-spin text-primary" />
                      Memuat lampiran rekomendasi...
                    </div>
                  )}

                  {getActiveRecommendationDocuments(selectedLinkedDocuments).map((document) => {
                    const recommendationKey = documentOperationKey.pdf(document.suratId, `monitoring-recommendation-${document.id}`);
                    const opening = isOpening(recommendationKey);
                    return (
                      <button
                        key={document.id}
                        type="button"
                        onClick={() => void openPdf(document.suratId, recommendationKey)}
                        disabled={opening || !document.suratId}
                        className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-all group disabled:cursor-wait disabled:opacity-70"
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          {opening ? <Loader2 size={16} className="animate-spin text-primary" /> : <FileCheck size={16} className="text-primary" />}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-[10px] font-black uppercase text-foreground tracking-widest">{document.label}</p>
                          <p className="text-[9px] text-muted-foreground truncate font-mono mt-0.5">
                            {opening ? "Menyiapkan PDF..." : document.title}
                          </p>
                        </div>
                        <ArrowUpRight size={14} className="text-primary shrink-0 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SIGNATURE TIMELINE */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock size={14} />
                <span className="text-[10px] font-black uppercase tracking-widest">Timeline Persetujuan</span>
              </div>
              <div className="space-y-3 relative">
                <div className="absolute left-[13px] top-2 bottom-2 w-0.5 bg-border" />
                {selectedSignatures.map((sig: any) => (
                  <div key={sig.id} className="relative pl-9">
                    {/* Icon bubble */}
                    <div className={cn(
                      "absolute left-0 w-7 h-7 rounded-full flex items-center justify-center z-10 border-4 border-background",
                      sig.status === 'REJECTED' ? "bg-red-500 text-white" :
                      sig.is_signed ? "bg-emerald-500 text-white" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {sig.status === 'REJECTED' ? <XCircle size={12} /> :
                       sig.is_signed ? <CheckCircle2 size={12} /> :
                       <span className="text-[10px] font-bold">{sig.step_order}</span>}
                    </div>

                    {/* Card */}
                    <div className={cn(
                      "flex flex-col p-3 rounded-xl border bg-muted/5",
                      sig.status === 'REJECTED' ? "border-red-500/30 bg-red-500/5" : "border-border"
                    )}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase text-foreground">{sig.role_name}</span>
                        {sig.signed_at && (
                          <span className="font-mono text-[8px] text-muted-foreground opacity-60 shrink-0">
                            {new Date(sig.signed_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[9px] text-muted-foreground font-medium uppercase mt-0.5">
                        <User size={10} /> {(sig.profiles as any)?.full_name || 'Menunggu Antrian...'}
                      </div>

                      {/* ── Catatan penolakan ── */}
                      {sig.status === 'REJECTED' && sig.catatan && (
                        <div className="mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                          <p className="text-[9px] font-black uppercase text-red-400 mb-1 tracking-widest">Alasan Penolakan</p>
                          <p className="text-[11px] text-red-300/90 font-medium leading-relaxed">{sig.catatan}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {selectedSignatures.length === 0 && (
                  <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
                    Tahapan persetujuan belum tersedia.
                  </p>
                )}
              </div>
            </div>

          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default MonitoringPage;
