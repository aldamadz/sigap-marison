import { CheckCircle2, Clock, Download, FileText, Loader2 } from 'lucide-react';
import { SuratRegistrasi } from '@/types/surat';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from "@/lib/utils";
import { documentOperationKey, useDocumentOpener } from '@/hooks/useDocumentOpener';
import { approvalDotClass, type ApprovalBadgeTone } from '@/components/surat/approval-status-style';

export const MonitoringTimeline = ({ data, loading }: { data: SuratRegistrasi | null, loading: boolean }) => {
  const { openPdf, isOpening } = useDocumentOpener();

  if (loading) return (
    <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="animate-spin mr-2" /> Memuat data...</div>
  );

  if (!data) return (
    <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
      <FileText size={64} className="opacity-10 mb-4" />
      <p>Pilih dokumen untuk melihat progres</p>
    </div>
  );

  const steps = [...(data.surat_signatures || [])].sort((a, b) => a.step_order - b.step_order);

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <Card className="border-border/80 p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black tracking-tight">{data.judul_surat}</h1>
            <p className="text-sm text-muted-foreground font-mono mt-1">{data.no_surat || 'NOMOR BELUM TERBIT'}</p>
          </div>
          {data.status === 'SELESAI' && data.file_path && (() => {
            const pdfKey = documentOperationKey.pdf(data.id, "timeline");
            const opening = isOpening(pdfKey);
            return (
              <Button
                size="sm"
                className="gap-2"
                disabled={opening}
                onClick={() => void openPdf(data.id, pdfKey)}
              >
                {opening ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                {opening ? "Menyiapkan PDF" : "Buka PDF Final"}
              </Button>
            );
          })()}
        </div>
      </Card>

      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card/90 p-10 shadow-[var(--shadow-card)] backdrop-blur-sm">
        <div className="mb-10 flex items-center gap-2 text-muted-foreground">
          <Clock size={16} />
          <h3 className="text-xs font-bold uppercase tracking-widest">Alur Persetujuan Digital</h3>
        </div>

        <div className="space-y-0 relative">
          {steps.map((sig, idx) => {
            const isDone = sig.is_signed;
            const isRejected = sig.status === "REJECTED";
            const isCurrent = sig.step_order === data.current_step && !isDone && !isRejected;
            const isLast = idx === steps.length - 1;
            const tone: ApprovalBadgeTone = isRejected ? "rejected" : isDone ? "approved" : isCurrent ? "active" : "waiting";

            return (
              <div key={sig.id} className="relative flex gap-8 pb-12">
                {!isLast && (
                  <div className={cn("absolute left-[17.5px] top-10 h-full w-0.5 transition-colors", isDone ? 'bg-success' : 'bg-border')} />
                )}
                <div className={cn(
                  "relative z-10 flex h-9 w-9 items-center justify-center rounded-full shadow-[var(--shadow-card)] ring-8 ring-card transition-all",
                  approvalDotClass(tone),
                  isCurrent && "animate-pulse shadow-[0_0_24px_hsl(var(--primary)/0.22)]"
                )}>
                  {isDone ? <CheckCircle2 size={20} /> : <Clock size={18} />}
                </div>
                <div className="flex-1 pt-1">
                  <p className={cn("text-base font-bold leading-none", isCurrent ? "text-primary" : "text-foreground")}>{sig.role_name}</p>
                  <p className="mt-2 text-sm font-medium text-muted-foreground">{sig.profiles?.full_name}</p>
                  {isDone && (
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-tight text-success">
                      ✅ Disetujui: {new Date(sig.signed_at!).toLocaleString('id-ID')}
                    </p>
                  )}
                  {isRejected && (
                    <div className="mt-3 w-fit rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-destructive">
                      Ditolak
                    </div>
                  )}
                  {isCurrent && (
                    <div className="mt-3 w-fit rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                      Menunggu Persetujuan
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
