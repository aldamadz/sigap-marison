/**
 * Metrik dan penanda risiko anggota tim (CAL-03 tahap 2).
 *
 * Dipakai ulang oleh `TeamOverviewView` (server-side) dan `TeamProgressView`
 * (client-side) sehingga ada satu temput penyajian metrik. Prefix testid
 * berbeda supaya kontrak test kedua view tidak saling menimpa:
 * - `team-member` untuk hasil server-side;
 * - `team` untuk fallback client-side.
 *
 * Urutan penyajian sengaja risiko di depan: `Terhambat` dan `Terlambat`
 * dibaca lebih dulu oleh atasan sebelum angka progres.
 */

import { AlertCircle, Hourglass } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkProgressCounts } from "../types/work-calendar";

export type TeamMemberMetricsPrefix = "team" | "team-member";

export interface TeamMemberMetricsProps {
  ownerId: string;
  progress: WorkProgressCounts;
  testIdPrefix: TeamMemberMetricsPrefix;
}

/**
 * Daftar metrik lengkap: Direncanakan, Berjalan, Selesai, Terhambat,
 * Terlambat. `Terlambat` bukan bagian penjumlahan status sehingga tidak pernah
 * menambah total.
 */
export function TeamMemberMetrics({
  ownerId,
  progress,
  testIdPrefix,
}: TeamMemberMetricsProps) {
  const items = [
    { key: "planned", label: "Direncanakan", value: progress.planned, tone: "text-muted-foreground" },
    { key: "in-progress", label: "Berjalan", value: progress.inProgress, tone: "text-pending" },
    { key: "completed", label: "Selesai", value: progress.completed, tone: "text-success" },
    { key: "blocked", label: "Terhambat", value: progress.blocked, tone: "text-destructive" },
    {
      key: "overdue",
      label: "Terlambat",
      value: progress.overdue,
      tone: progress.overdue > 0 ? "text-overdue" : "text-muted-foreground",
    },
  ] as const;

  return (
    <dl className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {items.map((item) => (
        <div key={item.key} className="inline-flex items-center gap-1">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd
            className={cn("font-semibold", item.tone)}
            data-testid={`${testIdPrefix}-${item.key}-${ownerId}`}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Penanda risiko operasional: hanya muncul bila ada pekerjaan terhambat atau
 * terlambat. Mengembalikan `null` untuk anggota tanpa risiko sehingga tidak
 * ada bobot visual yang sama dengan anggota bermasalah.
 */
export function TeamMemberRiskBadges({
  ownerId,
  progress,
  testIdPrefix,
}: TeamMemberMetricsProps) {
  if (progress.blocked <= 0 && progress.overdue <= 0) return null;

  return (
    <div
      data-testid={`${testIdPrefix}-risk-${ownerId}`}
      className="flex flex-wrap items-center gap-1.5"
    >
      {progress.blocked > 0 && (
        <span className="inline-flex items-center gap-1 rounded-sm border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          {progress.blocked} Terhambat
        </span>
      )}
      {progress.overdue > 0 && (
        <span className="inline-flex items-center gap-1 rounded-sm border border-overdue/30 bg-overdue/10 px-1.5 py-0.5 text-xs font-semibold text-overdue">
          <Hourglass className="h-3.5 w-3.5" aria-hidden="true" />
          {progress.overdue} Terlambat
        </span>
      )}
    </div>
  );
}
