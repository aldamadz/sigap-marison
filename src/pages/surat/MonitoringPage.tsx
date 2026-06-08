import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from "@/lib/supabase";
import {
  Search, Loader2, Info, Eye,
  Clock, AlertCircle, CheckCircle2, User, ArrowUpRight,
  FileCheck, XCircle, Inbox
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { documentPreviewService } from "@/services/document-preview.service";
import { toast } from "sonner";
import { EmptyState, EmptyList, ErrorState, EmptyGridSkeleton } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/Breadcrumbs';

// ── Helpers ───────────────────────────────────────────────────────────────

type DocStatus = 'PROSES' | 'SELESAI' | 'DITOLAK';

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
    return {
      type: 'DITOLAK',
      label: 'Ditolak',
      sublabel: rejectedSig ? `Ditolak pada tahap: ${rejectedSig.role_name}` : 'Ditolak',
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
  { value: 'SELESAI',      label: 'Selesai' },
  { value: 'DITOLAK',      label: 'Ditolak' },
];

// ── Main Component ────────────────────────────────────────────────────────

const MonitoringPage = () => {
  const [search, setSearch] = useState('');
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') ?? 'all');
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedSurat, setSelectedSurat] = useState<any>(null);

  const { data: allData = [], isLoading, error: queryError } = useQuery({
    queryKey: ['surat-monitoring-list'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session");

      const { data, error } = await supabase
        .from('surat_registrasi')
        .select(`
          *,
          surat_signatures (
            id, step_order, is_signed, status, role_name, signed_at, catatan,
            profiles:user_id ( full_name )
          ),
          surat_attachments ( id, file_url, file_name, file_type, file_size )
        `)
        .eq('created_by', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 10_000,
  });

  const handleOpenPreview = async (suratId: string, fallbackUrl: string) => {
    if (!fallbackUrl) return toast.error("File dokumen belum tersedia.");
    setPreviewingId(suratId);
    try {
      const pdfUrl = await documentPreviewService.getPdfUrl(suratId);
      await documentPreviewService.openStoredFileInNewTab(suratId, pdfUrl);
    } catch (error: any) {
      toast.error(error.message || "Gagal membuka PDF.");
    } finally {
      setPreviewingId(null);
    }
  };

  const handleOpenStoredFile = async (suratId: string, path: string | null | undefined) => {
    if (!path) return toast.error("File belum tersedia.");
    try {
      await documentPreviewService.openStoredFileInNewTab(suratId, path);
    } catch (error: any) {
      toast.error(error.message || "Gagal membuka file.");
    }
  };

  const getAttachments = (surat: any) => {
    const attachments = Array.isArray(surat?.surat_attachments) ? surat.surat_attachments : [];
    if (attachments.length > 0) return attachments;
    return surat?.lampiran_path
      ? [{ id: 'legacy-lampiran', file_url: surat.lampiran_path, file_name: surat.lampiran_path.split('/').pop() }]
      : [];
  };

  const enriched = allData.map(s => {
    const sigs = [...(s.surat_signatures || [])].sort((a, b) => a.step_order - b.step_order);
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
    <div className="space-y-8 animate-in fade-in duration-300">
      <Dialog open={!!previewingId}>
        <DialogContent className="max-w-sm rounded-3xl text-center">
          <DialogHeader>
            <DialogTitle className="flex flex-col items-center gap-3 text-sm font-black uppercase">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              PDF sedang dibuat
            </DialogTitle>
            <DialogDescription>
              Dokumen sedang diproses di background. PDF akan terbuka otomatis saat siap.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-2 h-8 bg-primary rounded-full shadow-[0_0_10px_rgba(var(--primary),0.5)]" />
            <h1 className="text-3xl font-black text-foreground tracking-tighter uppercase">
              Status <span className="text-primary/50 font-light tracking-widest">Pengajuan</span>
            </h1>
          </div>
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.4em] ml-5">
            Lacak pergerakan dokumen anda secara real-time
          </p>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      {!isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Pengajuan', value: enriched.length, icon: <Inbox size={16} />, cls: 'text-foreground', bg: 'bg-muted/30' },
            { label: 'Selesai',  value: enriched.filter(s => s._status.type === 'SELESAI').length,  icon: <CheckCircle2 size={16} />, cls: 'text-emerald-400', bg: 'bg-emerald-500/5' },
            { label: 'Proses',   value: enriched.filter(s => s._status.type === 'PROSES').length, icon: <Clock size={16} />, cls: 'text-amber-400', bg: 'bg-amber-500/5' },
            { label: 'Ditolak',  value: enriched.filter(s => s._status.type === 'DITOLAK').length,  icon: <XCircle size={16} />, cls: 'text-red-400', bg: 'bg-red-500/5' },
          ].map(card => (
            <div key={card.label} className={cn("flex flex-col p-5 rounded-2xl border border-border", card.bg)}>
              <div className={cn("mb-3", card.cls)}>{card.icon}</div>
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{card.label}</p>
              <p className={cn("text-3xl font-black mt-1 tabular-nums", card.cls)}>{card.value}</p>
              <p className="text-[9px] text-muted-foreground/60 font-bold uppercase mt-0.5">/ {enriched.length} items</p>
            </div>
          ))}
        </div>
      )}

      {/* FILTER */}
      <div className="space-y-6 bg-card/30 p-4 rounded-2xl border border-border/50 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-96 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary" size={16} />
            <Input
              placeholder="CARI JUDUL ATAU NOMOR SURAT..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-11 bg-background border-border rounded-xl uppercase text-[10px] font-bold tracking-widest"
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

                  <div className="grid grid-cols-2 gap-2">
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
                    <button
                      onClick={() => handleOpenPreview(surat.id, surat.file_path)}
                      disabled={previewingId === surat.id}
                      className="h-11 flex items-center justify-center gap-2 rounded-xl bg-primary text-white hover:bg-primary/90 transition-all shadow-sm"
                    >
                      {previewingId === surat.id ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                      <span>Preview</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DETAIL MODAL */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden bg-card border-border rounded-3xl shadow-2xl">
          <DialogHeader className="p-6 border-b border-border bg-muted/20">
            <div className="flex items-center gap-4">
              <div className="bg-primary/10 p-2 rounded-lg"><Info className="text-primary" size={20} /></div>
              <div>
                <DialogTitle className="text-sm font-black uppercase tracking-tight">Informasi Progress Dokumen</DialogTitle>
                <DialogDescription className="text-[10px] font-medium uppercase text-muted-foreground">
                  Riwayat persetujuan dan dokumen
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">

            {/* Status badge */}
            {selectedSurat && (() => {
              const st = selectedSurat._status as ResolvedStatus;
              return (
                <div className={cn("flex items-center gap-2 px-4 py-3 rounded-xl border text-[10px] font-black uppercase", st.badgeClass)}>
                  {st.icon} {st.label} — {st.sublabel}
                </div>
              );
            })()}

            {(selectedSurat?.file_path || getAttachments(selectedSurat).length > 0) && (
              <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileCheck size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Berkas Pengajuan</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedSurat?.file_path && (
                    <button
                      type="button"
                      onClick={() => handleOpenPreview(selectedSurat.id, selectedSurat.file_path)}
                      className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-all group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <FileCheck size={16} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase text-foreground tracking-widest">Dokumen</p>
                        <p className="text-[9px] text-muted-foreground truncate font-mono mt-0.5">
                          PDF Preview
                        </p>
                      </div>
                      <ArrowUpRight size={14} className="text-primary shrink-0 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </button>
                  )}

                  {getAttachments(selectedSurat).map((attachment: any, index: number) => (
                    <button
                      key={attachment.id ?? attachment.file_url}
                      type="button"
                      onClick={() => handleOpenStoredFile(selectedSurat.id, attachment.file_url)}
                      className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-all group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <FileCheck size={16} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase text-foreground tracking-widest">Lampiran {index + 1}</p>
                        <p className="text-[9px] text-muted-foreground truncate font-mono mt-0.5">
                          {attachment.file_name || attachment.file_url.split('/').pop()}
                        </p>
                      </div>
                      <ArrowUpRight size={14} className="text-primary shrink-0 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </button>
                  ))}
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
                {[...(selectedSurat?._sigs || [])].map((sig: any) => (
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
              </div>
            </div>

            {/* ADVICE FOOTER */}
            <div className="pt-4 border-t border-border">
              <div className="flex gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl text-amber-700">
                <Info size={16} className="shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-tight">Instruksi Revisi</p>
                  <p className="text-[10px] font-bold leading-normal opacity-90">
                    Jika terdapat catatan penolakan atau feedback perbaikan, silakan perbaiki file anda dan lakukan <span className="underline">Registrasi Ulang</span> untuk mendapatkan nomor surat baru atau mengikuti alur kembali.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default MonitoringPage;
