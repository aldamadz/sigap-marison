/**
 * Panel detail satu entry.
 *
 * Dipakai untuk melihat seluruh field lanjutan. Pada mode baca (entry
 * bawahan) tidak ada tombol ubah, sesuai aturan subordinate read-only.
 */

import { useState } from "react";
import { CalendarDays, Hourglass, MapPin, Pencil, StickyNote, UserRound, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { WorkEntry, WorkEntryPatch, WorkEntryOwner } from "../types/work-calendar";
import { formatWorkDateFull, formatWorkTimeLabelFromIso } from "../lib/work-calendar-date";
import { getWorkEntryStatusLabel, isWorkEntryOverdue } from "../lib/work-entry-status";
import { WorkEntryStatusGlyph } from "./WorkEntryStatusGlyph";
import { WorkEntryEditor } from "./WorkEntryEditor";

export interface WorkEntryDetailProps {
  entry: WorkEntry;
  owner?: WorkEntryOwner;
  today: string;
  readOnly: boolean;
  isSaving: boolean;
  onSave: (patch: WorkEntryPatch) => void;
  onClose: () => void;
}

export function WorkEntryDetail({
  entry,
  owner,
  today,
  readOnly,
  isSaving,
  onSave,
  onClose,
}: WorkEntryDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  const overdue = isWorkEntryOverdue(entry, today);
  const startLabel = formatWorkTimeLabelFromIso(entry.startsAt);
  const endLabel = formatWorkTimeLabelFromIso(entry.endsAt);

  return (
    <section
      aria-labelledby={`work-entry-detail-title-${entry.id}`}
      data-testid={`work-entry-detail-${entry.id}`}
      className="rounded-sm border border-border bg-card p-3 shadow-[var(--shadow-card)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            id={`work-entry-detail-title-${entry.id}`}
            className="text-sm font-semibold leading-snug text-foreground"
          >
            {entry.title}
          </h3>
          <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <WorkEntryStatusGlyph status={entry.status} />
            {getWorkEntryStatusLabel(entry.status)}
            {overdue && (
              <span className="inline-flex items-center gap-1 font-medium text-overdue">
                <Hourglass className="h-3.5 w-3.5" aria-hidden="true" />
                Terlambat
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {!readOnly && !isEditing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-sm"
              onClick={() => setIsEditing(true)}
            >
              <Pencil aria-hidden="true" />
              Ubah detail
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-sm"
            onClick={onClose}
            aria-label="Tutup detail pekerjaan"
          >
            <X aria-hidden="true" />
            Tutup
          </Button>
        </div>
      </div>

      {isEditing && !readOnly ? (
        <div className="mt-3">
          <WorkEntryEditor
            entry={entry}
            isSaving={isSaving}
            onSubmit={onSave}
            onClose={() => setIsEditing(false)}
          />
        </div>
      ) : (
        <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
          <div className="flex items-start gap-1.5">
            <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <dt className="text-muted-foreground">Tanggal</dt>
              <dd className="text-foreground">{formatWorkDateFull(entry.workDate)}</dd>
            </div>
          </div>

          <div className="flex items-start gap-1.5">
            <Hourglass className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
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
              <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
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
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <dt className="text-muted-foreground">Lokasi</dt>
              <dd className="text-foreground">{entry.location ?? "Belum diisi"}</dd>
            </div>
          </div>

          <div className="flex items-start gap-1.5 sm:col-span-2">
            <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <dt className="text-muted-foreground">Hasil</dt>
              <dd className="text-foreground">{entry.realization ?? "Belum diisi"}</dd>
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
      )}
    </section>
  );
}
