import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from "@/lib/supabase";
import { 
  Search, AlertCircle, Loader2, 
  MessageSquare, Info, Filter, History, FileText, Download, Calendar, User, Clock
} from 'lucide-react';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription 
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from "sonner";

// Import Komponen Lokal
import { SuratSummaryCards } from '@/components/dashboard/SuratSummaryCards';
import { documentPreviewService } from "@/services/document-preview.service";

const MonitoringAdminPage = () => {
  // 1. STATES
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [selectedSurat, setSelectedSurat] = useState<any | null>(null);

  // 2. FETCH DATA
  const { data: allData = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: ['admin-monitoring-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surat_registrasi')
        .select(`
          *,
          surat_signatures (
            id, step_order, is_signed, role_name, 
            status, catatan, signed_at, file_path_snap, pdf_path_snap,
            profiles:user_id ( full_name )
          ),
          surat_attachments ( id, file_url, file_name, file_type, file_size )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 10000, 
  });

  // 3. LOGIKA PREVIEW
  const handleOpenGeneratedPdf = async (suratId?: string | null) => {
    if (!suratId) return;

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

  const handleOpenStoredFile = async (url?: string | null, suratId?: string | null) => {
    if (!url || !suratId) return;

    try {
      await documentPreviewService.openStoredFileInNewTab(suratId, url);
    } catch (error: any) {
      toast.error(error.message || "Gagal membuka file.");
    }
  };

  // 4. HELPER FORMAT TANGGAL & WAKTU
  const formatFullDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const getAttachments = (surat: any) => {
    const attachments = Array.isArray(surat?.surat_attachments) ? surat.surat_attachments : [];
    if (attachments.length > 0) return attachments;
    return surat?.lampiran_path
      ? [{ id: 'legacy-lampiran', file_url: surat.lampiran_path, file_name: surat.lampiran_path.split('/').pop() }]
      : [];
  };

  // 5. LOGIKA FILTERING
  const filtered = allData.filter(s => {
    const matchSearch = (s.judul_surat?.toLowerCase() || "").includes(search.toLowerCase()) ||
                        (s.no_surat?.toLowerCase() || "").includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;

    let matchDate = true;
    if (dateFilter !== 'all') {
      const createdDate = new Date(s.created_at);
      const now = new Date();
      if (dateFilter === 'today') matchDate = createdDate.toDateString() === now.toDateString();
      else if (dateFilter === 'week') {
        const weekAgo = new Date(); weekAgo.setDate(now.getDate() - 7);
        matchDate = createdDate >= weekAgo;
      } else if (dateFilter === 'month') {
        matchDate = createdDate.getMonth() === now.getMonth() && createdDate.getFullYear() === now.getFullYear();
      }
    }
    return matchSearch && matchStatus && matchDate;
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
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-2 h-8 bg-primary rounded-full shadow-[0_0_10px_rgba(var(--primary),0.5)]" />
            <h1 className="text-3xl font-black text-foreground tracking-tighter uppercase">
              Admin <span className="text-primary/50 font-light tracking-widest">Monitoring</span>
            </h1>
          </div>
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.4em] ml-5">
            Log Kendali Dokumen Terpusat
          </p>
        </div>
      </div>

      <SuratSummaryCards />

      {/* FILTER SECTION */}
      <div className="space-y-6 bg-card/30 p-4 rounded-2xl border border-border/50 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="relative w-full md:w-96 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary" size={16} />
            <Input 
              placeholder="CARI JUDUL ATAU NOMOR SURAT..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-11 bg-background border-border rounded-xl uppercase text-[10px] font-bold tracking-widest"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border/50">
            {['all', 'today', 'week', 'month'].map((range) => (
              <button
                key={range}
                onClick={() => setDateFilter(range)}
                className={cn(
                  "px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                  dateFilter === range ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {range === 'all' ? 'Semua' : range === 'today' ? 'Hari Ini' : range === 'week' ? 'Minggu' : 'Bulan'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border/50 pt-4">
          <div className="flex items-center gap-2 mr-2">
            <Filter size={12} className="text-muted-foreground" />
            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">Filter Status:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {['all', 'PROSES', 'SELESAI', 'REJECTED'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-3 py-1 rounded-full text-[9px] font-black tracking-widest border transition-all uppercase",
                  statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* LIST DATA */}
      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center space-y-4">
          <Loader2 className="animate-spin text-primary" size={32} />
          <span className="text-muted-foreground font-bold text-[9px] tracking-[0.3em] uppercase">Sinkronisasi Data...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-20">
          {filtered.map((surat) => {
            const sigs = [...(surat.surat_signatures || [])].sort((a,b) => a.step_order - b.step_order);
            const finishedCount = sigs.filter(s => s.is_signed).length;
            const progress = sigs.length > 0 ? (finishedCount / sigs.length) * 100 : 0;
            const currentSigner = sigs.find(s => s.step_order === surat.current_step);
            const lastNote = [...sigs].reverse().find(s => s.is_signed && s.catatan);

            return (
              <div key={surat.id} className="group flex flex-col p-6 bg-card border border-border rounded-2xl hover:border-primary/40 transition-all duration-300 shadow-sm relative overflow-hidden">
                <div className={cn(
                  "absolute top-0 left-0 w-1.5 h-full",
                  surat.status === 'SELESAI' ? "bg-emerald-500" : 
                  surat.status === 'REJECTED' ? "bg-red-500" : "bg-amber-500"
                )} />

                <div className="flex justify-between items-center mb-6">
                  <Badge variant="outline" className={cn(
                    "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border shadow-none",
                    surat.status === 'SELESAI' && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
                    surat.status === 'REJECTED' && "bg-red-500/10 text-red-600 border-red-500/20",
                    surat.status === 'PROSES' && "bg-amber-500/10 text-amber-600 border-amber-500/20"
                  )}>
                    {surat.status}
                  </Badge>
                  <span className="text-[10px] font-bold text-muted-foreground tracking-tighter uppercase">
                    {formatFullDate(surat.created_at)}
                  </span>
                </div>

                <div className="flex-1 space-y-6">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-foreground leading-tight line-clamp-2 uppercase group-hover:text-primary transition-colors">
                      {surat.judul_surat}
                    </h3>
                    <p className="text-[10px] font-mono text-muted-foreground tracking-tighter bg-muted w-fit px-2 py-0.5 rounded uppercase">
                      {surat.no_surat || 'NO-REF-SYSTEM'}
                    </p>
                  </div>

                  {lastNote && (
                    <div className="bg-muted/50 rounded-xl p-3 space-y-2 border border-border/50">
                      <div className="flex items-center gap-2 text-primary">
                         <MessageSquare size={12} />
                         <span className="text-[9px] font-black uppercase tracking-widest">Catatan Terakhir</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground italic leading-relaxed font-medium">
                        "{lastNote.catatan}"
                      </p>
                    </div>
                  )}

                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between items-end">
                      <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Progres Dokumen</span>
                      <span className="text-xs font-black tabular-nums text-primary">{Math.round(progress)}%</span>
                    </div>
                    <div className="flex gap-1.5 h-1.5 w-full">
                      {sigs.map((s, i) => {
                        const isCurrentWaiting = !s.is_signed && s.step_order === surat.current_step && surat.status === 'PROSES';
                        return (
                          <div 
                            key={i}
                            className={cn(
                              "flex-1 rounded-full transition-all duration-500",
                              s.status === 'REJECTED' ? "bg-red-500" :
                              s.is_signed ? "bg-emerald-500" : 
                              isCurrentWaiting ? "bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.6)]" : "bg-muted"
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
                      {surat.status === 'PROSES' ? `Posisi: ${currentSigner?.role_name || 'Antrian'}` : 'Status Final'}
                    </span>
                  </div>
                  
                  <button 
                    onClick={() => setSelectedSurat(surat)}
                    className="w-full h-10 flex items-center justify-center gap-2 rounded-xl bg-primary text-white hover:bg-primary/90 transition-all shadow-sm group/btn"
                  >
                    <History size={16} className="group-hover/btn:rotate-[-20deg] transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Riwayat Lengkap (History)</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL AUDIT TRAIL LENGKAP */}
      <Dialog open={!!selectedSurat} onOpenChange={() => setSelectedSurat(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden bg-card border-border rounded-2xl">
          <DialogHeader className="p-6 border-b border-border bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 p-2 rounded-lg"><FileText className="text-primary" size={20} /></div>
                <div>
                  <DialogTitle className="text-sm font-black uppercase tracking-tight">Audit Trail & History</DialogTitle>
                  <DialogDescription className="text-[10px] font-medium uppercase text-muted-foreground">
                    Log aktivitas digital untuk surat: {selectedSurat?.no_surat || 'N/A'}
                  </DialogDescription>
                </div>
              </div>
              <button 
                onClick={() => handleOpenGeneratedPdf(selectedSurat?.id)}
                disabled={previewingId === selectedSurat?.id}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary hover:text-white transition-all"
              >
                {previewingId === selectedSurat?.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                <span className="text-[9px] font-black uppercase">Unduh File</span>
              </button>
            </div>
          </DialogHeader>

          <div className="p-6 max-h-[70vh] overflow-y-auto">
            {getAttachments(selectedSurat).length > 0 && (
              <div className="mb-6 rounded-xl border border-border bg-muted/10 p-4">
                <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Lampiran</p>
                <div className="flex flex-wrap gap-2">
                  {getAttachments(selectedSurat).map((attachment: any, index: number) => (
                    <button
                      key={attachment.id ?? attachment.file_url}
                      type="button"
                      onClick={() => documentPreviewService.openStoredFileInNewTab(selectedSurat.id, attachment.file_url).catch((error: any) => toast.error(error.message || 'Gagal membuka lampiran.'))}
                      className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[9px] font-black uppercase text-primary hover:bg-muted"
                    >
                      <Download size={12} /> Lampiran {index + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-8 relative">
              <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-border" />

              <div className="relative pl-12">
                <div className="absolute left-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center z-10 shadow-sm border-4 border-background text-white">
                  <Calendar size={12} />
                </div>
                <div className="p-4 rounded-xl border border-border bg-muted/10 space-y-1">
                  <div className="flex justify-between items-center">
                    <h4 className="text-[11px] font-black uppercase">Registrasi Dokumen</h4>
                    <span className="text-[9px] font-mono text-muted-foreground">{formatDateTime(selectedSurat?.created_at)}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Dokumen berhasil didaftarkan ke dalam sistem oleh pengaju.</p>
                </div>
              </div>

              {[...(selectedSurat?.surat_signatures || [])].sort((a,b) => a.step_order - b.step_order).map((sig) => (
                <div key={sig.id} className="relative pl-12">
                  <div className={cn(
                    "absolute left-0 w-8 h-8 rounded-full flex items-center justify-center z-10 shadow-sm border-4 border-background transition-colors",
                    sig.is_signed ? "bg-emerald-500 text-white" : 
                    sig.status === 'REJECTED' ? "bg-red-500 text-white" : "bg-muted text-muted-foreground"
                  )}>
                    {sig.is_signed ? <Clock size={12} /> : <span className="text-[10px] font-bold">{sig.step_order}</span>}
                  </div>
                  
                  <div className={cn(
                    "p-4 rounded-xl border transition-all space-y-3",
                    sig.is_signed ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card"
                  )}>
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-1">
                        <div className="text-[11px] font-black uppercase tracking-tight flex items-center gap-2">
                          {sig.role_name}
                          {sig.is_signed && <Badge className="bg-emerald-500 text-white text-[8px] h-4 uppercase px-1">Approved</Badge>}
                          {sig.status === 'REJECTED' && <Badge variant="destructive" className="text-[8px] h-4 uppercase px-1">Rejected</Badge>}
                        </div>
                        <div className="flex items-center gap-4 text-[9px] text-muted-foreground font-medium uppercase">
                          <span className="flex items-center gap-1"><User size={10} /> {(sig.profiles as any)?.full_name || 'Menunggu Antrian...'}</span>
                          <span className="flex items-center gap-1"><Clock size={10} /> {formatDateTime(sig.signed_at)}</span>
                        </div>
                      </div>

                      {(sig.pdf_path_snap || sig.file_path_snap) && (
                        <button 
                          onClick={() => handleOpenStoredFile(sig.pdf_path_snap || sig.file_path_snap, selectedSurat.id)}
                          className="flex items-center gap-2 px-2 py-1 bg-background border border-border rounded text-primary hover:bg-muted transition-colors"
                        >
                          <Download size={10} />
                          <span className="text-[8px] font-black uppercase tracking-tighter">Snap</span>
                        </button>
                      )}
                    </div>

                    {sig.catatan && (
                      <div className="bg-background/50 p-2.5 rounded-lg border border-border/50">
                        <p className="text-[10px] italic text-muted-foreground leading-relaxed">
                          <MessageSquare size={10} className="inline mr-1 opacity-50" />
                          "{sig.catatan}"
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default MonitoringAdminPage;
