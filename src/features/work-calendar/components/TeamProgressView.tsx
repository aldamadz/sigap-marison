/**
 * Tampilan Tim (baca saja).
 *
 * Daftar risiko operasional per anggota:
 * - baris pertama: penanda risiko `Terhambat`/`Terlambat` (hanya bila ada)
 *   sehingga terbaca paling pertama;
 * - baris kedua: identitas (nama dan jabatan, tidak dipotong) serta rasio
 *   selesai/total;
 * - baris ketiga: metrik lengkap `Direncanakan`, `Berjalan`, `Selesai`,
 *   `Terhambat`, dan indikator lintas status `Terlambat`;
 * - baris keempat: batang rasio selesai yang ringkas.
 *
 * Progres dihitung otomatis dari status entry. `Terlambat` bukan bagian
 * penjumlahan status sehingga tidak pernah menambah total. Tidak ada aksi
 * ubah/hapus terhadap entry bawahan.
 */

import { ChevronDown, ChevronRight, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  WorkEntryOwner,
  WorkEntryOwnerGroup,
  WorkDate,
} from "../types/work-calendar";
import { computeWorkCompletionPercent, computeWorkProgress } from "../lib/work-progress";
import { WorkEntryList, type WorkCalendarViewInteractionProps } from "./WorkEntryList";
import { TeamMemberMetrics, TeamMemberRiskBadges } from "./TeamMemberMetrics";

export interface TeamProgressViewProps {
  groups: readonly WorkEntryOwnerGroup[];
  interactions: WorkCalendarViewInteractionProps;
  expandedOwnerId: string | null;
  /**
   * Sumber kebenaran filter pemilik. Filter dianggap aktif hanya bila nilai ini
   * `true`, bukan karena jumlah kelompok hasil render (mis. atasan dengan satu
   * bawahan pada "Semua anggota").
   */
  isOwnerFiltered: boolean;
  /** Anggota yang sedang difilter; `null` saat "Semua anggota". */
  selectedOwner: WorkEntryOwner | null;
  onToggleOwner: (ownerId: string) => void;
}

/** Ringkasan progres kelompok yang sedang tampil (bukan seluruh tim). */
export function TeamScopeProgress({
  groups,
  today,
}: {
  groups: readonly WorkEntryOwnerGroup[];
  today: WorkDate;
}) {
  const progress = computeWorkProgress(
    groups.flatMap((group) => group.entries),
    today,
  );
  const percent = computeWorkCompletionPercent(progress);

  return (
    <p
      data-testid="work-team-scope-progress"
      className="rounded-sm border border-border bg-card px-3 py-2 text-xs text-muted-foreground"
    >
      <span className="font-semibold text-foreground" data-testid="team-scope-completed">
        {progress.completed}
      </span>{" "}
      selesai dari{" "}
      <span className="font-semibold text-foreground" data-testid="team-scope-total">
        {progress.total}
      </span>{" "}
      pekerjaan anggota yang ditampilkan ({percent}%)
      {progress.overdue > 0 ? (
        <>
          {" "}
          · <span className="font-medium text-overdue">{progress.overdue} terlambat</span>
        </>
      ) : null}
    </p>
  );
}

function TeamOwnerRow({
  group,
  interactions,
  isExpanded,
  onToggle,
}: {
  group: WorkEntryOwnerGroup;
  interactions: WorkCalendarViewInteractionProps;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const progress = computeWorkProgress(group.entries, interactions.today);
  const percent = computeWorkCompletionPercent(progress);
  const headingId = `work-team-heading-${group.owner.id}`;
  const hasRisk = progress.blocked > 0 || progress.overdue > 0;

  return (
    <li
      data-testid={`work-team-row-${group.owner.id}`}
      data-owner-id={group.owner.id}
      data-risk={hasRisk ? "true" : "false"}
      className={cn(
        "rounded-sm border",
        hasRisk ? "border-destructive/40 bg-destructive/5" : "border-border bg-card",
      )}
    >
      <div className="flex flex-col gap-1.5 px-3 py-2">
        {hasRisk && (
          <TeamMemberRiskBadges
            ownerId={group.owner.id}
            progress={progress}
            testIdPrefix="team"
          />
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={`work-team-panel-${group.owner.id}`}
          className="flex min-h-touch w-full items-start gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isExpanded ? (
            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}

          <span className="min-w-0 flex-1">
            <span className="block break-words text-sm font-medium text-foreground">
              {group.owner.name}
            </span>
            <span className="block break-words text-xs text-muted-foreground">
              {group.owner.jobTitle ?? "Anggota tim"}
            </span>
          </span>

          <span className="shrink-0 whitespace-nowrap pt-0.5 text-xs tabular-nums text-muted-foreground">
            <span
              className="font-semibold text-foreground"
              data-testid={`team-ratio-label-${group.owner.id}`}
            >
              {progress.completed}
            </span>
            /<span data-testid={`team-total-${group.owner.id}`}>{progress.total}</span> selesai
          </span>
        </button>

        <div className="pl-6">
          <TeamMemberMetrics ownerId={group.owner.id} progress={progress} testIdPrefix="team" />
        </div>

        <div
          role="progressbar"
          aria-label={`Rasio selesai ${group.owner.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${percent} persen selesai, ${progress.completed} dari ${progress.total} pekerjaan`}
          data-testid={`team-ratio-${group.owner.id}`}
          className="ml-6 h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-muted"
        >
          <span
            className="block h-full rounded-full bg-success transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div id={`work-team-panel-${group.owner.id}`} hidden={!isExpanded} className="border-t border-border px-3 py-2">
        <h3 id={headingId} className="sr-only">
          Pekerjaan {group.owner.name}
        </h3>
        <WorkEntryList
          entries={group.entries}
          emptyLabel="Belum ada pekerjaan tercatat untuk anggota ini."
          forceReadOnly
          labelledBy={headingId}
          {...interactions}
        />
      </div>
    </li>
  );
}

export function TeamProgressView({
  groups,
  interactions,
  expandedOwnerId,
  isOwnerFiltered,
  selectedOwner,
  onToggleOwner,
}: TeamProgressViewProps) {
  // Filter aktif ditentukan oleh `isOwnerFiltered` (efektif dari ownerFilterId),
  // bukan dari `groups.length === 1`. Atasan dengan tepat satu bawahan yang
  // masih memilih "Semua anggota" tidak boleh melihat catatan filter.
  const filteredOwner = isOwnerFiltered ? (selectedOwner ?? groups[0]?.owner ?? null) : null;

  return (
    <section aria-label="Tampilan tim" className="space-y-2">
      <h2 className="sr-only">Progres pekerjaan tim</h2>

      <TeamScopeProgress groups={groups} today={interactions.today} />

      {groups.length === 0 ? (
        <p
          data-testid="work-team-empty"
          className="rounded-sm border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground"
        >
          <Users className="mx-auto mb-1.5 h-4 w-4" aria-hidden="true" />
          Belum ada anggota tim yang dapat ditampilkan.
        </p>
      ) : (
        <>
          {filteredOwner && (
            <p data-testid="work-team-filter-note" className="text-xs text-muted-foreground">
              Menampilkan pekerjaan {filteredOwner.name} saja.
            </p>
          )}

          <ul className="space-y-2">
            {groups.map((group) => (
              <TeamOwnerRow
                key={group.owner.id}
                group={group}
                interactions={interactions}
                isExpanded={
                  expandedOwnerId === group.owner.id ||
                  (isOwnerFiltered && groups.length === 1)
                }
                onToggle={() => onToggleOwner(group.owner.id)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
