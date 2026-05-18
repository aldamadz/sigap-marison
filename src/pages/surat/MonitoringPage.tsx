import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from "@/lib/supabase";
import { 
  Search, Loader2, MessageSquare, Info, Eye,
  Clock, AlertCircle, CheckCircle2, User, ArrowUpRight,
  FileCheck, Banknote, XCircle, FileClock, Inbox
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
import { PreviewModal } from "@/components/surat/PreviewModal";

// ── Helpers ───────────────────────────────────────────────────────────────

const getPaymentUrl = (path: string | null): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const key = path.startsWith('payment_files/') ? path.slice('payment_files/'.length) : path;
  return `https://xuhyodtmgwteyslhrkfx.supabase.co/storage/v1/object/public/payment_files/${key}`;
};

const getSpkUrl = (path: string | null): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const key = path.startsWith('spk_files/') ? path.slice('spk_files/'.length) : path;
  return `https://xuhyodtmgwteyslhrkfx.supabase.co/storage/v1/object/public/spk_files/${key}`;
};

type DocStatus = 'PROSES' | 'SELESAI' | 'DITOLAK' | 'MENUNGGU_PIC' | 'KEUANGAN';

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
  const pic = surat.pic_review_status as string | null;
  const hasRejectedSig = sigs.some(s => s.status === 'REJECTED');
  const allSigned = sigs.length > 0 && sigs.every(s => s.is_signed);

  if (hasRejectedSig || pic === 'REJECTED' || pic === 'KEUANGAN_REJECTED') {
    const byKeuangan = pic === 'KEUANGAN_REJECTED';
    const byPIC = pic === 'REJECTED';
    const rejectedSig = sigs.find(s => s.status === 'REJECTED');
    return {
      type: 'DITOLAK',
      label: 'Ditolak',
      sublabel: byKeuangan
        ? 'Ditolak Tim Keuangan'
        : byPIC
          ? 'Ditolak oleh PIC'
          : rejectedSig
            ? `Ditolak pada tahap: ${rejectedSig.role_name}`
            : 'Ditolak',
      barColor: 'bg-red-500',
      badgeClass: 'bg-red-500/10 text-red-400 border-red-500/20',
      accentClass: 'bg-red-500',
      icon: <XCircle size={11} />,
    };
  }

  if (allSigned && (pic === 'SPK' || pic === 'KEUANGAN_DONE')) {
    return {
      type: 'SELESAI',
      label: 'Selesai',
      sublabel: pic === 'KEUANGAN_DONE' ? 'Bukti transaksi diterima' : 'SPK diterbitkan',
      barColor: 'bg-emerald-500',
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      accentClass: 'bg-emerald-500',
      icon: <CheckCircle2 size={11} />,
    };
  }

  if (allSigned && pic === 'KEUANGAN') {
    return {
      type: 'KEUANGAN',
      label: 'Tim Keuangan',
      sublabel: 'Menunggu proses pembayaran',
      barColor: 'bg-blue-500',
      badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      accentClass: 'bg-blue-500',
      icon: <Banknote size={11} />,
    };
  }

  if (allSigned && !pic) {
    return {
      type: 'MENUNGGU_PIC',
      label: 'Review PIC',
      sublabel: 'Menunggu keputusan PIC',
      barColor: 'bg-amber-500',
      badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      accentClass: 'bg-amber-400',
      icon: <FileClock size={11} />,
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
    icon: <Clock size={11} />,
  };
};

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all',          label: 'Semua' },
  { value: 'PROSES',       label: 'Proses' },
  { value: 'MENUNGGU_PIC', label: 'Review PIC' },
  { value: 'KEUANGAN',     label: 'Keuangan' },
  { value: 'SELESAI',      label: 'Selesai' },
  { value: 'DITOLAK',      label: 'Ditolak' },
];

// ── Main Component ────────────────────────────────────────────────────────

