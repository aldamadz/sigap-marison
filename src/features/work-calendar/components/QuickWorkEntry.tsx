/**
 * Quick entry: satu input utama "Apa yang akan dikerjakan?".
 *
 * Perilaku produk:
 * - Enter menyimpan; input dikosongkan oleh pemanggil setelah simpan berhasil
 *   sehingga langsung siap untuk entry berikutnya;
 * - Esc membatalkan dan membersihkan input;
 * - hanya judul yang dibutuhkan untuk membuat entry;
 * - loading tidak menggeser layout (slot status berukuran tetap);
 * - error tampil dekat input, bukan sebagai toast global.
 *
 * Komponen ini dikendalikan (`value`/`onChange`) agar pemanggil menentukan
 * kapan input boleh dikosongkan: hanya setelah penyimpanan berhasil.
 */

import { useRef, useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { normalizeWorkEntryTitle, WORK_ENTRY_TITLE_MAX_LENGTH } from "../lib/work-entry-validation";

export interface QuickWorkEntryProps {
  value: string;
  error: string | null;
  isSaving: boolean;
  onChange: (value: string) => void;
  onSubmit: (title: string) => void;
  onDismissError: () => void;
  /** Ref ke input utama; dipakai tombol Tambah pada toolbar. */
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function QuickWorkEntry({
  value,
  error,
  isSaving,
  onChange,
  onSubmit,
  onDismissError,
  inputRef,
}: QuickWorkEntryProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const internalRef = useRef<HTMLInputElement>(null);
  const resolvedRef = inputRef ?? internalRef;

  const submit = () => {
    if (isSaving) return;
    const normalized = normalizeWorkEntryTitle(value);
    if (normalized.length === 0) {
      setLocalError("Tulis pekerjaan terlebih dahulu.");
      resolvedRef.current?.focus();
      return;
    }
    setLocalError(null);
    onSubmit(normalized);
  };

  const displayedError = localError ?? error;

  return (
    <form
      className="rounded-sm border border-border bg-card px-3 py-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="quick-work-entry-input" className="sr-only">
          Apa yang akan dikerjakan?
        </label>
        <input
          id="quick-work-entry-input"
          ref={resolvedRef}
          value={value}
          maxLength={WORK_ENTRY_TITLE_MAX_LENGTH}
          placeholder="Apa yang akan dikerjakan?"
          autoComplete="off"
          aria-invalid={displayedError ? true : undefined}
          aria-describedby={displayedError ? "quick-work-entry-error" : undefined}
          disabled={isSaving}
          onChange={(event) => {
            onChange(event.target.value);
            if (localError) setLocalError(null);
            if (error) onDismissError();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onChange("");
              setLocalError(null);
              onDismissError();
              resolvedRef.current?.blur();
            }
          }}
          className={cn(
            "h-11 w-full min-w-0 rounded-sm border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground sm:flex-1",
            "focus:outline-none focus:ring-2 focus:ring-ring",
            displayedError ? "border-destructive" : "border-input",
          )}
        />

        <div className="flex items-center gap-2">
          {/* Slot status berukuran tetap supaya layout tidak bergeser saat loading. */}
          <span className="inline-flex h-11 min-w-[92px] items-center justify-center text-xs text-muted-foreground">
            {isSaving ? (
              <span className="inline-flex items-center gap-1.5">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Menyimpan
              </span>
            ) : (
              <span className="hidden sm:inline">Enter untuk simpan</span>
            )}
          </span>
          <Button type="submit" className="h-11 shrink-0 rounded-sm" disabled={isSaving}>
            <Plus aria-hidden="true" />
            Tambah
          </Button>
        </div>
      </div>

      {displayedError && (
        <p id="quick-work-entry-error" role="alert" className="mt-1.5 text-xs text-destructive">
          {displayedError}
        </p>
      )}
    </form>
  );
}
