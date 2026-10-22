import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Code2, Copy, Download, Loader2, RefreshCw } from "lucide-react";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { marisonIntegrationService, type MarisonDispatchRow } from "@/services/marison-integration.service";

export function MarisonPayloadDialog({ row, onClose }: { row: MarisonDispatchRow; onClose: () => void }) {
  const [view, setView] = useState("stored");
  const query = useQuery({
    queryKey: ["marison-outbound-payload", row.environment, row.id, view],
    queryFn: () => view === "latest" ? marisonIntegrationService.getLatestPayload(row.id) : view === "postman" ? marisonIntegrationService.getPostmanPayload(row.id) : marisonIntegrationService.getPayload(row.id),
    enabled: view !== "latest", retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const data = query.data;
  const json = data?.payload ? JSON.stringify(data.payload, null, 2) : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(json); toast.success("Payload disalin"); }
    catch { toast.error("Gagal menyalin payload. Pilih teks JSON untuk menyalinnya."); }
  };
  const download = () => {
    const name = row.noSurat.replace(/[^A-Za-z0-9_.-]/g, "_");
    saveAs(new Blob([json], { type: "application/json;charset=utf-8" }), `payload_${name}_${view}.json`);
  };
  const displayValue = (value: unknown, absent: boolean) => absent ? "(tidak ada)" : JSON.stringify(value);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="flex max-w-4xl min-w-0 flex-col overflow-hidden">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Code2 className="h-5 w-5 shrink-0" />Payload pengiriman</DialogTitle>
        <DialogDescription className="break-words">{row.noSurat} · Generasi {row.generation}</DialogDescription>
      </DialogHeader>
      <Tabs value={view} onValueChange={setView}>
        <TabsList aria-label="Versi payload" className="h-auto w-full flex-wrap justify-start gap-1 border border-border">
          <TabsTrigger value="stored">Payload terkirim</TabsTrigger>
          <TabsTrigger value="latest">Payload terbaru</TabsTrigger>
          {row.kind === "fund" && <TabsTrigger value="postman">Payload untuk Postman</TabsTrigger>}
        </TabsList>
      </Tabs>
      {view === "latest" && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <span className="text-sm text-muted-foreground">{data?.generatedAt ? `Dibuat ${new Date(data.generatedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}` : "Belum ada kandidat terbaru."}</span>
        <Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          {query.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Generate payload terbaru
        </Button>
      </div>}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">{row.environment === "production" ? "Production" : "Staging"}</Badge>
        {data?.endpoint && <code className="break-all">{data.method} {data.endpoint}</code>}
      </div>
      {query.isFetching ? <div role="status" className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Memuat payload</div>
        : query.isError ? <div role="alert" className="space-y-3 rounded-md border border-destructive/30 p-4 text-sm">
          <p>{query.error instanceof Error ? query.error.message : "Payload gagal dimuat."}</p>
          <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Coba lagi</Button>
        </div> : !json ? <p role="status" className="py-8 text-sm text-muted-foreground">{view === "latest" ? "Kandidat belum dibuat." : "Payload belum tersimpan untuk generasi ini."}</p>
          : <>
            {data?.source === "latest" ? <div className="min-h-0 space-y-3 overflow-y-auto text-sm">
              <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Validasi lulus</Badge><span className="text-muted-foreground">Kandidat terbaru; belum dikirim. Riwayat tetap utuh.</span></div>
              <p className="font-medium text-amber-700 dark:text-amber-300">{data.acceptedPreviously ? "Pengajuan ini sudah diterima external. Gunakan jalur koreksi, bukan POST ulang yang dapat membuat duplikat." : "Mengirim JSON dari Postman dapat membuat pengajuan nyata. Periksa status penerimaan terlebih dahulu."}</p>
              <details className="rounded-md border border-border" open={Boolean(data.fieldChanges?.length)}>
                <summary className="cursor-pointer px-3 py-2 font-medium">Perubahan dari payload historis ({data.fieldChanges?.length || 0})</summary>
                {data.fieldChanges?.length ? <div className="max-h-44 overflow-auto border-t border-border">
                  <table className="w-full table-fixed text-left text-xs"><thead><tr className="bg-muted/50"><th className="w-2/5 p-2">Field</th><th className="p-2">Sebelumnya</th><th className="p-2">Terbaru</th></tr></thead>
                    <tbody>{data.fieldChanges.map(change => <tr key={change.path} className="border-t border-border"><td className="break-all p-2 font-mono">{change.path}</td><td className="break-all p-2">{displayValue(change.before, change.added)}</td><td className="break-all p-2">{displayValue(change.after, change.removed)}</td></tr>)}</tbody>
                  </table>
                </div> : <p className="px-3 pb-3 text-muted-foreground">Tidak ada perbedaan data.</p>}
              </details>
            </div> : data?.source === "postman" ? <div className="space-y-1 text-sm text-muted-foreground">
              <p>Format untuk uji manual, bukan payload yang pernah dikirim. Riwayat dan antrean tidak diubah.</p>
              {data.changes?.map(change => <p key={change}>{change}</p>)}
              <p className="font-medium text-amber-700 dark:text-amber-300">POST dari Postman dapat membuat pengajuan nyata atau duplikat. Pastikan status penerimaan di Digivasi sebelum mengirim.{data.payload?.type === "marketing_cost" && " Dukungan marketing_cost di database vendor belum terverifikasi ulang."}</p>
            </div> : <p className="text-sm text-muted-foreground">{data?.source === "frozen" ? (data.postStartedAt ? "Payload tersimpan saat percobaan pengiriman. Tidak menandakan pengajuan diterima Marison." : "Payload tersimpan; POST ke Marison belum dimulai.") : "Snapshot tersimpan, bukan bukti payload yang pernah dikirim."} Referensi file internal dapat berbeda dari tautan yang dibentuk saat pengiriman.</p>}
            {data?.redacted && <p className="text-sm text-amber-700 dark:text-amber-300">Field credential disembunyikan. Salinan ini bukan payload lengkap.</p>}
            <pre tabIndex={0} aria-label="JSON payload" className="max-h-[50dvh] min-h-0 min-w-0 shrink overflow-auto rounded-md border border-border bg-muted/40 p-4 font-mono text-xs leading-5">{json}</pre>
            {data?.payloadHash && <p className="break-all font-mono text-xs text-muted-foreground">{["postman", "latest"].includes(data.source) ? "SHA-256 kandidat" : "SHA-256 tersimpan"}: {data.payloadHash}</p>}
          </>}
      <DialogFooter className="shrink-0">
        <Button variant="outline" onClick={onClose}>Tutup</Button>
        <Button variant="outline" disabled={!json || query.isError || query.isFetching} onClick={download}><Download className="mr-2 h-4 w-4" />Unduh JSON</Button>
        <Button disabled={!json || query.isError || query.isFetching} onClick={() => void copy()}><Copy className="mr-2 h-4 w-4" />Salin JSON</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
