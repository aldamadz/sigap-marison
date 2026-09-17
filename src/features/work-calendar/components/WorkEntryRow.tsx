/**
 * Baris entry pekerjaan untuk tampilan Hari, Minggu, dan hasil pencarian.
 *
 * Prinsip:
 * - status selalu memakai ikon + label, bukan warna saja;
 * - kontrol status memakai satu trigger yang menampilkan status aktif dan
 *   label lengkap, bukan deretan empat tombol ikon yang padat;
 * - status `completed`/`blocked` meminta input lanjutan secara inline,
 *   tanpa membuka modal besar;
 * - menu tindakan (detail, ubah judul, pindahkan tanggal, hapus) tetap ada;
 * - `Hapus` hanya meminta konfirmasi; penghapusan dilakukan pemanggil;
 * - baris `compact` (kolom minggu yang sempit) menaruh kontrol pada baris
 *   kedua supaya judul tidak pernah terhimpit sampai nol lebar;
 * - seluruh target sentuh minimal 44px dan tidak ada overflow horizontal.
 */

import { useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronDown,
  Ellipsis,
  Eye,
  Hourglass,
  MapPin,
  Pencil,
  Trash2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WorkDate, WorkEntry, WorkEntryStatus } from "../types/work-calendar";
import {
  compareWorkEntries,
  getWorkEntryStatusMeta,
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
  /**
   * `true` bila detail entry ini sedang terbuka (CAL-03 F4B). Baris diberi
   * penanda visual + `aria-current` supaya keterkaitan baris dan panel jelas.
   */
  isSelected?: boolean;
  promptType?: WorkEntryStatusFollowUp;
  /**
   * `compact` dipakai kolom minggu yang sempit: kontrol status dan menu
   * tindakan diletakkan pada baris kedua.
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

interface WorkEntryRowControlsProps {
  entry: WorkEntry;
  readOnly: boolean;
  isSaving: boolean;
  /** `compact` menyembunyikan label status pada trigger (ikon saja). */
  compact: boolean;
  onRequestStatus: (status: WorkEntryStatus) => void;
  onStartEditTitle: () => void;
  /** Mencegah Radix mengembalikan fokus ke trigger saat editor judul dibuka. */
  onCloseAutoFocus: (event: Event) => void;
  onOpenDetail: () => void;
  onMoveToDate: (date: WorkDate) => void;
  onDelete: () => void;
}

/**
 * Kontrol status tunggal + menu tindakan.
 *
 * Dipisah dari `WorkEntryRow` supaya dapat ditempatkan pada baris pertama
 * (layout penuh) atau baris kedua (layout compact) tanpa duplikasi kode.
 */
