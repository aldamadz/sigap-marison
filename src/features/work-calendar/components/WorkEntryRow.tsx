/**
 * Baris entry pekerjaan untuk tampilan Hari dan hasil pencarian.
 *
 * Prinsip:
 * - status selalu memakai ikon + label, bukan warna saja;
 * - realisasi hanya tampil bila sudah diisi;
 * - indikator waktu hanya tampil bila jam diisi;
 * - status `completed`/`blocked` meminta input lanjutan secara inline,
 *   tanpa membuka modal besar;
 * - seluruh target sentuh minimal 44px dan tidak ada overflow horizontal.
 */

import { useEffect, useRef, useState } from "react";
import { CalendarClock, Check, Ellipsis, Eye, Hourglass, MapPin, Pencil, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WorkDate, WorkEntry, WorkEntryStatus } from "../types/work-calendar";
import {
  compareWorkEntries,
  getWorkEntryStatusLabel,
  isWorkEntryOverdue,
  WORK_ENTRY_STATUS_ORDER,
  type WorkEntryStatusFollowUp,
} from "../lib/work-entry-status";
import {
  formatWorkDateShort,
  formatWorkTimeLabelFromIso,
  shiftWorkDate,
  workWeekDates,
} from "../lib/work-calendar-date";
import { normalizeWorkEntryTitle } from "../lib/work-entry-validation";
import { WorkEntryStatusGlyph } from "./WorkEntryStatusGlyph";

export interface WorkEntryRowProps {
  entry: WorkEntry;
  today: WorkDate;
  readOnly?: boolean;
  isSaving?: boolean;
  promptType?: WorkEntryStatusFollowUp;
  /**
   * `compact` dipakai kolom minggu yang sempit: menyembunyikan deretan
   * tombol status agar judul tetap terbaca, tanpa kehilangan menu tindakan.
   */
  variant?: "full" | "compact";
  onUpdateTitle: (title: string) => void;
  onRequestStatus: (status: WorkEntryStatus) => void;
  onSubmitFollowUp: (value: string) => void;
  onCancelFollowUp: () => void;
  onOpenDetail: () => void;
  onMoveToDate: (date: WorkDate) => void;
  onDelete: () => void;
}

