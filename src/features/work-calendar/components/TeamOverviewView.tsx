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

function TeamMetrics({ ownerId, progress }: { ownerId: string; progress: WorkProgressCounts }) {
  const items = [
    { key: "planned", label: "Direncanakan", value: progress.planned },
    { key: "in-progress", label: "Berjalan", value: progress.inProgress },
    { key: "completed", label: "Selesai", value: progress.completed },
    { key: "blocked", label: "Terhambat", value: progress.blocked },
    { key: "overdue", label: "Terlambat", value: progress.overdue },
  ] as const;

  return (
    <dl className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-1">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd
            className="font-semibold text-foreground"
            data-testid={`team-member-${item.key}-${ownerId}`}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
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

  return (
    <li
      data-testid={`team-member-${member.owner.id}`}
      className="rounded-sm border border-border bg-card"
    >
      <div className="flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {member.owner.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {member.owner.jobTitle ?? "Tanpa jabatan"}
              {identity.length > 0 ? ` · ${identity.join(" · ")}` : ""}
            </p>
          </div>
          <p className="shrink-0 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{member.progress.completed}</span>/
            <span>{member.progress.total}</span> selesai ({percent}%)
          </p>
        </div>

        <TeamMetrics ownerId={member.owner.id} progress={member.progress} />

        <div
          role="progressbar"
          aria-label={`Progres ${member.owner.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1.5 w-full overflow-hidden rounded-sm bg-muted"
        >
          <div className="h-full rounded-sm bg-primary" style={{ width: `${percent}%` }} />
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
  const members = overview.data?.members ?? [];
  const totalCount = overview.data?.totalCount ?? 0;
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

      <TeamAggregateProgress progress={aggregate} totalCount={totalCount} workDate={workDate} />

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
