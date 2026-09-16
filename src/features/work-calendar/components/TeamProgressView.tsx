/**
 * Tampilan Tim (baca saja).
 *
 * Satu baris per anggota dengan urutan yang dapat dipindai:
 * - baris pertama: identitas (nama dan jabatan, tidak dipotong) serta rasio
 *   selesai/total;
 * - baris kedua: metrik lengkap `Direncanakan`, `Berjalan`, `Selesai`,
 *   `Terhambat`, dan indikator lintas status `Terlambat`;
 * - baris ketiga: batang rasio selesai yang ringkas.
 *
 * Progres dihitung otomatis dari status entry. `Terlambat` bukan bagian
 * penjumlahan status sehingga tidak pernah menambah total. Tidak ada aksi
 * ubah/hapus terhadap entry bawahan.
 */

import { ChevronDown, ChevronRight, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkProgressCounts, WorkEntryOwnerGroup, WorkDate } from "../types/work-calendar";
import { computeWorkCompletionPercent, computeWorkProgress } from "../lib/work-progress";
import { WorkEntryList, type WorkCalendarViewInteractionProps } from "./WorkEntryList";

export interface TeamProgressViewProps {
  groups: readonly WorkEntryOwnerGroup[];
  interactions: WorkCalendarViewInteractionProps;
  expandedOwnerId: string | null;
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

function TeamMetrics({ ownerId, progress }: { ownerId: string; progress: WorkProgressCounts }) {
  const items = [
    {
      key: "planned",
      label: "Direncanakan",
      value: progress.planned,
      tone: "text-muted-foreground",
    },
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
          <dd className={cn("font-semibold", item.tone)} data-testid={`team-${item.key}-${ownerId}`}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
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

  return (
    <li
      data-testid={`work-team-row-${group.owner.id}`}
      data-owner-id={group.owner.id}
      className="rounded-sm border border-border bg-card"
    >
      <div className="flex flex-col gap-1.5 px-3 py-2">
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
          <TeamMetrics ownerId={group.owner.id} progress={progress} />
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
  onToggleOwner,
}: TeamProgressViewProps) {
  const isFilteredToSingleOwner = groups.length === 1;

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
          {isFilteredToSingleOwner && (
            <p
              data-testid="work-team-filter-note"
              className="text-xs text-muted-foreground"
            >
              Menampilkan pekerjaan {groups[0].owner.name} saja.
            </p>
          )}

          <ul className="space-y-2">
            {groups.map((group) => (
              <TeamOwnerRow
                key={group.owner.id}
                group={group}
                interactions={interactions}
                isExpanded={expandedOwnerId === group.owner.id || groups.length === 1}
                onToggle={() => onToggleOwner(group.owner.id)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
