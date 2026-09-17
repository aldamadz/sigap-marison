/**
 * Quick Add kontekstual dari tampilan Minggu/Bulan (CAL-03 F4B).
 *
 * Komponen ini sengaja hanya berisi *isi* panel; pembungkus yang menentukan
 * pola presentasi (popover desktop vs bottom sheet mobile) disediakan
 * workspace supaya:
 * - hanya ada satu DOM aksesibel per tanggal (tidak ada dialog bertumpuk);
 * - perpindahan fokus/animasi/motion dikendalikan di satu tempat.
 *
 * Kontrak produk:
 * - tanggal target selalu ditampilkan, sehingga tidak ada keraguan pekerjaan
 *   akan masuk ke tanggal mana (termasuk hari nonkerja);
 * - fokus langsung ke input judul;
 * - Enter menyimpan, Escape membatalkan;
 * - permintaan yang sedang berjalan mengunci input dan tombol sehingga tidak
 *   ada entry ganda akibat klik berulang/double submit;
 * - error tetap tampil di dalam panel, bukan sebagai toast global;
 * - menyediakan aksi "Tambah detail" menuju alur lengkap pada tanggal yang
 *   sama.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, LoaderCircle, Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { WorkDate } from "../types/work-calendar";
import { formatWorkDateFull } from "../lib/work-calendar-date";
import { normalizeWorkEntryTitle, WORK_ENTRY_TITLE_MAX_LENGTH } from "../lib/work-entry-validation";

export interface QuickAddPanelProps {
  workDate: WorkDate;
  /** Id elemen judul panel; dipakai `aria-labelledby` pembungkus. */
  titleId: string;
  /** true = bottom sheet (mobile), false = popover (desktop/tablet). */
  isCompact: boolean;
  isSaving: boolean;
  error: string | null;
  /**
   * Simpan pekerjaan. Harus mengembalikan `true` bila berhasil; panel hanya
   * menutup setelah berhasil.
   */
  onSubmit: (title: string) => Promise<boolean>;
  onCancel: () => void;
  /** Membuka alur lengkap untuk tanggal target. */
  /**
   * Membuka editor pembuatan lengkap pada tanggal yang sama. Judul yang sudah
   * diketik tetap terbawa sehingga pengguna tidak kehilangan input.
   */
  onOpenFullEditor: (date: WorkDate, title: string) => void;
  onDismissError: () => void;
}

export function QuickAddPanel({
  workDate,
  titleId,
  isCompact,
  isSaving,
  error,
  onSubmit,
  onCancel,
  onOpenFullEditor,
  onDismissError,
}: QuickAddPanelProps) {
  const [value, setValue] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  /**
   * Kunci sinkron (bukan hanya `isSaving` dari props) supaya dua Enter/klik
   * dalam tick yang sama tidak pernah membuat dua entry.
   */
  const submittingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const submit = useCallback(async () => {
    if (submittingRef.current) return;
    const normalized = normalizeWorkEntryTitle(value);
    if (normalized.length === 0) {
      setLocalError("Tulis pekerjaan terlebih dahulu.");
      inputRef.current?.focus();
      return;
    }
    submittingRef.current = true;
    setLocalError(null);
    try {
      const ok = await onSubmit(normalized);
      if (ok) {
        setValue("");
        onCancel();
      }
    } finally {
      submittingRef.current = false;
    }
  }, [onCancel, onSubmit, value]);

  const displayedError = localError ?? error;
  const busy = isSaving || submittingRef.current;
  const dateLabel = formatWorkDateFull(workDate);
  const inputId = `quick-add-input-${workDate}`;
  const errorId = `quick-add-error-${workDate}`;

  return (
    <div data-testid={`work-calendar-quick-add-${workDate}`} data-variant={isCompact ? "bottom-sheet" : "popover"}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            id={titleId}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground"
          >
            <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Tambah pekerjaan
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground" data-testid="work-calendar-quick-add-date">
            {dateLabel}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-sm"
          onClick={onCancel}
          aria-label="Tutup tambah cepat"
        >
          <X aria-hidden="true" />
        </Button>
      </div>

      <form
        className="mt-2 space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Judul pekerjaan pada {dateLabel}
        </label>
        <input
          id={inputId}
          ref={inputRef}
          value={value}
          maxLength={WORK_ENTRY_TITLE_MAX_LENGTH}
          placeholder="Apa yang akan dikerjakan?"
          autoComplete="off"
          disabled={busy}
          aria-invalid={displayedError ? true : undefined}
          aria-describedby={displayedError ? errorId : undefined}
          onChange={(event) => {
            setValue(event.target.value);
            if (localError) setLocalError(null);
            if (error) onDismissError();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            }
          }}
          className={cn(
            "h-11 w-full min-w-0 rounded-sm border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring",
            displayedError ? "border-destructive" : "border-input",
          )}
        />

        {displayedError && (
          <p
            id={errorId}
            role="alert"
            data-testid="work-calendar-quick-add-error"
            className="text-xs text-destructive"
          >
            {displayedError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" className="h-11 rounded-sm" disabled={busy}>
            {busy ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Plus aria-hidden="true" />
            )}
            Simpan
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-sm"
            data-testid={`work-calendar-quick-add-detail-${workDate}`}
            onClick={() => onOpenFullEditor(workDate, normalizeWorkEntryTitle(value))}
            disabled={busy}
          >
            Tambah detail
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 rounded-sm"
            onClick={onCancel}
            disabled={busy}
          >
            Batal
          </Button>
        </div>
      </form>
    </div>
  );
}
