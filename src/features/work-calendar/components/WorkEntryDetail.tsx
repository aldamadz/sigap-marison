/**
 * Panel detail entry Unified Work Calendar (CAL-03 F4B).
 *
 * Satu pola untuk Hari, Minggu, Bulan, dan Tim:
 * - desktop/tablet: side sheet dari kanan, lebar 480-560px;
 * - mobile: dialog layar penuh;
 * - header sticky agar aksi tetap terjangkau saat konten panjang;
 * - edit dilakukan di dalam sheet yang sama (crossfade detail <-> editor),
 *   tidak pernah membuka modal bertumpuk;
 * - entry bawahan selalu read-only.
 *
 * Perilaku modal (focus trap, latar `aria-hidden`, kunci scroll body, Escape,
 * klik overlay, pemulihan fokus) dimiliki `WorkCalendarModal` (Radix Dialog);
 * komponen ini hanya menyediakan presentasi dan isi.
 *
 * Tidak ada akses repository/jaringan di sini: seluruh mutasi lewat `onSave`
 * yang diberikan workspace. `AnimatePresence` di workspace memegang exit
 * animation.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  CalendarClock,
  Check,
  Flag,
  Hourglass,
  MapPin,
  Pencil,
  StickyNote,
  UserRound,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type {
  WorkEntry,
  WorkEntryEvent,
  WorkEntryPatch,
  WorkEntryOwner,
} from "../types/work-calendar";
import { formatWorkDateFull, formatWorkTimeLabelFromIso } from "../lib/work-calendar-date";
import {
  getWorkEntryStatusLabel,
  isWorkEntryCompletedLate,
  isWorkEntryOverdue,
} from "../lib/work-entry-status";
import {
  getWorkEntryColorMeta,
  isWorkEntryColorSwatch,
} from "../lib/work-entry-lifecycle";
import {
  normalizeWorkEntryTitle,
  WORK_ENTRY_TITLE_MAX_LENGTH,
} from "../lib/work-entry-validation";
import {
  AnimatePresence,
  WorkCalendarCrossfade,
  useWorkCalendarMotion,
} from "./WorkCalendarMotion";
import { WorkCalendarModal } from "./WorkCalendarModal";
import { WorkEntryStatusGlyph } from "./WorkEntryStatusGlyph";
import { WorkEntryEditor } from "./WorkEntryEditor";
import { WorkEntryLifecycleActions } from "./WorkEntryLifecycleActions";
import { WorkEntryTimeline } from "./WorkEntryTimeline";

export interface WorkEntryDetailProps {
  entry: WorkEntry;
  owner?: WorkEntryOwner;
  today: string;
  readOnly: boolean;
  isSaving: boolean;
  events: readonly WorkEntryEvent[];
  eventsStatus: "idle" | "loading" | "ready";
  /** Simpan dari editor detail; menutup panel setelah sukses. */
  onSave: (patch: WorkEntryPatch) => void;
  /** Simpan aksi cepat siklus hidup; panel tetap terbuka. */
  onQuickSave: (patch: WorkEntryPatch) => void;
  onClose: () => void;
}

