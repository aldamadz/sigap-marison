/**
 * Tampilan Tim (baca saja).
 *
 * Satu baris per anggota dengan hitungan selesai/total, berjalan,
 * terhambat, dan terlambat. Progres dihitung otomatis. Tidak ada aksi
 * ubah/hapus terhadap entry bawahan.
 */

import { ChevronDown, ChevronRight, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkEntryOwnerGroup } from "../types/work-calendar";
import { computeWorkProgress } from "../lib/work-progress";
import { WorkEntryList, type WorkCalendarViewInteractionProps } from "./WorkEntryList";

export interface TeamProgressViewProps {
  groups: readonly WorkEntryOwnerGroup[];
  interactions: WorkCalendarViewInteractionProps;
  expandedOwnerId: string | null;
  onToggleOwner: (ownerId: string) => void;
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
  const headingId = `work-team-heading-${group.owner.id}`;

  return (
    <li
      data-testid={`work-team-row-${group.owner.id}`}
      data-owner-id={group.owner.id}
      className="rounded-sm border border-border bg-card"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={`work-team-panel-${group.owner.id}`}
        className="flex min-h-touch w-full items-center gap-2 rounded-sm px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{group.owner.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {group.owner.jobTitle ?? "Anggota tim"}
          </span>
        </span>

        <span className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs">
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground" data-testid={`team-completed-${group.owner.id}`}>
              {progress.completed}
            </span>
            /{progress.total} selesai
          </span>
          <span className="text-pending" data-testid={`team-in-progress-${group.owner.id}`}>
            {progress.inProgress} berjalan
          </span>
          <span className="text-destructive" data-testid={`team-blocked-${group.owner.id}`}>
            {progress.blocked} terhambat
          </span>
          <span
            className={cn(progress.overdue > 0 ? "text-overdue" : "text-muted-foreground")}
            data-testid={`team-overdue-${group.owner.id}`}
          >
            {progress.overdue} terlambat
          </span>
        </span>
      </button>

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
  if (groups.length === 0) {
    return (
      <p className="rounded-sm border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
        <Users className="mx-auto mb-1.5 h-4 w-4" aria-hidden="true" />
        Belum ada anggota tim yang dapat ditampilkan.
      </p>
    );
  }

  return (
    <section aria-label="Tampilan tim" className="space-y-2">
      <h2 className="sr-only">Progres pekerjaan tim</h2>
      <ul className="space-y-2">
        {groups.map((group) => (
          <TeamOwnerRow
            key={group.owner.id}
            group={group}
            interactions={interactions}
            isExpanded={expandedOwnerId === group.owner.id}
            onToggle={() => onToggleOwner(group.owner.id)}
          />
        ))}
      </ul>
    </section>
  );
}
