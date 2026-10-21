import { useQuery } from "@tanstack/react-query";
import { Code2, Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { marisonIntegrationService, type MarisonDispatchRow } from "@/services/marison-integration.service";

export function MarisonPayloadDialog({ row, onClose }: { row: MarisonDispatchRow; onClose: () => void }) {
  const query = useQuery({
    queryKey: ["marison-outbound-payload", row.environment, row.id],
    queryFn: () => marisonIntegrationService.getPayload(row.id),
    retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false,
  });
  const data = query.data;
  const json = data?.payload ? JSON.stringify(data.payload, null, 2) : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(json); toast.success("Payload disalin"); }
    catch { toast.error("Gagal menyalin payload. Pilih teks JSON untuk menyalinnya."); }
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="flex max-w-4xl min-w-0 flex-col overflow-hidden">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Code2 className="h-5 w-5 shrink-0" />Payload pengiriman</DialogTitle>
        <DialogDescription className="break-words">{row.noSurat} · Generasi {row.generation}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">{row.environment === "production" ? "Production" : "Staging"}</Badge>
        {data?.endpoint && <code className="break-all">{data.method} {data.endpoint}</code>}
      </div>
      {query.isPending ? <div role="status" className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Memuat payload</div>
        : query.isError ? <div role="alert" className="space-y-3 rounded-md border border-destructive/30 p-4 text-sm">
          <p>{query.error instanceof Error ? query.error.message : "Payload gagal dimuat."}</p>
          <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Coba lagi</Button>
        </div> : !json ? <p role="status" className="py-8 text-sm text-muted-foreground">Payload belum tersimpan untuk generasi ini.</p>
          : <>
            <p className="text-sm text-muted-foreground">{data?.source === "frozen" ? (data.postStartedAt ? "Payload tersimpan saat percobaan pengiriman. Tidak menandakan pengajuan diterima Marison." : "Payload tersimpan; POST ke Marison belum dimulai.") : "Snapshot tersimpan, bukan bukti payload yang pernah dikirim."} Referensi file internal dapat berbeda dari tautan yang dibentuk saat pengiriman.</p>
            {data?.redacted && <p className="text-sm text-amber-700 dark:text-amber-300">Field credential disembunyikan. Salinan ini bukan payload lengkap.</p>}
            <pre tabIndex={0} aria-label="JSON payload" className="max-h-[50dvh] min-h-0 min-w-0 shrink overflow-auto rounded-md border border-border bg-muted/40 p-4 font-mono text-xs leading-5">{json}</pre>
            {data?.payloadHash && <p className="break-all font-mono text-xs text-muted-foreground">SHA-256 tersimpan: {data.payloadHash}</p>}
          </>}
      <DialogFooter className="shrink-0">
        <Button variant="outline" onClick={onClose}>Tutup</Button>
        <Button disabled={!json || query.isError || query.isFetching} onClick={() => void copy()}><Copy className="mr-2 h-4 w-4" />Salin JSON</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
