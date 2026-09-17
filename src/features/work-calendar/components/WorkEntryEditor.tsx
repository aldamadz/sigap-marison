/**
 * Editor field lanjutan untuk satu entry.
 *
 * Editor ini bukan modal besar: ia terbuka inline dari menu tindakan atau
 * dari tombol detail. Semua label memakai bahasa Indonesia dan setiap
 * input memiliki label aksesibel.
 */

import { useState } from "react";
import { Check, LoaderCircle, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  WorkDate,
  WorkEntry,
  WorkEntryColorSwatch,
  WorkEntryPatch,
} from "../types/work-calendar";
import {
  WORK_ENTRY_LOCATION_MAX_LENGTH,
  WORK_ENTRY_NOTES_MAX_LENGTH,
  WORK_ENTRY_REALIZATION_MAX_LENGTH,
  validateWorkEntryInput,
  type WorkEntryFieldErrors,
} from "../lib/work-entry-validation";
import { parseWorkDateTimeInput, formatWorkTimeLabelFromIso } from "../lib/work-calendar-date";
import { WorkEntryColorPicker } from "./WorkEntryColorPicker";

export interface WorkEntryEditorProps {
  entry: WorkEntry;
  isSaving: boolean;
  onSubmit: (patch: WorkEntryPatch) => void;
  onClose: () => void;
}

export function WorkEntryEditor({ entry, isSaving, onSubmit, onClose }: WorkEntryEditorProps) {
  const [workDate, setWorkDate] = useState<WorkDate>(entry.workDate);
  const [isAllDay, setIsAllDay] = useState(entry.isAllDay);
  const [startTime, setStartTime] = useState(formatWorkTimeLabelFromIso(entry.startsAt) ?? "");
  const [endTime, setEndTime] = useState(formatWorkTimeLabelFromIso(entry.endsAt) ?? "");
  const [location, setLocation] = useState(entry.location ?? "");
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [realization, setRealization] = useState(entry.realization ?? "");
  const [dueDate, setDueDate] = useState(entry.dueDate ?? "");
  const [colorSwatch, setColorSwatch] = useState<WorkEntryColorSwatch | null>(entry.colorSwatch);
  const [errors, setErrors] = useState<WorkEntryFieldErrors>({});

  const submit = () => {
    const startsAt = isAllDay ? null : parseWorkDateTimeInput(workDate, startTime);
    const endsAt = isAllDay ? null : parseWorkDateTimeInput(workDate, endTime);

    const validation = validateWorkEntryInput({
      title: entry.title,
      status: entry.status,
      kind: entry.kind,
      realization,
      blockedReason: entry.blockedReason,
      notes,
      location,
      startsAt,
      endsAt,
      workDate,
      dueDate: dueDate || null,
      colorSwatch,
    });

    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }

    setErrors({});
    onSubmit({
      workDate,
      isAllDay,
      startsAt,
      endsAt,
      location: location.trim() || null,
      notes: notes.trim() || null,
      realization: realization.trim() || null,
      dueDate: dueDate || null,
      colorSwatch,
    });
  };

  const errorText = (key: keyof WorkEntryFieldErrors) => errors[key] ?? null;

  return (
    <div className="space-y-3 rounded-sm border border-input bg-muted p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Detail pekerjaan</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-sm"
          onClick={onClose}
          disabled={isSaving}
        >
          <X aria-hidden="true" />
          Tutup
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`work-date-${entry.id}`} className="block text-xs font-medium text-foreground">
            Tanggal kerja
          </label>
          <input
            id={`work-date-${entry.id}`}
            type="date"
            value={workDate}
            onChange={(event) => setWorkDate(event.target.value)}
            className="h-11 w-full rounded-sm border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {errorText("workDate") && <p className="text-xs text-destructive">{errorText("workDate")}</p>}
        </div>

        <div className="space-y-1">
          <span className="block text-xs font-medium text-foreground">Waktu</span>
          <label className="inline-flex min-h-touch cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
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
            <label htmlFor={`work-start-${entry.id}`} className="block text-xs font-medium text-foreground">
              Jam mulai
            </label>
            <input
              id={`work-start-${entry.id}`}
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className="h-11 w-full rounded-sm border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`work-end-${entry.id}`} className="block text-xs font-medium text-foreground">
              Jam selesai
            </label>
            <input
              id={`work-end-${entry.id}`}
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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`work-due-date-${entry.id}`} className="block text-xs font-medium text-foreground">
            Tenggat
          </label>
          <input
            id={`work-due-date-${entry.id}`}
            data-testid={`work-entry-editor-due-date-${entry.id}`}
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="h-11 w-full rounded-sm border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Opsional. Tanpa tenggat, tanggal kerja menjadi tenggat.
          </p>
          {errorText("dueDate") && <p className="text-xs text-destructive">{errorText("dueDate")}</p>}
        </div>
      </div>

      <WorkEntryColorPicker
        idPrefix={`work-entry-editor-${entry.id}`}
        value={colorSwatch}
        onChange={setColorSwatch}
      />

      <div className="space-y-1">
        <label htmlFor={`work-location-${entry.id}`} className="block text-xs font-medium text-foreground">
          Lokasi
        </label>
        <input
          id={`work-location-${entry.id}`}
          value={location}
          maxLength={WORK_ENTRY_LOCATION_MAX_LENGTH}
          onChange={(event) => setLocation(event.target.value)}
          placeholder="Opsional"
          className="h-11 w-full rounded-sm border border-input bg-background px-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {errorText("location") && <p className="text-xs text-destructive">{errorText("location")}</p>}
      </div>

      <div className="space-y-1">
        <label htmlFor={`work-realization-${entry.id}`} className="block text-xs font-medium text-foreground">
          Hasil pekerjaan
        </label>
        <textarea
          id={`work-realization-${entry.id}`}
          value={realization}
          rows={2}
          maxLength={WORK_ENTRY_REALIZATION_MAX_LENGTH}
          onChange={(event) => setRealization(event.target.value)}
          placeholder="Opsional, wajib bila status Selesai"
          className="w-full resize-none rounded-sm border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {errorText("realization") && (
          <p className="text-xs text-destructive">{errorText("realization")}</p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor={`work-notes-${entry.id}`} className="block text-xs font-medium text-foreground">
          Catatan
        </label>
        <textarea
          id={`work-notes-${entry.id}`}
          value={notes}
          rows={3}
          maxLength={WORK_ENTRY_NOTES_MAX_LENGTH}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Opsional"
          className="w-full resize-none rounded-sm border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {errorText("notes") && <p className="text-xs text-destructive">{errorText("notes")}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" className="rounded-sm" onClick={submit} disabled={isSaving}>
          {isSaving ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <Check aria-hidden="true" />
          )}
          Simpan detail
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-sm"
          onClick={() => {
            setWorkDate(entry.workDate);
            setIsAllDay(entry.isAllDay);
            setStartTime(formatWorkTimeLabelFromIso(entry.startsAt) ?? "");
            setEndTime(formatWorkTimeLabelFromIso(entry.endsAt) ?? "");
            setLocation(entry.location ?? "");
            setNotes(entry.notes ?? "");
            setRealization(entry.realization ?? "");
            setDueDate(entry.dueDate ?? "");
            setColorSwatch(entry.colorSwatch);
            setErrors({});
          }}
          disabled={isSaving}
        >
          <RotateCcw aria-hidden="true" />
          Kembalikan
        </Button>
      </div>
    </div>
  );
}
