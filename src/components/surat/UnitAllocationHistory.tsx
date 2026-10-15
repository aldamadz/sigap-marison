import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { getUnitAllocationHistory } from "@/services/unit-allocation-history.service";

function HistoryContent({ suratId }: { suratId: string }) {
  const { data = [], isPending, isError, refetch } = useQuery({
    queryKey: ["surat-revision-history", suratId, "unit-allocation"],
    queryFn: () => getUnitAllocationHistory(suratId),
    staleTime: 10000,
    throwOnError: false,
  });
  if (isError) return <div role="alert" className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
    Riwayat pemeriksaan unit gagal dimuat.
    <Button variant="outline" size="sm" onClick={() => void refetch()}>Coba lagi</Button>
  </div>;
  if (isPending || data.length === 0) return null;
  return <section aria-label="Riwayat pemeriksaan unit" className="space-y-3 border-t pt-4">
    <h3 className="text-sm font-semibold">Riwayat pemeriksaan unit</h3>
    {data.map(row => <article key={row.id} className="space-y-2 border-l-2 border-primary pl-3">
      <p className="text-sm font-semibold">Diperiksa oleh {row.actor_name}</p>
      <p className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</p>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div><dt className="text-xs text-muted-foreground">Diajukan</dt><dd className="font-semibold">{row.requested_count} unit</dd></div>
        <div><dt className="text-xs text-muted-foreground">Siap bangun</dt><dd className="font-semibold">{row.allocated_count} unit</dd></div>
        <div><dt className="text-xs text-muted-foreground">Belum dipenuhi</dt><dd className="font-semibold">{row.remaining_count} unit</dd></div>
      </dl>
      {row.note && <p className="whitespace-pre-wrap break-words text-sm">Catatan: {row.note}</p>}
    </article>)}
  </section>;
}

export function UnitAllocationHistory({ suratId }: { suratId?: string }) {
  return suratId ? <HistoryContent suratId={suratId} /> : null;
}
