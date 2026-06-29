import { CheckCircle2, Clock, Download, FileText, Loader2 } from 'lucide-react';
import { SuratRegistrasi } from '@/types/surat';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from "@/lib/utils";
import { documentOperationKey, useDocumentOpener } from '@/hooks/useDocumentOpener';

export const MonitoringTimeline = ({ data, loading }: { data: SuratRegistrasi | null, loading: boolean }) => {
  const { openPdf, isOpening } = useDocumentOpener();

  if (loading) return (
    <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="animate-spin mr-2" /> Memuat data...</div>
  );

  if (!data) return (
    <div className="h-full flex flex-col items-center justify-center text-slate-300 italic">
      <FileText size={64} className="opacity-10 mb-4" />
      <p>Pilih dokumen untuk melihat progres</p>
    </div>
  );

  const steps = [...(data.surat_signatures || [])].sort((a, b) => a.step_order - b.step_order);

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <Card className="p-6 border-slate-200">
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

      <div className="bg-white rounded-2xl border p-10 shadow-sm relative overflow-hidden">
        <div className="flex items-center gap-2 mb-10 text-slate-400">
          <Clock size={16} />
          <h3 className="text-xs font-bold uppercase tracking-widest">Alur Persetujuan Digital</h3>
        </div>

        <div className="space-y-0 relative">
          {steps.map((sig, idx) => {
            const isDone = sig.is_signed;
            const isCurrent = sig.step_order === data.current_step && !isDone;
            const isLast = idx === steps.length - 1;

            return (
              <div key={sig.id} className="relative flex gap-8 pb-12">
                {!isLast && (
                  <div className={cn("absolute left-[17.5px] top-10 w-0.5 h-full transition-colors", isDone ? 'bg-green-500' : 'bg-slate-100')} />
                )}
                <div className={cn(
                  "relative z-10 w-9 h-9 rounded-full flex items-center justify-center ring-8 ring-white transition-all shadow-md",
                  isDone ? 'bg-green-500 text-white shadow-green-100' : 
                  isCurrent ? 'bg-blue-600 text-white animate-pulse shadow-blue-100' : 'bg-slate-200 text-slate-400'
                )}>
                  {isDone ? <CheckCircle2 size={20} /> : <Clock size={18} />}
                </div>
                <div className="flex-1 pt-1">
                  <p className={cn("font-bold text-base leading-none", isCurrent ? "text-blue-700" : "text-slate-800")}>{sig.role_name}</p>
                  <p className="text-sm text-slate-500 mt-2 font-medium">{sig.profiles?.full_name}</p>
                  {isDone && (
                    <p className="text-[10px] text-green-600 font-bold mt-2 uppercase tracking-tight">
                      ✅ Disetujui: {new Date(sig.signed_at!).toLocaleString('id-ID')}
                    </p>
                  )}
                  {isCurrent && (
                    <div className="mt-3 px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-full w-fit border border-blue-100 uppercase tracking-wider">
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
