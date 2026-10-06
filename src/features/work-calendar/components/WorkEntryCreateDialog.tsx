/**
 * Editor pembuatan lengkap Work Calendar (CAL-03 F4B).
 *
 * Dibuka dari aksi "Tambah detail" pada Quick Add. Kontrak produk:
 * - tanggal target dan judul yang sudah diketik dari Quick Add dipertahankan;
 * - field minimal: judul, tanggal, sepanjang hari/waktu, lokasi, catatan;
 * - menyimpan memanggil `onSubmit` sekali (dijaga `isSaving` + kunci sinkron),
 *   dan workspace melakukan tepat satu `createEntry`;
 * - `Batal` menutup editor tanpa membuat entry;
 * - error dari server tampil di dalam editor dan editor tidak menutup.
 *
 * Komponen ini tidak pernah hidup bersamaan dengan Quick Add: workspace
 * menutup Quick Add sebelum membuka editor ini.
 */

import { useRef, useState } from "react";
import { CalendarPlus, Check, LoaderCircle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { WorkDate, WorkEntryColorSwatch, WorkTimestamp } from "../types/work-calendar";
import {
  WORK_ENTRY_LOCATION_MAX_LENGTH,
  WORK_ENTRY_NOTES_MAX_LENGTH,
  WORK_ENTRY_TITLE_MAX_LENGTH,
  validateWorkEntryInput,
  type WorkEntryFieldErrors,
} from "../lib/work-entry-validation";
import { parseWorkDateTimeInput } from "../lib/work-calendar-date";
import { WorkCalendarModal } from "./WorkCalendarModal";
import { WorkEntryColorPicker } from "./WorkEntryColorPicker";

/** Nilai yang dikumpulkan editor; pemanggil melengkapinya menjadi draft. */
export interface WorkEntryCreateInput {
  workDate: WorkDate;
  title: string;
  isAllDay: boolean;
  startsAt: WorkTimestamp | null;
  endsAt: WorkTimestamp | null;
  location: string | null;
  notes: string | null;
  dueDate: WorkDate | null;
  colorSwatch: WorkEntryColorSwatch | null;
}

export interface WorkEntryCreateDialogProps {
  /** Tanggal target awal (dari Quick Add). */
  workDate: WorkDate;
  /** Judul yang sudah diketik di Quick Add; tidak hilang saat berpindah. */
  initialTitle: string;
  isSaving: boolean;
  /** Error dari percobaan simpan sebelumnya (server). */
  error: string | null;
  /** Mengembalikan `true` bila entry berhasil dibuat. */
  onSubmit: (input: WorkEntryCreateInput) => Promise<boolean>;
  onClose: () => void;
  onDismissError: () => void;
}

export function WorkEntryCreateDialog({
  workDate: initialWorkDate,
  initialTitle,
  isSaving,
  error,
  onSubmit,
  onClose,
  onDismissError,
}: WorkEntryCreateDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [workDate, setWorkDate] = useState<WorkDate>(initialWorkDate);
  const [isAllDay, setIsAllDay] = useState(true);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [colorSwatch, setColorSwatch] = useState<WorkEntryColorSwatch | null>(null);
  const [errors, setErrors] = useState<WorkEntryFieldErrors>({});

  const titleInputRef = useRef<HTMLInputElement>(null);
  /** Kunci sinkron: dua klik cepat dalam satu tick tetap hanya satu kirim. */
  const submittingRef = useRef(false);

  const submit = () => {
    if (isSaving || submittingRef.current) return;

    const startsAt = isAllDay ? null : parseWorkDateTimeInput(workDate, startTime);
    const endsAt = isAllDay ? null : parseWorkDateTimeInput(workDate, endTime);

    const validation = validateWorkEntryInput({
      title,
      status: "planned",
      kind: "work",
      isAllDay,
      startsAt,
      endsAt,
      notes,
      location,
      workDate,
      dueDate: dueDate || null,
      colorSwatch,
    });

    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }

    setErrors({});
    submittingRef.current = true;
    void (async () => {
      try {
        onDismissError();
        await onSubmit({
          workDate,
          title: title.trim().replace(/\s+/g, " "),
          isAllDay,
          startsAt,
          endsAt,
          location: location.trim() || null,
          notes: notes.trim() || null,
          dueDate: dueDate || null,
          colorSwatch,
        });
      } finally {
        submittingRef.current = false;
      }
    })();
  };

  const errorText = (key: keyof WorkEntryFieldErrors) => errors[key] ?? null;
  const busy = isSaving;

  return (
    <WorkCalendarModal
      onRequestClose={onClose}
      labelledBy="work-entry-create-title-heading"
      initialFocusRef={titleInputRef}
      variant="centered"
      panelTestId="work-entry-create-dialog"
      overlayTestId="work-entry-create-overlay"
      overlayClassName="fixed inset-0 bg-black/55"
      panelClassName="work-calendar-scope fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
    >
      <div
        // Klik pada area gelap di dalam kontainer tetap menutup editor, tetapi
        // klik pada kartu tidak boleh menutupnya.
        onClick={(event) => {
          if (event.target === event.currentTarget && !busy) onClose();
        }}
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-elevated)]"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3
              id="work-entry-create-title-heading"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground"
            >
              <CalendarPlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Tambah pekerjaan lengkap
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tentukan tanggal, waktu, lokasi, dan catatan sebelum menyimpan.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-sm"
            data-testid="work-entry-create-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Tutup editor pembuatan pekerjaan"
          >
            <X aria-hidden="true" />
            Tutup
          </Button>
        </div>

        <div className="mt-3 space-y-3">
          <div className="space-y-1">
            <label
              htmlFor="work-entry-create-title-input"
              className="block text-xs font-medium text-foreground"
            >
              Judul pekerjaan
            </label>
            <input
              id="work-entry-create-title-input"
              ref={titleInputRef}
              data-testid="work-entry-create-title"
              value={title}
              maxLength={WORK_ENTRY_TITLE_MAX_LENGTH}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Apa yang akan dikerjakan?"
              className="h-11 w-full rounded-sm border border-input bg-background px-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errorText("title") && <p className="text-xs text-destructive">{errorText("title")}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor="work-entry-create-date"
                className="block text-xs font-medium text-foreground"
              >
                Tanggal kerja
              </label>
              <input
                id="work-entry-create-date"
                data-testid="work-entry-create-date"
                type="date"
                value={workDate}
                onChange={(event) => setWorkDate(event.target.value)}
                className="h-11 w-full rounded-sm border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errorText("workDate") && (
                <p className="text-xs text-destructive">{errorText("workDate")}</p>
              )}
            </div>

            <div className="space-y-1">
              <span className="block text-xs font-medium text-foreground">Waktu</span>
              <label className="inline-flex min-h-touch cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  data-testid="work-entry-create-allday"
                  type="checkbox"
                  checked={isAllDay}
                  onChange={(event) => setIsAllDay(event.target.checked)}
                  className="h-4 w-4 rounded-sm border-input"
                />
                Sepanjang hari
              </label>
            </div>
          </div>

          {!isAllDay && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label
                  htmlFor="work-entry-create-start"
                  className="block text-xs font-medium text-foreground"
                >
                  Jam mulai
                </label>
                <input
                  id="work-entry-create-start"
                  data-testid="work-entry-create-start"
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className="h-11 w-full rounded-sm border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="work-entry-create-end"
                  className="block text-xs font-medium text-foreground"
                >
                  Jam selesai
                </label>
                <input
                  id="work-entry-create-end"
                  data-testid="work-entry-create-end"
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  className="h-11 w-full rounded-sm border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              {errorText("timeRange") && (
                <p className="text-xs text-destructive sm:col-span-2">{errorText("timeRange")}</p>
              )}
            </div>
          )}

          <div className="space-y-1">
            <label
              htmlFor="work-entry-create-location"
              className="block text-xs font-medium text-foreground"
            >
              Lokasi
            </label>
            <input
              id="work-entry-create-location"
              data-testid="work-entry-create-location"
              value={location}
              maxLength={WORK_ENTRY_LOCATION_MAX_LENGTH}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Opsional"
              className="h-11 w-full rounded-sm border border-input bg-background px-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errorText("location") && (
              <p className="text-xs text-destructive">{errorText("location")}</p>
            )}
          </div>

          <div className="space-y-1">
            <label
              htmlFor="work-entry-create-notes"
              className="block text-xs font-medium text-foreground"
            >
              Catatan
            </label>
            <textarea
              id="work-entry-create-notes"
              data-testid="work-entry-create-notes"
              value={notes}
              rows={3}
              maxLength={WORK_ENTRY_NOTES_MAX_LENGTH}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Opsional"
              className="w-full resize-none rounded-sm border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errorText("notes") && <p className="text-xs text-destructive">{errorText("notes")}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor="work-entry-create-due-date"
                className="block text-xs font-medium text-foreground"
              >
                Tenggat
              </label>
              <input
                id="work-entry-create-due-date"
                data-testid="work-entry-create-due-date"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="h-11 w-full rounded-sm border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Opsional. Kosong berarti tanpa tenggat.
              </p>
              {errorText("dueDate") && (
                <p className="text-xs text-destructive">{errorText("dueDate")}</p>
              )}
            </div>
          </div>

          <WorkEntryColorPicker
            idPrefix="work-entry-create"
            value={colorSwatch}
            onChange={setColorSwatch}
          />

          {error && (
            <p
              role="alert"
              data-testid="work-entry-create-error"
              className="rounded-sm border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-xs text-destructive"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-sm"
              data-testid="work-entry-create-cancel"
              onClick={onClose}
              disabled={busy}
            >
              Batal
            </Button>
            <Button
              type="button"
              className="h-11 rounded-sm"
              data-testid="work-entry-create-submit"
              onClick={submit}
              disabled={busy || title.trim().length === 0}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              Simpan pekerjaan
            </Button>
          </div>
        </div>
      </div>
    </WorkCalendarModal>
  );
}