const MonitoringPage = () => {
  const [search, setSearch] = useState('');
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') ?? 'all');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [selectedSurat, setSelectedSurat] = useState<any>(null);
  const [readFeedbacks, setReadFeedbacks] = useState<string[]>([]);

  const { data: allData = [], isLoading, error: queryError } = useQuery({
    queryKey: ['surat-monitoring-list'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session");

      const [{ data, error }, { data: picDeptData }] = await Promise.all([
        supabase
          .from('surat_registrasi')
          .select(`
            *,
            pic:profiles!surat_registrasi_pic_id_fkey ( full_name ),
            surat_signatures (
              id, step_order, is_signed, status, role_name, signed_at, catatan,
              profiles:user_id ( full_name )
            ),
            finance_reviews ( payment_file_path, status )
          `)
          .eq('created_by', session.user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('master_dept_pics')
          .select('user_id, dept:master_departments ( id, name, code )'),
      ]);

      if (error) throw error;

      const picDeptMap: Record<string, any[]> = {};
      for (const row of picDeptData ?? []) {
        if (!picDeptMap[row.user_id]) picDeptMap[row.user_id] = [];
        if (row.dept) picDeptMap[row.user_id].push(row.dept);
      }

      return (data ?? []).map((s: any) => ({ ...s, _pic_dept_list: picDeptMap[s.pic_id] ?? [] }));
    },
    refetchInterval: 10_000,
  });

  useEffect(() => {
    const saved = localStorage.getItem('read_pic_feedbacks');
    if (saved) setReadFeedbacks(JSON.parse(saved));
  }, []);

  const markAsRead = (suratId: string) => {
    if (!readFeedbacks.includes(suratId)) {
      const updated = [...readFeedbacks, suratId];
      setReadFeedbacks(updated);
      localStorage.setItem('read_pic_feedbacks', JSON.stringify(updated));
    }
  };

  const handleOpenPreview = async (suratId: string, fallbackUrl: string) => {
    const { data } = await supabase
      .from("surat_registrasi")
      .select("file_path")
      .eq("id", suratId)
      .single();
    const url = data?.file_path || fallbackUrl;
    if (!url) return;
    const stripped = url.split('?')[0];
    const decoded = decodeURIComponent(stripped);
    const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(decoded)}&wdPrint=0&wdEmbedCode=0`;
    setPreviewUrl(viewerUrl);
  };

  const enriched = allData.map(s => {
    const sigs = [...(s.surat_signatures || [])].sort((a, b) => a.step_order - b.step_order);
    const picName = (s.pic as any)?.full_name ?? null;

    const picDepts: any[] = s._pic_dept_list ?? [];
    const isKeuanganStatus = ['KEUANGAN', 'KEUANGAN_DONE', 'KEUANGAN_REJECTED'].includes(s.pic_review_status);
    const picDept = isKeuanganStatus
      ? picDepts.find((d: any) => d.code === 'KEU' || d.name?.toLowerCase().includes('keuangan'))
      : picDepts.find((d: any) => d.code !== 'KEU' && !d.name?.toLowerCase().includes('keuangan')) ?? picDepts[0];
    const picDeptName = picDept?.name ?? null;

    const paymentPath = (s.finance_reviews?.[0]?.payment_file_path) ?? null;
    const paymentUrl = getPaymentUrl(paymentPath);
    return { ...s, _sigs: sigs, _status: resolveStatus(s, sigs), _pic_name: picName, _pic_dept: picDeptName, _payment_url: paymentUrl };
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
    <div className="min-h-screen bg-background p-6 md:p-10 space-y-8 animate-in fade-in duration-700">

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
            { label: 'Proses',   value: enriched.filter(s => ['PROSES','MENUNGGU_PIC','KEUANGAN'].includes(s._status.type)).length, icon: <Clock size={16} />, cls: 'text-amber-400', bg: 'bg-amber-500/5' },
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

      {/* GRID */}
      {isLoading ? (
        <div className="h-64 flex flex-col items-center justify-center space-y-4">
          <Loader2 className="animate-spin text-primary" size={32} />
          <span className="text-muted-foreground font-bold text-[9px] tracking-[0.3em] uppercase">Mensinkronkan Dokumen...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center space-y-3 opacity-30">
          <Inbox size={40} strokeWidth={1} />
          <p className="text-[10px] font-black uppercase tracking-widest">Tidak Ada Dokumen</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-20">
          {filtered.map((surat) => {
            const { _sigs: sigs, _status: docStatus, _pic_name: picName } = surat;
            const finishedCount = sigs.filter((s: any) => s.is_signed).length;
            const progress = sigs.length > 0 ? (finishedCount / sigs.length) * 100 : 0;
            const hasNewFeedback = surat.pic_note && !readFeedbacks.includes(surat.id);

            return (
              <div
                key={surat.id}
                className="group flex flex-col p-6 bg-card border border-border rounded-2xl hover:border-primary/40 transition-all duration-300 shadow-sm relative overflow-hidden"
              >
                <div className={cn("absolute top-0 left-0 w-1.5 h-full", docStatus.accentClass)} />

                <div className="flex justify-between items-center mb-6">
                  <span className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border",
                    docStatus.badgeClass
                  )}>
                    {docStatus.icon}
                    {docStatus.label}
                  </span>
                  <div className="flex items-center gap-2">
                    {hasNewFeedback && (
                      <div className="relative">
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-ping" />
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
                        <MessageSquare size={14} className="text-primary" />
                      </div>
                    )}
                    <span className="text-[10px] font-bold text-muted-foreground tracking-tighter uppercase">
                      {new Date(surat.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                </div>

                <div className="flex-1 space-y-6">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-foreground leading-tight line-clamp-2 uppercase group-hover:text-primary transition-colors">
                      {surat.judul_surat}
                    </h3>
                    <p className="text-[10px] font-mono text-muted-foreground tracking-tighter bg-muted w-fit px-2 py-0.5 rounded uppercase">
                      {surat.no_surat || 'NO-REF-PENDING'}
                    </p>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between items-end">
                      <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Pipeline Progress</span>
                      <span className="text-xs font-black tabular-nums text-primary">{Math.round(progress)}%</span>
                    </div>
                    <div className="flex gap-1.5 h-1.5 w-full">
                      {sigs.map((s: any, i: number) => {
                        const isCurrentWaiting = !s.is_signed && s.step_order === surat.current_step && docStatus.type === 'PROSES';
                        return (
                          <div
                            key={i}
                            className={cn(
                              "flex-1 rounded-full transition-all duration-500",
                              s.status === 'REJECTED' ? "bg-red-500" :
                              s.is_signed ? "bg-emerald-500" :
                              isCurrentWaiting ? "bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.6)]" :
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
                    <Info size={12} className="text-muted-foreground shrink-0" />
                    <span className="text-[9px] font-black uppercase text-foreground/70 tracking-tight truncate">
                      {docStatus.sublabel}
                    </span>
                  </div>

                  {picName && (
                    <div className="flex items-center gap-2 overflow-hidden">
                      <User size={12} className="text-muted-foreground shrink-0" />
                      <span className="text-[9px] font-bold uppercase text-foreground/40 tracking-tight truncate">
                        Ditangani: {picName}{surat._pic_dept ? ` · ${surat._pic_dept}` : ''}
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        setSelectedSurat(surat);
                        setIsChatOpen(true);
                        markAsRead(surat.id);
                      }}
                      className="h-10 flex items-center justify-center gap-2 rounded-xl bg-muted text-foreground hover:bg-muted/80 transition-all border border-border"
                    >
                      <MessageSquare size={14} />
                      <span className="text-[9px] font-black uppercase tracking-widest">Detail</span>
                    </button>
                    <button
                      onClick={() => handleOpenPreview(surat.id, surat.file_path)}
                      className="h-10 flex items-center justify-center gap-2 rounded-xl bg-primary text-white hover:bg-primary/90 transition-all shadow-sm group/btn"
                    >
                      <Eye size={14} className="group-hover/btn:scale-110 transition-transform" />
                      <span className="text-[9px] font-black uppercase tracking-widest">Preview</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DETAIL & FEEDBACK MODAL */}
      <Dialog open={isChatOpen} onOpenChange={setIsChatOpen}>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden bg-card border-border rounded-3xl shadow-2xl">
          <DialogHeader className="p-6 border-b border-border bg-muted/20">
            <div className="flex items-center gap-4">
              <div className="bg-primary/10 p-2 rounded-lg"><Info className="text-primary" size={20} /></div>
              <div>
                <DialogTitle className="text-sm font-black uppercase tracking-tight">Informasi Progress Dokumen</DialogTitle>
                <DialogDescription className="text-[10px] font-medium uppercase text-muted-foreground">
                  Riwayat persetujuan & Feedback PIC
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
                  {selectedSurat._pic_name && (
                    <span className="ml-auto font-bold opacity-60 normal-case text-[9px]">
                      PIC {selectedSurat._pic_dept ?? ''}: {selectedSurat._pic_name}
                    </span>
                  )}
                </div>
              );
            })()}

            {selectedSurat?.pic_review_status === 'SPK' && !selectedSurat?.pic_attachment && (
              <div className="flex gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl text-amber-700">
                <Info size={16} className="shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-tight">SPK Belum Terlampir</p>
                  <p className="text-[10px] font-bold leading-normal opacity-90">
                    Status sudah SPK diterbitkan, tetapi file SPK belum tersimpan pada dokumen ini.
                  </p>
                </div>
              </div>
            )}

            {(selectedSurat?.file_path || selectedSurat?.lampiran_path) && (
              <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileCheck size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Berkas Pengajuan</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedSurat?.file_path && (
                    <a
                      href={selectedSurat.file_path}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-all group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <FileCheck size={16} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase text-foreground tracking-widest">Dokumen</p>
                        <p className="text-[9px] text-muted-foreground truncate font-mono mt-0.5">
                          {selectedSurat.file_path.split('/').pop()}
                        </p>
                      </div>
                      <ArrowUpRight size={14} className="text-primary shrink-0 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </a>
                  )}

                  {selectedSurat?.lampiran_path && (
                    <a
                      href={selectedSurat.lampiran_path}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-all group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <FileCheck size={16} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase text-foreground tracking-widest">Lampiran</p>
                        <p className="text-[9px] text-muted-foreground truncate font-mono mt-0.5">
                          {selectedSurat.lampiran_path.split('/').pop()}
                        </p>
                      </div>
                      <ArrowUpRight size={14} className="text-primary shrink-0 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* PIC FEEDBACK SECTION */}
            {selectedSurat?.pic_note && (
              <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="flex items-center gap-2 text-primary">
                  <MessageSquare size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Feedback dari Admin (PIC)</span>
                </div>
                <div className="bg-primary/5 p-4 rounded-2xl border-2 border-dashed border-primary/20">
                  <p className="text-xs font-bold text-foreground leading-relaxed italic">
                    "{selectedSurat.pic_note}"
                  </p>
                  {selectedSurat?.pic_attachment && (
                    <a
                      href={selectedSurat.pic_attachment}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-2 text-[9px] font-black text-primary bg-white px-3 py-1.5 rounded-lg border border-primary/20 hover:bg-primary hover:text-white transition-all uppercase"
                    >
                      <ArrowUpRight size={12} /> Lihat Lampiran PIC
                    </a>
                  )}
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

            {/* PIC Final Status */}
            {selectedSurat?.pic_review_status && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileCheck size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Keputusan PIC</span>
                </div>
                <div className={cn(
                  "flex flex-col gap-1 px-4 py-3 rounded-xl border text-[10px] font-black uppercase",
                  selectedSurat._status?.badgeClass
                )}>
                  <div className="flex items-center gap-2">
                    {selectedSurat._status?.icon}
                    {{
                      'SPK': 'SPK Diterbitkan — Proses selesai',
                      'KEUANGAN': 'Diteruskan ke Tim Keuangan',
                      'KEUANGAN_DONE': 'Bukti Transaksi Dikirim — Selesai',
                      'KEUANGAN_REJECTED': 'Ditolak oleh Tim Keuangan',
                      'REJECTED': `Ditolak oleh PIC ${selectedSurat._pic_dept ?? ''}`,
                    }[selectedSurat.pic_review_status] || selectedSurat.pic_review_status}
                  </div>
                  {selectedSurat._pic_name && (
                    <span className="text-[9px] font-bold normal-case opacity-70 pl-5">
                      {selectedSurat._pic_name}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* SPK */}
            {selectedSurat?.pic_attachment && (
              <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileCheck size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">SPK</span>
                </div>
                <a
                  href={getSpkUrl(selectedSurat.pic_attachment) || selectedSurat.pic_attachment}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <FileCheck size={16} className="text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">Lihat SPK</p>
                    <p className="text-[9px] text-muted-foreground truncate font-mono mt-0.5">
                      {selectedSurat.pic_attachment.split('/').pop()}
                    </p>
                  </div>
                  <ArrowUpRight size={14} className="text-emerald-400 shrink-0 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </a>
              </div>
            )}

            {/* BUKTI PEMBAYARAN */}
            {selectedSurat?._payment_url && (
              <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Banknote size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Bukti Pembayaran</span>
                </div>
                <a
                  href={selectedSurat._payment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <FileCheck size={16} className="text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">Lihat Bukti Transaksi</p>
                    <p className="text-[9px] text-muted-foreground truncate font-mono mt-0.5">
                      {selectedSurat._payment_url.split('/').pop()}
                    </p>
                  </div>
                  <ArrowUpRight size={14} className="text-emerald-400 shrink-0 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </a>
              </div>
            )}

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

      <PreviewModal
        isOpen={!!previewUrl}
        fileUrl={previewUrl || ""}
        onClose={() => setPreviewUrl(null)}
      />
    </div>
  );
};

export default MonitoringPage;