export function WorkEntryDetail({
  entry,
  owner,
  today,
  readOnly,
  isSaving,
  events,
  eventsStatus,
  onSave,
  onQuickSave,
  onClose,
}: WorkEntryDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  /**
   * Edit judul eksplisit dari panel detail. Klik judul pada baris membuka
   * detail, jadi detail menyediakan aksi "Ubah judul" tersendiri untuk
   * pekerjaan sendiri.
   */
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(entry.title);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { durations } = useWorkCalendarMotion();

  const overdue = isWorkEntryOverdue(entry, today);
  const completedLate = isWorkEntryCompletedLate(entry);
  const colorSwatch = isWorkEntryColorSwatch(entry.colorSwatch) ? entry.colorSwatch : null;
  const colorInfo = colorSwatch ? getWorkEntryColorMeta(colorSwatch) : null;
  const startLabel = formatWorkTimeLabelFromIso(entry.startsAt);
  const endLabel = formatWorkTimeLabelFromIso(entry.endsAt);

  const titleId = `work-entry-detail-title-${entry.id}`;
  const descriptionId = `work-entry-detail-description-${entry.id}`;

  useEffect(() => {
    if (!isEditingTitle) setTitleDraft(entry.title);
  }, [entry.title, isEditingTitle]);

  useEffect(() => {
    if (isEditingTitle) titleInputRef.current?.focus();
  }, [isEditingTitle]);

  const commitTitle = useCallback(() => {
    const normalized = normalizeWorkEntryTitle(titleDraft);
    setIsEditingTitle(false);
    if (normalized.length === 0 || normalized === entry.title) {
      setTitleDraft(entry.title);
      return;
    }
    onSave({ title: normalized });
  }, [entry.title, onSave, titleDraft]);

  return (
    <WorkCalendarModal
      onRequestClose={onClose}
      labelledBy={titleId}
      describedBy={descriptionId}
      initialFocusRef={headingRef}
      variant="side-sheet"
      panelTestId={`work-entry-detail-${entry.id}`}
      overlayTestId={`work-entry-detail-overlay-${entry.id}`}
      // Escape saat mengedit judul hanya membatalkan sub-edit (perilaku lama),
      // bukan menutup seluruh panel.
      holdEscape={isEditingTitle}
      panelClassName={cn(
        "work-calendar-scope fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-border bg-card shadow-[var(--shadow-elevated)]",
        // Mobile: dialog layar penuh. Desktop/tablet: side sheet 480-560px.
        "sm:w-[min(560px,92vw)] sm:min-w-[480px]",
      )}
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="sticky top-0 z-10 space-y-1.5 border-b border-border bg-card px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3
                ref={headingRef}
                id={titleId}
                data-testid={`work-entry-detail-heading-${entry.id}`}
                tabIndex={-1}
                className="flex items-center gap-1.5 rounded-sm text-sm font-semibold leading-snug text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {colorInfo && (
                  <span
                    aria-hidden="true"
                    data-testid={`work-entry-detail-color-${entry.id}`}
                    className="h-3 w-3 shrink-0 rounded-full border border-black/10"
                    style={{ backgroundColor: colorInfo.hex }}
                  />
                )}
                {entry.title}
              </h3>
              <p
                id={descriptionId}
                className="mt-0.5 inline-flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
              >
                <WorkEntryStatusGlyph status={entry.status} />
                {getWorkEntryStatusLabel(entry.status)}
                {readOnly ? <span className="font-medium">· Hanya baca</span> : null}
                {overdue && (
                  <span className="inline-flex items-center gap-1 font-medium text-overdue">
                    <Hourglass className="h-3.5 w-3.5" aria-hidden="true" />
                    Terlambat
                  </span>
                )}
                {completedLate && (
                  <span className="inline-flex items-center gap-1 font-medium text-overdue">
                    <Hourglass className="h-3.5 w-3.5" aria-hidden="true" />
                    Selesai terlambat
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {!readOnly && !isEditing && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-sm"
                    data-testid={`work-entry-detail-edit-title-${entry.id}`}
                    onClick={() => {
                      setTitleDraft(entry.title);
                      setIsEditingTitle(true);
                    }}
                  >
                    <Pencil aria-hidden="true" />
                    Ubah judul
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-sm"
                    data-testid={`work-entry-detail-edit-${entry.id}`}
                    onClick={() => setIsEditing(true)}
                  >
                    <Pencil aria-hidden="true" />
                    Ubah detail
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-sm"
                data-testid={`work-entry-detail-close-${entry.id}`}
                onClick={onClose}
                aria-label="Tutup detail pekerjaan"
              >
                <X aria-hidden="true" />
                Tutup
              </Button>
            </div>
          </div>

          {isEditingTitle && !readOnly && (
            <div className="flex flex-wrap items-center gap-1.5">
              <label
                htmlFor={`work-entry-detail-title-input-${entry.id}`}
                className="sr-only"
              >
                Judul pekerjaan
              </label>
              <input
                id={`work-entry-detail-title-input-${entry.id}`}
                ref={titleInputRef}
                value={titleDraft}
                maxLength={WORK_ENTRY_TITLE_MAX_LENGTH}
                aria-label={`Ubah judul pekerjaan ${entry.title}`}
                onChange={(event) => setTitleDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitTitle();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setTitleDraft(entry.title);
                    setIsEditingTitle(false);
                  }
                }}
                className="h-11 w-full min-w-0 rounded-sm border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:w-64"
              />
              <Button
                type="button"
                size="sm"
                className="rounded-sm"
                data-testid={`work-entry-detail-save-title-${entry.id}`}
                onClick={commitTitle}
                disabled={isSaving || titleDraft.trim().length === 0}
              >
                <Check aria-hidden="true" />
                Simpan judul
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-sm"
                onClick={() => {
                  setTitleDraft(entry.title);
                  setIsEditingTitle(false);
                }}
              >
                <X aria-hidden="true" />
                Batal
              </Button>
            </div>
          )}
        </header>

        <div
          data-testid={`work-entry-detail-content-${entry.id}`}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        >
          <AnimatePresence mode="wait" initial={false}>
            {isEditing && !readOnly ? (
              <WorkCalendarCrossfade
                key="editor"
                contentKey="editor"
                duration={durations.crossfade}
              >
                <WorkEntryEditor
                  entry={entry}
                  isSaving={isSaving}
                  onSubmit={onSave}
                  onClose={() => setIsEditing(false)}
                />
              </WorkCalendarCrossfade>
            ) : (
              <WorkCalendarCrossfade
                key="read"
                contentKey="read"
                duration={durations.crossfade}
              >
                {!readOnly && (
                  <WorkEntryLifecycleActions
                    entry={entry}
                    today={today}
                    isSaving={isSaving}
                    onSave={onQuickSave}
                    onEditDetail={() => setIsEditing(true)}
                  />
                )}
                <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
                  <div className="flex items-start gap-1.5">
                    <CalendarDays
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div>
                      <dt className="text-muted-foreground">Tanggal</dt>
                      <dd className="text-foreground">{formatWorkDateFull(entry.workDate)}</dd>
                    </div>
                  </div>

                  <div className="flex items-start gap-1.5">
                    <Flag
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div>
                      <dt className="text-muted-foreground">Tenggat</dt>
                      <dd
                        data-testid={`work-entry-detail-due-date-${entry.id}`}
                        className={cn(
                          "text-foreground",
                          overdue && "font-medium text-overdue",
                          completedLate && "font-medium text-overdue",
                        )}
                      >
                        {entry.dueDate ? formatWorkDateFull(entry.dueDate) : "Tanpa tenggat"}
                      </dd>
                    </div>
                  </div>

                  <div className="flex items-start gap-1.5">
                    <CalendarClock
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div>
                      <dt className="text-muted-foreground">Warna penanda</dt>
                      <dd className="inline-flex items-center gap-1.5 text-foreground">
                        {colorInfo ? (
                          <>
                            <span
                              aria-hidden="true"
                              className="h-3 w-3 rounded-full border border-black/10"
                              style={{ backgroundColor: colorInfo.hex }}
                            />
                            {colorInfo.label}
                          </>
                        ) : (
                          "Tanpa penanda"
                        )}
                      </dd>
                    </div>
                  </div>

                  <div className="flex items-start gap-1.5">
                    <Hourglass
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div>
                      <dt className="text-muted-foreground">Waktu</dt>
                      <dd className="text-foreground">
                        {entry.isAllDay || !startLabel
                          ? "Sepanjang hari"
                          : endLabel
                            ? `${startLabel} - ${endLabel}`
                            : startLabel}
                      </dd>
                    </div>
                  </div>

                  {owner && (
                    <div className="flex items-start gap-1.5">
                      <UserRound
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <div>
                        <dt className="text-muted-foreground">Pemilik</dt>
                        <dd className="text-foreground">
                          {owner.name}
                          {owner.jobTitle ? ` - ${owner.jobTitle}` : ""}
                        </dd>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-1.5">
                    <MapPin
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div>
                      <dt className="text-muted-foreground">Lokasi</dt>
                      <dd className="text-foreground">{entry.location ?? "Belum diisi"}</dd>
                    </div>
                  </div>

                  <div className="flex items-start gap-1.5 sm:col-span-2">
                    <StickyNote
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div>
                      <dt className="text-muted-foreground">Hasil</dt>
                      <dd className="text-foreground">
                        {entry.realization ?? "Belum diisi"}
                      </dd>
                    </div>
                  </div>

                  {entry.blockedReason && (
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Alasan terhambat</dt>
                      <dd className="text-destructive">{entry.blockedReason}</dd>
                    </div>
                  )}

                  {entry.notes && (
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Catatan</dt>
                      <dd className="whitespace-pre-line text-foreground">{entry.notes}</dd>
                    </div>
                  )}
                </dl>

                <WorkEntryTimeline events={events} status={eventsStatus} />
              </WorkCalendarCrossfade>
            )}
          </AnimatePresence>
        </div>
      </div>
    </WorkCalendarModal>
  );
}