export function WorkEntryRow({
  entry,
  today,
  readOnly = false,
  isSaving = false,
  promptType = null,
  variant = "full",
  onUpdateTitle,
  onRequestStatus,
  onSubmitFollowUp,
  onCancelFollowUp,
  onOpenDetail,
  onMoveToDate,
  onDelete,
}: WorkEntryRowProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(entry.title);
  const [followUpDraft, setFollowUpDraft] = useState("");
  const followUpRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditingTitle) setTitleDraft(entry.title);
  }, [entry.title, isEditingTitle]);

  useEffect(() => {
    if (isEditingTitle) titleInputRef.current?.focus();
  }, [isEditingTitle]);

  useEffect(() => {
    if (promptType) {
      setFollowUpDraft("");
      followUpRef.current?.focus();
    }
  }, [promptType]);

  const overdue = isWorkEntryOverdue(entry, today);
  const startLabel = formatWorkTimeLabelFromIso(entry.startsAt);
  const endLabel = formatWorkTimeLabelFromIso(entry.endsAt);
  const hasTimeIndicator = !entry.isAllDay && Boolean(startLabel);

  const commitTitle = () => {
    const normalized = normalizeWorkEntryTitle(titleDraft);
    setIsEditingTitle(false);
    if (normalized.length === 0 || normalized === entry.title) {
      setTitleDraft(entry.title);
      return;
    }
    onUpdateTitle(normalized);
  };

  return (
    <li
      data-testid={`work-entry-row-${entry.id}`}
      data-owner-id={entry.ownerId}
      data-entry-status={entry.status}
      data-row-variant={variant}
      className={cn(
        "rounded-sm border bg-card",
        variant === "compact" ? "px-1.5 py-1.5" : "px-3 py-2.5",
        overdue ? "border-overdue/40" : "border-border",
      )}
    >
      <div className={cn("flex items-start", variant === "compact" ? "gap-1" : "gap-2")}>
        <span className="mt-1.5 shrink-0">
          <WorkEntryStatusGlyph status={entry.status} />
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          {isEditingTitle && !readOnly ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              aria-label={`Judul pekerjaan ${entry.title}`}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitTitle();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setTitleDraft(entry.title);
                  setIsEditingTitle(false);
                }
              }}
              className="h-11 w-full rounded-sm border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          ) : (
            <button
              type="button"
              disabled={readOnly}
              onClick={() => {
                if (readOnly) return;
                setIsEditingTitle(true);
              }}
              aria-label={
                readOnly
                  ? `Pekerjaan ${entry.title}`
                  : `Ubah judul pekerjaan ${entry.title}. Tekan Enter untuk mengubah.`
              }
              className={cn(
                "flex w-full min-h-touch items-center rounded-sm text-left font-medium leading-snug text-foreground",
                variant === "compact" ? "text-xs" : "text-sm",
                readOnly
                  ? "cursor-default"
                  : "hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                entry.status === "completed" && "text-muted-foreground line-through",
              )}
            >
              <span className="min-w-0 break-words">{entry.title}</span>
            </button>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1" data-testid={`work-entry-status-label-${entry.id}`}>
              <WorkEntryStatusGlyph status={entry.status} />
              {getWorkEntryStatusLabel(entry.status)}
            </span>

            {hasTimeIndicator && (
              <span data-testid={`work-entry-time-${entry.id}`} className="inline-flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                {endLabel ? `${startLabel} - ${endLabel}` : startLabel}
              </span>
            )}

            {entry.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">Lokasi: </span>
                {entry.location}
              </span>
            )}

            {overdue && (
              <span
                data-testid={`work-entry-overdue-${entry.id}`}
                className="inline-flex items-center gap-1 font-medium text-overdue"
              >
                <Hourglass className="h-3.5 w-3.5" aria-hidden="true" />
                Terlambat {formatWorkDateShort(entry.workDate)}
              </span>
            )}
          </div>

          {entry.realization && (
            <p data-testid={`work-entry-realization-${entry.id}`} className="text-xs text-foreground/80">
              <span className="font-medium">Hasil: </span>
              {entry.realization}
            </p>
          )}

          {entry.status === "blocked" && entry.blockedReason && (
            <p data-testid={`work-entry-blocked-${entry.id}`} className="text-xs text-destructive">
              <span className="font-medium">Terhambat: </span>
              {entry.blockedReason}
            </p>
          )}

          {promptType !== null && (
            <div className="space-y-1.5 rounded-sm border border-input bg-muted/40 p-2">
              <label
                htmlFor={`work-entry-follow-up-${entry.id}`}
                className="block text-xs font-medium text-foreground"
              >
                {promptType === "realization" ? "Hasil pekerjaan" : "Alasan terhambat"}
                <span className="text-destructive"> *</span>
              </label>
              <textarea
                id={`work-entry-follow-up-${entry.id}`}
                ref={followUpRef}
                value={followUpDraft}
                rows={2}
                onChange={(event) => setFollowUpDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    onCancelFollowUp();
                  }
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    if (followUpDraft.trim().length === 0) return;
                    onSubmitFollowUp(followUpDraft);
                  }
                }}
                className="w-full resize-none rounded-sm border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="rounded-sm"
                  disabled={followUpDraft.trim().length === 0 || isSaving}
                  onClick={() => onSubmitFollowUp(followUpDraft)}
                >
                  <Check aria-hidden="true" />
                  Simpan
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-sm"
                  onClick={onCancelFollowUp}
                  disabled={isSaving}
                >
                  <X aria-hidden="true" />
                  Batal
                </Button>
              </div>
            </div>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-sm"
              aria-label={`Menu tindakan untuk ${entry.title}`}
            >
              <Ellipsis aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
              {readOnly ? "Entry bawahan" : "Tindakan"}
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={onOpenDetail}>
              <Eye aria-hidden="true" />
              {readOnly ? "Lihat detail" : "Buka detail"}
            </DropdownMenuItem>
            {!readOnly && (
              <>
                <DropdownMenuItem onSelect={() => setIsEditingTitle(true)}>
                  <Pencil aria-hidden="true" />
                  Ubah judul
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <WorkEntryStatusGlyph status={entry.status} className="mr-2" />
                    Ubah status
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56">
                    {WORK_ENTRY_STATUS_ORDER.map((status) => (
                      <DropdownMenuItem
                        key={status}
                        disabled={entry.status === status}
                        onSelect={() => onRequestStatus(status)}
                      >
                        <WorkEntryStatusGlyph status={status} className="mr-2" />
                        {getWorkEntryStatusLabel(status)}
                        {entry.status === status ? " (sekarang)" : ""}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <CalendarClock aria-hidden="true" />
                    Pindahkan tanggal
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-52">
                    {workWeekDates(entry.workDate).map((date) => (
                      <DropdownMenuItem
                        key={date}
                        disabled={date === entry.workDate}
                        onSelect={() => onMoveToDate(date)}
                      >
                        {formatWorkDateShort(date)}
                        {date === entry.workDate ? " (sekarang)" : ""}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    {[1, 2, 3].map((offset) => {
                      const date = shiftWorkDate(entry.workDate, offset * 7);
                      return (
                        <DropdownMenuItem key={date} onSelect={() => onMoveToDate(date)}>
                          {formatWorkDateShort(date)}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>
                  <Trash2 aria-hidden="true" />
                  Hapus
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!readOnly && variant === "full" && (
        <div
          role="group"
          aria-label={`Status pekerjaan ${entry.title}`}
          data-testid={`work-entry-status-group-${entry.id}`}
          className="mt-2 flex flex-wrap items-center gap-1 pl-5"
        >
          {WORK_ENTRY_STATUS_ORDER.map((status) => (
            <button
              key={status}
              type="button"
              disabled={isSaving}
              aria-pressed={entry.status === status}
              aria-label={`Tandai ${entry.title} sebagai ${getWorkEntryStatusLabel(status)}`}
              data-status-option={status}
              onClick={() => onRequestStatus(status)}
              className={cn(
                "inline-flex h-11 w-11 items-center justify-center rounded-sm border transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                "disabled:cursor-not-allowed disabled:opacity-50",
                entry.status === status
                  ? "border-primary/50 bg-primary/10"
                  : "border-border hover:bg-accent",
              )}
            >
              <WorkEntryStatusGlyph status={status} className="h-4 w-4" />
            </button>
          ))}
          <span className="ml-1 text-xs text-muted-foreground">Status</span>
        </div>
      )}
    </li>
  );
}

/** Urutkan entry untuk ditampilkan; dipakai seluruh view. */
export function sortWorkEntries(entries: readonly WorkEntry[]): WorkEntry[] {
  return entries.slice().sort(compareWorkEntries);
}
