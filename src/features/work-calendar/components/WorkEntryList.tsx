/**
 * Daftar entry pekerjaan yang dipakai ulang oleh seluruh view.
 *
 * `forceReadOnly` dipakai mode Tim supaya tidak pernah ada aksi ubah/hapus
 * pada entry bawahan, meskipun entry tersebut milik pengguna sendiri.
 */

import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

import type {
  WorkCalendarPermissions,
  WorkDate,
  WorkEntry,
  WorkEntryStatus,
} from "../types/work-calendar";
import type { WorkEntryStatusFollowUp } from "../lib/work-entry-status";
import { WorkEntryRow } from "./WorkEntryRow";

export interface WorkCalendarViewInteractionProps {
  today: WorkDate;
  permissions: WorkCalendarPermissions;
  promptEntryId: string | null;
  promptType: WorkEntryStatusFollowUp;
  savingEntryId: string | null;
  /**
   * Entry yang sedang dibuka detailnya (CAL-03 F4B). Dipakai untuk memberi
   * penanda visual pada baris terpilih di seluruh view.
   */
  selectedEntryId: string | null;
  onUpdateTitle: (entry: WorkEntry, title: string) => void;
  onRequestStatus: (entry: WorkEntry, status: WorkEntryStatus) => void;
  onSubmitFollowUp: (entry: WorkEntry, value: string) => void;
  onCancelFollowUp: () => void;
  onOpenDetail: (entry: WorkEntry) => void;
  onMoveToDate: (entry: WorkEntry, date: WorkDate) => void;
  onDelete: (entry: WorkEntry) => void;
}

export interface WorkEntryListProps extends WorkCalendarViewInteractionProps {
  entries: readonly WorkEntry[];
  emptyLabel: string;
  forceReadOnly?: boolean;
  labelledBy?: string;
  /** `compact` dipakai kolom minggu yang sempit. */
  variant?: "full" | "compact";
}

export function WorkEntryList({
  entries,
  emptyLabel,
  forceReadOnly = false,
  labelledBy,
  variant = "full",
  ...interactions
}: WorkEntryListProps) {
  if (entries.length === 0) {
    return (
      <p
        data-testid="work-entry-empty"
        className="rounded-sm border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground"
      >
        <Inbox className="mx-auto mb-2 h-5 w-5 text-muted-foreground/70" aria-hidden="true" />
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul
      aria-labelledby={labelledBy}
      data-testid="work-entry-list"
      data-variant={variant}
      className={cn(
        variant === "full"
          ? "flex flex-col gap-0" // The WorkEntryRow itself handles mb-3 and borders now
          : "divide-y divide-border/60",
      )}
    >
      {entries.map((entry) => {
        const isOwn = interactions.permissions.canEditEntry(entry);
        const readOnly = forceReadOnly || !isOwn;
        return (
          <WorkEntryRow
            key={entry.id}
            entry={entry}
            today={interactions.today}
            readOnly={readOnly}
            variant={variant}
            isSelected={interactions.selectedEntryId === entry.id}
            isSaving={interactions.savingEntryId === entry.id}
            promptType={interactions.promptEntryId === entry.id ? interactions.promptType : null}
            onUpdateTitle={(title) => interactions.onUpdateTitle(entry, title)}
            onRequestStatus={(status) => interactions.onRequestStatus(entry, status)}
            onSubmitFollowUp={(value) => interactions.onSubmitFollowUp(entry, value)}
            onCancelFollowUp={interactions.onCancelFollowUp}
            onOpenDetail={() => interactions.onOpenDetail(entry)}
            onMoveToDate={(date) => interactions.onMoveToDate(entry, date)}
            onDelete={() => interactions.onDelete(entry)}
          />
        );
      })}
    </ul>
  );
}
