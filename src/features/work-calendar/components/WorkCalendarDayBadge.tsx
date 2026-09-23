/**
 * Penanda visual hari libur / hari nonkerja (CAL-03 F6).
 *
 * Makna tidak pernah bergantung pada warna saja: selain latar yang diredupkan,
 * teks label selalu tersedia untuk pembaca layar dan pengguna yang tidak dapat
 * membedakan warna. Komponen ini murni presentasional; klasifikasi tanggal
 * datang dari `getWorkCalendarDayMeta`.
 */

import { CalendarOff, PartyPopper } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkCalendarDayMeta } from "../types/work-calendar";

export interface WorkCalendarDayBadgeProps {
  meta: WorkCalendarDayMeta;
  className?: string;
}

/** Label ringkas satu baris, mis. `Cuti bersama: Idul Fitri`. */
export function WorkCalendarDayBadge({ meta, className }: WorkCalendarDayBadgeProps) {
  if (meta.kind === "work_day" || !meta.label) return null;

  const isHoliday = meta.kind === "holiday";
  const Icon = meta.isCutiBersama ? PartyPopper : isHoliday ? PartyPopper : CalendarOff;

  return (
    <span
      data-testid={`work-day-badge-${meta.date}`}
      data-day-kind={meta.kind}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-1 text-[10px] font-medium",
        isHoliday ? "bg-warning/15 text-foreground" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{meta.label}</span>
    </span>
  );
}

/**
 * Kelas latar sel yang diredupkan untuk hari nonkerja dan diberi warna berbeda
 * untuk libur. Dipakai bersama tampilan Minggu dan Bulan supaya konsisten.
 * Hari pengisi (di luar bulan aktif) tetap lebih redup daripada hari aktif.
 */
export function getWorkCalendarDaySurfaceClassName(
  meta: WorkCalendarDayMeta | undefined,
  options: { isCurrentMonth?: boolean } = {},
): string {
  const { isCurrentMonth = true } = options;
  if (!meta || meta.kind === "work_day") {
    return isCurrentMonth ? "bg-card" : "bg-muted/40";
  }
  if (meta.kind === "holiday") {
    return isCurrentMonth ? "bg-warning/10" : "bg-warning/5";
  }
  return isCurrentMonth ? "bg-muted/60" : "bg-muted/40";
}
