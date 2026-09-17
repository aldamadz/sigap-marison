/**
 * Aksi cepat siklus hidup pekerjaan di panel detail (CAL-03 F5).
 *
 * Aturan produk:
 * - "Lanjutkan hari ini" dan "Ubah jadwal" memindahkan tanggal kerja pada
 *   baris yang sama (`workDate`), tidak pernah membuat pekerjaan baru;
 * - "Terhambat" dan "Selesai" mengubah status pada baris yang sama dan
 *   meminta input lanjutan secara inline (alasan / hasil pekerjaan);
 * - seluruh perubahan dikirim sebagai satu PATCH lewat `onSave`.
 *
 * Komponen ini tidak mengakses repository/jaringan.
 */

import { useState } from "react";
import { CalendarClock, CalendarPlus, Check, CircleSlash, Play, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { WorkEntry, WorkEntryPatch, WorkEntryStatus } from "../types/work-calendar";
import {
  WORK_ENTRY_BLOCKED_REASON_MAX_LENGTH,
  WORK_ENTRY_REALIZATION_MAX_LENGTH,
} from "../lib/work-entry-validation";
import {
  buildBlockedPatch,
  buildCompletePatch,
  buildContinueTodayPatch,
  buildStatusPatch,
} from "../lib/work-entry-lifecycle";

export interface WorkEntryLifecycleActionsProps {
  entry: WorkEntry;
  today: string;
  isSaving: boolean;
  onSave: (patch: WorkEntryPatch) => void;
  /** Membuka editor detail untuk "Ubah jadwal". */
  onEditDetail: () => void;
}

export function WorkEntryLifecycleActions({
  entry,
  today,
  isSaving,
  onSave,
  onEditDetail,
}: WorkEntryLifecycleActionsProps) {
  const [prompt, setPrompt] = useState<"completed" | "blocked" | null>(null);
  const [text, setText] = useState("");

  const continuePatch = buildContinueTodayPatch(entry, today);
  const isFinished = entry.status === "completed";

  const requestStatus = (status: WorkEntryStatus) => {
    if (status === entry.status) return;
    if (status === "completed") {
      setText("");
      setPrompt("completed");
      return;
    }
    if (status === "blocked") {
      setText(entry.blockedReason ?? "");
      setPrompt("blocked");
      return;
    }
    onSave(buildStatusPatch(status));
  };

  const submitPrompt = () => {
    const value = text.trim();
    if (value.length === 0) return;
    onSave(
      prompt === "completed" ? buildCompletePatch(value) : buildBlockedPatch(value),
    );
    setPrompt(null);
    setText("");
  };

  return (
    <div
      data-testid={`work-entry-lifecycle-actions-${entry.id}`}
      className="mb-3 space-y-2 rounded-sm border border-border bg-muted p-2.5"
    >
      <p className="text-xs font-medium text-foreground">Aksi cepat</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-sm"
          data-testid={`work-entry-continue-today-${entry.id}`}
          disabled={isSaving || continuePatch === null || isFinished}
          onClick={() => {
            if (continuePatch) onSave(continuePatch);
          }}
        >
          <CalendarPlus aria-hidden="true" />
          Lanjutkan hari ini
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-sm"
          data-testid={`work-entry-reschedule-${entry.id}`}
          disabled={isSaving || isFinished}
          onClick={onEditDetail}
        >
          <CalendarClock aria-hidden="true" />
          Ubah jadwal
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-sm"
          data-testid={`work-entry-block-${entry.id}`}
          disabled={isSaving || entry.status === "blocked"}
          onClick={() => requestStatus("blocked")}
        >
          <CircleSlash aria-hidden="true" />
          Terhambat
        </Button>

        <Button
          type="button"
          size="sm"
          className="rounded-sm"
          data-testid={`work-entry-complete-${entry.id}`}
          disabled={isSaving || isFinished}
          onClick={() => requestStatus("completed")}
        >
          <Check aria-hidden="true" />
          Selesai
        </Button>

        {entry.status !== "in_progress" && !isFinished && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-sm"
            data-testid={`work-entry-start-${entry.id}`}
            disabled={isSaving}
            onClick={() => requestStatus("in_progress")}
          >
            <Play aria-hidden="true" />
            Sedang dikerjakan
          </Button>
        )}
      </div>

      {prompt !== null && (
        <div className="space-y-1.5 rounded-sm border border-input bg-background p-2">
          <label
            htmlFor={`work-entry-lifecycle-input-${entry.id}`}
            className="block text-xs font-medium text-foreground"
          >
            {prompt === "completed" ? "Hasil pekerjaan" : "Alasan terhambat"}
          </label>
          <textarea
            id={`work-entry-lifecycle-input-${entry.id}`}
            data-testid={`work-entry-lifecycle-input-${entry.id}`}
            value={text}
            rows={2}
            maxLength={
              prompt === "completed"
                ? WORK_ENTRY_REALIZATION_MAX_LENGTH
                : WORK_ENTRY_BLOCKED_REASON_MAX_LENGTH
            }
            onChange={(event) => setText(event.target.value)}
            placeholder={prompt === "completed" ? "Tuliskan hasilnya" : "Tuliskan alasannya"}
            className="w-full resize-none rounded-sm border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              className="rounded-sm"
              data-testid={`work-entry-lifecycle-submit-${entry.id}`}
              disabled={isSaving || text.trim().length === 0}
              onClick={submitPrompt}
            >
              <Check aria-hidden="true" />
              Simpan
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-sm"
              onClick={() => {
                setPrompt(null);
                setText("");
              }}
            >
              <X aria-hidden="true" />
              Batal
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