function WorkEntryRowControls({
  entry,
  readOnly,
  isSaving,
  compact,
  onRequestStatus,
  onStartEditTitle,
  onCloseAutoFocus,
  onOpenDetail,
  onMoveToDate,
  onDelete,
}: WorkEntryRowControlsProps) {
  const statusMeta = getWorkEntryStatusMeta(entry.status);

  return (
    <>
      {!readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSaving}
              data-testid={`work-entry-status-control-${entry.id}`}
              data-active-status={entry.status}
              aria-label={`Ubah status pekerjaan ${entry.title}. Status saat ini ${statusMeta.label}.`}
              className={cn(
                "h-11 min-w-touch gap-1.5 rounded-sm px-2 font-medium",
                // Badge status memberi bentuk + label + warna sehingga status
                // tetap dibedakan tanpa mengandalkan warna saja, juga pada
                // mode gelap. Warna teks dipaksa ke token status agar
                // kontrasnya tidak diturunkan oleh varian outline.
                statusMeta.badgeClassName,
                "hover:brightness-110 dark:hover:brightness-125",
                compact && "w-11 justify-center px-0",
              )}
            >
              <WorkEntryStatusGlyph
                status={entry.status}
                className={cn("h-4 w-4", statusMeta.iconClassName)}
              />
              {!compact && (
                <span className="whitespace-nowrap" data-testid={`work-entry-status-label-${entry.id}`}>
                  {statusMeta.label}
                </span>
              )}
              {!compact && (
                <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="work-calendar-scope w-56">
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
              Status pekerjaan
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={entry.status}
              onValueChange={(value) => {
                const next = value as WorkEntryStatus;
                if (next === entry.status) return;
                onRequestStatus(next);
              }}
            >
              {WORK_ENTRY_STATUS_ORDER.map((status) => {
                const meta = getWorkEntryStatusMeta(status);
                return (
                  <DropdownMenuRadioItem
                    key={status}
                    value={status}
                    data-status-option={status}
                    className="min-h-touch gap-2"
                  >
                    <meta.icon
                      className={cn("h-4 w-4 shrink-0", meta.iconClassName)}
                      aria-hidden="true"
                    />
                    {meta.label}
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="w-11 shrink-0 rounded-sm"
            data-work-entry-menu={entry.id}
            aria-label={`Menu tindakan untuk ${entry.title}`}
          >
            <Ellipsis aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="work-calendar-scope w-56"
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            {readOnly ? "Entry bawahan" : "Tindakan"}
          </DropdownMenuLabel>
          <DropdownMenuItem onSelect={onOpenDetail}>
            <Eye aria-hidden="true" />
            {readOnly ? "Lihat detail" : "Buka detail"}
          </DropdownMenuItem>
          {!readOnly && (
            <>
              <DropdownMenuItem onSelect={onStartEditTitle}>
                <Pencil aria-hidden="true" />
                Ubah judul
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <CalendarClock className="mr-2" aria-hidden="true" />
                  Pindahkan tanggal
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="work-calendar-scope w-52">
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
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={onDelete}
              >
                <Trash2 aria-hidden="true" />
                Hapus
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export function WorkEntryRow({
  entry,
  today,
  readOnly = false,
  isSaving = false,
  isSelected = false,
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
  /** Menandai bahwa menu ditutup karena ingin memulai edit judul. */
  const isStartingTitleEditRef = useRef(false);

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
  const statusMeta = getWorkEntryStatusMeta(entry.status);
  const isCompact = variant === "compact";

  const commitTitle = () => {
    const normalized = normalizeWorkEntryTitle(titleDraft);
    setIsEditingTitle(false);
    if (normalized.length === 0 || normalized === entry.title) {
      setTitleDraft(entry.title);
      return;
    }
    onUpdateTitle(normalized);
  };

  const controls = (
    <WorkEntryRowControls
      entry={entry}
      readOnly={readOnly}
      isSaving={isSaving}
      compact={isCompact}
      onRequestStatus={onRequestStatus}
      onStartEditTitle={() => {
        // Editor judul baru dibuka setelah menu benar-benar tertutup supaya
        // pemulihan fokus Radix tidak langsung memblur input judul.
        isStartingTitleEditRef.current = true;
        // Fallback bila `onCloseAutoFocus` tidak dipanggil (mis. klik pointer
        // tanpa fokus item). Ref dikosongkan oleh `onCloseAutoFocus` bila
        // handler itu memang berjalan.
        window.requestAnimationFrame(() => {
          if (!isStartingTitleEditRef.current) return;
          isStartingTitleEditRef.current = false;
          setIsEditingTitle(true);
        });
      }}
      onCloseAutoFocus={(event) => {
        if (!isStartingTitleEditRef.current) return;
        isStartingTitleEditRef.current = false;
        event.preventDefault();
        setIsEditingTitle(true);
      }}
      onOpenDetail={onOpenDetail}
      onMoveToDate={onMoveToDate}
      onDelete={onDelete}
    />
  );

  return (
    <li
      data-testid={`work-entry-row-${entry.id}`}
      data-owner-id={entry.ownerId}
      data-entry-status={entry.status}
      data-readonly={readOnly ? "true" : "false"}
      data-row-variant={variant}
      data-selected={isSelected ? "true" : "false"}
      className={cn(
        "rounded-sm border bg-card",
        isCompact ? "px-1.5 py-1.5" : "px-3 py-2.5",
        overdue ? "border-overdue/60" : "border-border",
        // Visual state entry terpilih: cincin + border, bukan warna saja.
        isSelected && "border-primary ring-2 ring-primary/60",
      )}
    >
      <div className={cn("flex items-start", isCompact ? "gap-1" : "gap-2")}>
        <span className={isCompact ? "mt-0.5 shrink-0" : "mt-2 shrink-0"}>
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
            // Kontrak interaksi CAL-03 F4A (koreksi review): klik judul
            // membuka detail, bukan editor judul inline. Editor judul hanya
            // dimulai dari menu "..." → "Ubah judul" atau dari detail.
            <button
              type="button"
              data-testid={`work-entry-title-${entry.id}`}
              onClick={onOpenDetail}
              aria-label={`Buka detail pekerjaan: ${entry.title}`}
              aria-current={isSelected ? "true" : undefined}
              className={cn(
                "flex w-full min-h-touch items-center rounded-sm text-left font-medium leading-snug text-foreground",
                isCompact ? "text-xs" : "text-sm",
                "hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                // Judul selesai tetap `foreground` penuh supaya terbaca di
                // dark mode; status "Selesai" pada badge adalah indikator
                // utamanya, jadi hanya diberi efek visual ringan.
                entry.status === "completed" && "line-through decoration-muted-foreground/60",
              )}
            >
              <span className="min-w-0 break-words">{entry.title}</span>
            </button>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {/* Pada row compact kontrol status hanya berupa ikon, sehingga
                label status ditegaskan kembali di baris metadata. */}
            {isCompact && (
              <span
                className="inline-flex items-center gap-1"
                data-testid={`work-entry-status-label-${entry.id}`}
              >
                <WorkEntryStatusGlyph status={entry.status} />
                {statusMeta.label}
              </span>
            )}

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
            <p data-testid={`work-entry-realization-${entry.id}`} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Hasil: </span>
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
            <div className="space-y-1.5 rounded-sm border border-border bg-muted p-2">
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
                placeholder={
                  promptType === "realization"
                    ? "Tulis hasil pekerjaan..."
                    : "Tulis alasan terhambat..."
                }
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
                className="w-full resize-none rounded-sm border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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

        {!isCompact && <div className="flex shrink-0 items-start gap-1">{controls}</div>}
      </div>

      {/* Kolom minggu sempit: kontrol turun ke baris kedua agar judul tetap
          mendapat lebar penuh dan tidak pernah terhimpit sampai nol. */}
      {isCompact && (
        <div className="mt-1 flex items-center justify-end gap-1 pl-5">{controls}</div>
      )}
    </li>
  );
}

/** Urutkan entry untuk ditampilkan; dipakai seluruh view. */
export function sortWorkEntries(entries: readonly WorkEntry[]): WorkEntry[] {
  return entries.slice().sort(compareWorkEntries);
}
