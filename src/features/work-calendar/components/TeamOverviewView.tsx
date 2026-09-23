/**
 * Team Overview server-side (CAL-03 F4A Director Scale).
 *
 * Perbedaan penting dari `TeamProgressView` (client-side):
 * - daftar anggota dipaginasi di server; halaman ini tidak pernah memuat
 *   seluruh pekerjaan organisasi;
 * - ringkasan memakai agregat seluruh hasil filter dari server, bukan hanya
 *   anggota yang tampil di halaman ini;
 * - pekerjaan anggota dimuat saat anggota dibuka, satu anggota pada satu waktu.
 *
 * Seluruh tampilan bersifat baca saja: tidak ada aksi ubah/hapus pada entry
 * bawahan. Judul pekerjaan tetap dapat diklik untuk membuka detail.
 */

import { AlertCircle, ChevronDown, ChevronRight, RefreshCw, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { WorkDate, WorkEntry, WorkProgressCounts } from "../types/work-calendar";
import type {
  WorkTeamOverviewMember,
  WorkTeamOverviewOption,
} from "../types/work-team-overview";
import { computeWorkCompletionPercent, EMPTY_WORK_PROGRESS } from "../lib/work-progress";
import { formatWorkDateFull } from "../lib/work-calendar-date";
import type { UseWorkTeamOverviewResult } from "../hooks/use-work-team-overview";
import { useWorkTeamOverviewCompact } from "../hooks/use-work-team-overview-compact";
import type { WorkCalendarViewInteractionProps } from "./WorkEntryList";
import { WorkEntryList } from "./WorkEntryList";
import {
  TeamMemberMetrics,
  TeamMemberRiskBadges,
} from "./TeamMemberMetrics";
import {
  TeamOverviewFilterBar,
  TeamOverviewFilterPanel,
} from "./TeamOverviewFilters";

export interface TeamOverviewViewProps {
  overview: UseWorkTeamOverviewResult;
  interactions: WorkCalendarViewInteractionProps;
  workDate: WorkDate;
  departmentOptions: readonly WorkTeamOverviewOption[];
}

/**
 * Ringkasan organisasi dari agregat server: mencakup seluruh hasil filter,
 * bukan hanya anggota yang tampil di halaman ini.
 */
function TeamAggregateProgress({
  progress,
  totalCount,
  workDate,
}: {
  progress: WorkProgressCounts;
  totalCount: number;
  workDate: WorkDate;
}) {
  const percent = computeWorkCompletionPercent(progress);

  return (
    <p
      data-testid="work-team-overview-summary"
      className="rounded-sm border border-border bg-card px-3 py-2 text-xs text-muted-foreground"
    >
      <span className="font-semibold text-foreground" data-testid="team-overview-summary-completed">
        {progress.completed}
      </span>{" "}
      selesai dari{" "}
      <span className="font-semibold text-foreground" data-testid="team-overview-summary-total">
        {progress.total}
      </span>{" "}
      pekerjaan pada {totalCount} anggota hasil filter ({percent}%) ·{" "}
      {formatWorkDateFull(workDate)}
      {progress.overdue > 0 ? (
        <>
          {" "}
          · <span className="font-medium text-overdue">{progress.overdue} terlambat</span>
        </>
      ) : null}
      {progress.blocked > 0 ? (
        <>
          {" "}
          · <span className="font-medium text-destructive">{progress.blocked} terhambat</span>
        </>
      ) : null}
    </p>
  );
}

function TeamMemberCard({
  member,
  isExpanded,
  entries,
  entriesStatus,
  entriesError,
  interactions,
  onToggle,
  onRetry,
}: {
  member: WorkTeamOverviewMember;
  isExpanded: boolean;
  entries: readonly WorkEntry[];
  entriesStatus: UseWorkTeamOverviewResult["memberEntriesStatus"];
  entriesError: Error | null;
  interactions: WorkCalendarViewInteractionProps;
  onToggle: () => void;
  onRetry: () => void;
}) {
  const percent = computeWorkCompletionPercent(member.progress);
  const identity = [member.officeName, member.departmentName].filter(
    (value): value is string => Boolean(value),
  );
  // Anggota berisiko (ada pekerjaan terhambat/terlambat) diberi bobot visual
  // lebih besar: penanda risiko terbaca pertama, baru identitas dan progres.
  const hasRisk = member.progress.blocked > 0 || member.progress.overdue > 0;

  return (
    <li
      data-testid={`team-member-${member.owner.id}`}
      data-risk={hasRisk ? "true" : "false"}
      className={cn(
        "rounded-sm border",
        hasRisk ? "border-destructive/40 bg-destructive/5" : "border-border bg-card/70",
      )}
    >
      <div className={cn("flex flex-col gap-2", hasRisk ? "p-3" : "px-3 py-2.5")}>
        {hasRisk && (
          <TeamMemberRiskBadges
            ownerId={member.owner.id}
            progress={member.progress}
            testIdPrefix="team-member"
          />
        )}

        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p
              className={cn(
                "truncate text-foreground",
                hasRisk ? "text-sm font-semibold" : "text-sm font-medium",
              )}
            >
              {member.owner.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {member.owner.jobTitle ?? "Tanpa jabatan"}
              {identity.length > 0 ? ` · ${identity.join(" · ")}` : ""}
            </p>
          </div>
        </div>

        {/*
          Batang progres dan rasio digabung dalam satu baris. Sebelumnya rasio
          ditampilkan terpisah dari batang sehingga progres terbaca tiga kali
          (rasio, metrik "Selesai", batang).
        */}
        <div className="flex items-center gap-2">
          <div
            role="progressbar"
            aria-label={`Progres ${member.owner.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={`${percent} persen selesai, ${member.progress.completed} dari ${member.progress.total} pekerjaan`}
            className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted"
          >
            <div className="h-full rounded-sm bg-primary" style={{ width: `${percent}%` }} />
          </div>
          <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
            <span className="font-semibold text-foreground">{member.progress.completed}</span>/
            <span>{member.progress.total}</span> selesai ({percent}%)
          </p>
        </div>

        <div className={cn(hasRisk ? "" : "opacity-80")}>
          <TeamMemberMetrics
            ownerId={member.owner.id}
            progress={member.progress}
            testIdPrefix="team-member"
          />
        </div>

        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 rounded-sm"
            aria-expanded={isExpanded}
            data-testid={`team-member-toggle-${member.owner.id}`}
            onClick={onToggle}
          >
            {isExpanded ? (
              <ChevronDown aria-hidden="true" />
            ) : (
              <ChevronRight aria-hidden="true" />
            )}
            {isExpanded ? "Tutup pekerjaan" : "Lihat pekerjaan"}
          </Button>
        </div>

        {isExpanded && (
          <div className="space-y-2 border-t border-border pt-2">
            {entriesStatus === "loading" && (
              <p className="text-xs text-muted-foreground" role="status">
                Memuat pekerjaan {member.owner.name}…
              </p>
            )}
            {entriesStatus === "error" && (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-2 text-xs text-destructive"
              >
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{entriesError?.message ?? "Gagal memuat pekerjaan anggota."}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-11 rounded-sm"
                  onClick={onRetry}
                >
                  <RefreshCw aria-hidden="true" />
                  Coba lagi
                </Button>
              </div>
            )}
            {entriesStatus === "ready" && (
              <WorkEntryList
                entries={entries}
                emptyLabel={`Tidak ada pekerjaan ${member.owner.name} pada tanggal ini.`}
                forceReadOnly
                variant="full"
                {...interactions}
              />
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function TeamOverviewView({
  overview,
  interactions,
  workDate,
  departmentOptions,
}: TeamOverviewViewProps) {
  const isCompact = useWorkTeamOverviewCompact();
  // Anggota halaman lama tidak pernah dirender sebagai hasil halaman baru:
  // selama permintaan berjalan, daftar dikosongkan sampai data baru tiba.
  const members = overview.status === "ready" ? overview.data?.members ?? [] : [];
  const totalCount = overview.status === "ready" ? overview.data?.totalCount ?? 0 : 0;
  const aggregate: WorkProgressCounts = overview.data?.aggregate ?? EMPTY_WORK_PROGRESS;

  // Pekerjaan anggota yang sedang terbuka dimuat ulang lewat tombol ini.
  const retryMemberEntries = () => overview.reloadMemberEntries();

  return (
    <section data-testid="work-team-overview" className="space-y-3">
      {isCompact ? (
        <TeamOverviewFilterBar overview={overview} departmentOptions={departmentOptions} />
      ) : (
        <TeamOverviewFilterPanel
          overview={overview}
          departmentOptions={departmentOptions}
          variant="inline"
        />
      )}

      {overview.status === "ready" && (
        <TeamAggregateProgress progress={aggregate} totalCount={totalCount} workDate={workDate} />
      )}

      {overview.status === "loading" && (
        <p role="status" className="text-xs text-muted-foreground">
          Memuat ringkasan tim…
        </p>
      )}

      {overview.status === "error" && (
        <div
          role="alert"
          data-testid="team-overview-error"
          className="flex flex-wrap items-center gap-2 rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="flex-1">
            {overview.error?.message ?? "Gagal memuat ringkasan tim."}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 rounded-sm"
            onClick={overview.reload}
          >
            <RefreshCw aria-hidden="true" />
            Coba lagi
          </Button>
        </div>
      )}

      {overview.status === "ready" && members.length === 0 && (
        <p
          data-testid="team-overview-empty"
          className="rounded-sm border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground"
        >
          <Users className="mx-auto mb-1.5 h-4 w-4" aria-hidden="true" />
          Tidak ada anggota yang cocok dengan filter ini.
        </p>
      )}

      {members.length > 0 && (
        <ul className="space-y-2" aria-label="Daftar anggota tim">
          {members.map((member) => (
            <TeamMemberCard
              key={member.owner.id}
              member={member}
              isExpanded={overview.expandedMemberId === member.owner.id}
              entries={
                overview.expandedMemberId === member.owner.id ? overview.memberEntries : []
              }
              entriesStatus={
                overview.expandedMemberId === member.owner.id
                  ? overview.memberEntriesStatus
                  : "idle"
              }
              entriesError={overview.memberEntriesError}
              interactions={interactions}
              onToggle={() => overview.toggleMember(member.owner.id)}
              onRetry={retryMemberEntries}
            />
          ))}
        </ul>
      )}

      {overview.pageCount > 1 && (
        <nav
          aria-label="Navigasi halaman anggota"
          data-testid="team-overview-pagination"
          className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border bg-card px-3 py-2"
        >
          <Button
            type="button"
            variant="outline"
            className="h-11 shrink-0 rounded-sm"
            data-testid="team-overview-prev-page"
            disabled={overview.page <= 1 || overview.status === "loading"}
            onClick={() => overview.setPage(overview.page - 1)}
          >
            Sebelumnya
          </Button>
          <p className="text-xs text-muted-foreground" data-testid="team-overview-page-label">
            Halaman {overview.page} dari {overview.pageCount}
          </p>
          <Button
            type="button"
            variant="outline"
            className="h-11 shrink-0 rounded-sm"
            data-testid="team-overview-next-page"
            disabled={overview.page >= overview.pageCount || overview.status === "loading"}
            onClick={() => overview.setPage(overview.page + 1)}
          >
            Berikutnya
          </Button>
        </nav>
      )}
    </section>
  );
}
