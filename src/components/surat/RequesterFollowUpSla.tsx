import { useQuery } from "@tanstack/react-query";
import { Clock3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatFollowUpMinutes,
  getRequesterFollowUpSlaStatus,
  requesterFollowUpSlaService,
} from "@/services/requester-follow-up-sla.service";

type Props = { eventId?: string; requesterId?: string; compact?: boolean };

export function RequesterFollowUpSla({ eventId, requesterId, compact = false }: Props) {
  const query = useQuery({
    queryKey: ["requester-follow-up-sla", requesterId, eventId],
    queryFn: () => requesterFollowUpSlaService.get(eventId!),
    enabled: Boolean(eventId),
    staleTime: 15_000,
    gcTime: 0,
    refetchInterval: 60_000,
    retry: false,
  });

  if (query.isLoading) return <div className="text-xs text-muted-foreground">Memuat SLA perbaikan...</div>;
  if (!eventId || query.isError || !query.data) {
    return <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>SLA perbaikan tidak tersedia</span>
      {!compact && eventId && <Button variant="ghost" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
        <RefreshCw className="mr-1 h-3 w-3" />Coba lagi
      </Button>}
    </div>;
  }

  const sla = query.data;
  const status = getRequesterFollowUpSlaStatus(sla);
  const timing = status.isLate
    ? `Terlambat ${formatFollowUpMinutes(status.lateMinutes)}`
    : status.remainingMinutes === 0 ? "Batas SLA tercapai" : `Sisa ${formatFollowUpMinutes(status.remainingMinutes)}`;
  const timingClass = status.isLate ? "text-destructive" : "text-emerald-700 dark:text-emerald-400";

  if (compact) return <div className={cn("mt-2 flex items-center gap-1.5 text-xs font-medium", timingClass)}>
    <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    <span className="break-words">SLA perbaikan: {timing}</span>
  </div>;

  const source = sla.config_source === "department"
    ? `Konfigurasi departemen pemohon${sla.department_name ? `: ${sla.department_name}` : ""}`
    : `Default KPI pemohon${sla.department_name ? `: ${sla.department_name}` : ""}`;
  const dateFormat = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium", timeStyle: "short", timeZone: sla.timezone,
  });

  return <section aria-label="SLA perbaikan" className="space-y-3 border-y border-border py-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4" aria-hidden="true" />SLA perbaikan</h3>
      <span className={cn("text-sm font-semibold", timingClass)}>{timing}</span>
    </div>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-4">
      <div className="min-w-0"><dt className="text-muted-foreground">Mulai permintaan revisi</dt><dd className="mt-1 break-words font-medium"><time dateTime={sla.started_at}>{dateFormat.format(new Date(sla.started_at))}</time><span className="block text-muted-foreground">{sla.timezone}</span></dd></div>
      <div className="min-w-0"><dt className="text-muted-foreground">Target perbaikan</dt><dd className="mt-1 break-words font-medium">{formatFollowUpMinutes(sla.sla_minutes)} kerja</dd></div>
      <div className="min-w-0"><dt className="text-muted-foreground">Terpakai</dt><dd className="mt-1 break-words font-medium">{formatFollowUpMinutes(sla.elapsed_minutes)} kerja</dd></div>
      <div className="min-w-0"><dt className="text-muted-foreground">Sisa</dt><dd className={cn("mt-1 break-words font-medium", timingClass)}>{formatFollowUpMinutes(status.remainingMinutes)} kerja</dd></div>
    </dl>
    <p className="break-words text-xs text-muted-foreground">{source}</p>
  </section>;
}
