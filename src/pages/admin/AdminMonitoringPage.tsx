import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from "@/lib/supabase";
import { 
  Search, AlertCircle, Loader2, 
  MessageSquare, Info, Filter, History, FileText, Download, Calendar, User, Clock
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Import Komponen Lokal
import { SuratSummaryCards } from '@/components/dashboard/SuratSummaryCards';
import { documentOperationKey, useDocumentOpener } from "@/hooks/useDocumentOpener";

const MonitoringAdminPage = () => {
  // 1. STATES
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const { openPdf, openFile, isOpening } = useDocumentOpener();
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

  // 3. HELPER FORMAT TANGGAL & WAKTU
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
    <div className="flex h-screen items-center justify-center p-10 text-center">
      <div className="space-y-4">
        <AlertCircle className="mx-auto text-destructive" size={40} />
        <p className="text-sm font-semibold">Gagal memuat monitoring</p>
        <p className="text-xs text-muted-foreground">{(queryError as any).message}</p>
      </div>
    </div>
  );

  return (
    <div className="sigap-page animate-in fade-in duration-300">
      {/* HEADER SECTION */}
      <div className="sigap-panel sigap-panel-accent flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-foreground">
              Monitoring Admin
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Pantau seluruh pengajuan dan riwayat dokumen.
          </p>
        </div>
      </div>

      <SuratSummaryCards />

      {/* FILTER SECTION */}
      <div className="sigap-panel space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="relative w-full md:w-96 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary" size={16} />
            <Input 
              placeholder="Cari judul atau nomor surat"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 pl-10 text-sm"
            />
          </div>

          <div className="flex items-center gap-1 rounded-md border border-border bg-muted/50 p-1">
            {['all', 'today', 'week', 'month'].map((range) => (
              <button
                key={range}
                onClick={() => setDateFilter(range)}
                className={cn(
                  "rounded px-4 py-2 text-xs font-semibold transition-all",
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
            <span className="text-xs font-semibold text-muted-foreground">Status:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {['all', 'PROSES', 'SELESAI', 'REJECTED'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-md border px-3 py-1 text-xs font-semibold transition-all",
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
        <div className="flex h-64 flex-col items-center justify-center space-y-4">
          <Loader2 className="animate-spin text-primary" size={32} />
          <span className="text-sm font-medium text-muted-foreground">Memuat data...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 pb-20 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((surat) => {
            const sigs = [...(surat.surat_signatures || [])].sort((a,b) => a.step_order - b.step_order);
            const finishedCount = sigs.filter(s => s.is_signed).length;
            const progress = sigs.length > 0 ? (finishedCount / sigs.length) * 100 : 0;
            const currentSigner = sigs.find(s => s.step_order === surat.current_step);
            const lastNote = [...sigs].reverse().find(s => s.is_signed && s.catatan);

            return (
              <div key={surat.id} className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-card)] transition-all duration-200 hover:border-primary/40">
                <div className={cn(
                  "absolute top-0 left-0 w-1.5 h-full",
                  surat.status === 'SELESAI' ? "bg-emerald-500" : 
                  surat.status === 'REJECTED' ? "bg-red-500" : "bg-amber-500"
                )} />

                <div className="flex justify-between items-center mb-6">
                  <Badge variant="outline" className={cn(
                    "rounded-md border px-2 py-0.5 text-[11px] font-semibold shadow-none",
                    surat.status === 'SELESAI' && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
                    surat.status === 'REJECTED' && "bg-red-500/10 text-red-600 border-red-500/20",
                    surat.status === 'PROSES' && "bg-amber-500/10 text-amber-600 border-amber-500/20"
                  )}>
                    {surat.status}
                  </Badge>
                  <span className="text-xs font-medium text-muted-foreground">
                    {formatFullDate(surat.created_at)}
                  </span>
                </div>

                <div className="flex-1 space-y-6">
                  <div className="space-y-1">
                    <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-foreground transition-colors group-hover:text-primary">
                      {surat.judul_surat}
                    </h3>
                    <p className="w-fit rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {surat.no_surat || 'Nomor diproses'}
                    </p>
                  </div>

                  {lastNote && (
                    <div className="bg-muted/50 rounded-xl p-3 space-y-2 border border-border/50">
                      <div className="flex items-center gap-2 text-primary">
                         <MessageSquare size={12} />
                         <span className="text-xs font-semibold">Catatan Terakhir</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground italic leading-relaxed font-medium">
                        "{lastNote.catatan}"
                      </p>
                    </div>
                  )}

                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between items-end">
                      <span className="text-xs font-medium text-muted-foreground">Progres Dokumen</span>
                      <span className="text-xs font-semibold tabular-nums text-primary">{Math.round(progress)}%</span>
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
                    <span className="truncate text-xs font-semibold text-foreground/70">
                      {surat.status === 'PROSES' ? `Posisi: ${currentSigner?.role_name || 'Antrian'}` : 'Status Final'}
                    </span>
                  </div>
                  
                  <button 
                    onClick={() => setSelectedSurat(surat)}
                      className="group/btn flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-white shadow-sm transition-all hover:bg-primary/90"
                  >
                    <History size={16} className="group-hover/btn:rotate-[-20deg] transition-transform" />
                    <span className="text-xs font-semibold">Riwayat lengkap</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL AUDIT TRAIL LENGKAP */}
      <Dialog open={!!selectedSurat} onOpenChange={() => setSelectedSurat(null)}>
        <DialogContent className="max-w-3xl overflow-hidden border-border bg-card p-0">
          <DialogHeader className="border-b border-border bg-muted/20 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 p-2 rounded-lg"><FileText className="text-primary" size={20} /></div>
                <div>
                  <DialogTitle className="text-base font-semibold">Riwayat Dokumen</DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground">
                    {selectedSurat?.no_surat || 'Nomor belum tersedia'}
                  </DialogDescription>
                </div>
              </div>
              <button 
                onClick={() => selectedSurat?.id && void openPdf(selectedSurat.id, documentOperationKey.pdf(selectedSurat.id, "admin"))}
                disabled={!selectedSurat?.id || isOpening(documentOperationKey.pdf(selectedSurat.id, "admin"))}
                className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/10 px-3 py-1.5 text-primary transition-all hover:bg-primary hover:text-white"
              >
                {selectedSurat?.id && isOpening(documentOperationKey.pdf(selectedSurat.id, "admin")) ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                <span className="text-xs font-semibold">{selectedSurat?.id && isOpening(documentOperationKey.pdf(selectedSurat.id, "admin")) ? "Menyiapkan PDF" : "Unduh File"}</span>
              </button>
            </div>
          </DialogHeader>

          <div className="p-6 max-h-[70vh] overflow-y-auto">
            {getAttachments(selectedSurat).length > 0 && (
              <div className="mb-6 rounded-lg border border-border bg-muted/10 p-4">
                <p className="mb-3 text-sm font-semibold text-foreground">Lampiran</p>
                <div className="flex flex-wrap gap-2">
                  {getAttachments(selectedSurat).map((attachment: any, index: number) => {
                    const attachmentKey = documentOperationKey.file(selectedSurat.id, String(attachment.id ?? attachment.file_url ?? index));
                    const opening = isOpening(attachmentKey);
                    return (
                      <button
                        key={attachment.id ?? attachment.file_url}
                        type="button"
                        disabled={opening || !attachment.file_url}
                        onClick={() => void openFile(selectedSurat.id, attachment.file_url, attachmentKey)}
                        className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-primary hover:bg-muted disabled:cursor-wait disabled:opacity-70"
                      >
                        {opening ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        {opening ? "Membuka lampiran" : `Lampiran ${index + 1}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-8 relative">
              <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-border" />

              <div className="relative pl-12">
                <div className="absolute left-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center z-10 shadow-sm border-4 border-background text-white">
                  <Calendar size={12} />
                </div>
                <div className="space-y-1 rounded-lg border border-border bg-muted/10 p-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-semibold">Registrasi Dokumen</h4>
                    <span className="font-mono text-xs text-muted-foreground">{formatDateTime(selectedSurat?.created_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Dokumen didaftarkan ke sistem.</p>
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
                    "space-y-3 rounded-lg border p-4 transition-all",
                    sig.is_signed ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card"
                  )}>
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          {sig.role_name}
                          {sig.is_signed && <Badge className="h-5 bg-emerald-600 px-1.5 text-[11px] text-white">Selesai</Badge>}
                          {sig.status === 'REJECTED' && <Badge variant="destructive" className="h-5 px-1.5 text-[11px]">Ditolak</Badge>}
                        </div>
                        <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
                          <span className="flex items-center gap-1"><User size={12} /> {(sig.profiles as any)?.full_name || 'Menunggu antrean'}</span>
                          <span className="flex items-center gap-1"><Clock size={12} /> {formatDateTime(sig.signed_at)}</span>
                        </div>
                      </div>

                      {(sig.pdf_path_snap || sig.file_path_snap) && (() => {
                        const snapPath = sig.pdf_path_snap || sig.file_path_snap;
                        const snapKey = documentOperationKey.file(selectedSurat.id, String(sig.id || snapPath));
                        const opening = isOpening(snapKey);
                        return (
                          <button 
                            disabled={opening}
                            onClick={() => void openFile(selectedSurat.id, snapPath, snapKey)}
                            className="flex items-center gap-2 px-2 py-1 bg-background border border-border rounded text-primary hover:bg-muted transition-colors disabled:cursor-wait disabled:opacity-70"
                          >
                            {opening ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                            <span className="text-xs font-semibold">{opening ? "Membuka" : "Snap"}</span>
                          </button>
                        );
                      })()}
                    </div>

                    {sig.catatan && (
                      <div className="bg-background/50 p-2.5 rounded-lg border border-border/50">
                        <p className="text-xs italic leading-relaxed text-muted-foreground">
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
