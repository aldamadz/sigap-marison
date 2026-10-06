import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type {
  WorkCalendarHoliday,
  WorkCalendarWorkSettings,
  WorkDate,
  WorkEntry,
  WorkEntryOwner,
  WorkEntryRepository,
} from "../types/work-calendar";
import { formatWorkDateKey, formatWorkTimeLabel, workDateToUtcRange } from "./work-calendar-date";
import { getWorkEntryStatusLabel } from "./work-entry-status";
import {
  calculateWorkEntryTiming,
  formatWorkEntryDuration,
  validateWorkEntryTimingScope,
  type WorkEntryTiming,
} from "./work-entry-timing";

export interface WorkCalendarPdfRow {
  entry: WorkEntry;
  timing: WorkEntryTiming;
}

export interface WorkCalendarPdfInput {
  rows: readonly WorkCalendarPdfRow[];
  owner: WorkEntryOwner;
  fromDate: WorkDate;
  toDate: WorkDate;
  now: Date;
}

export interface ExportWorkCalendarPdfInput {
  /** Already selected entries, including carryovers. Every nondeleted entry becomes a row. */
  entries: readonly WorkEntry[];
  repository: Pick<WorkEntryRepository, "listEntryEvents">;
  settings: WorkCalendarWorkSettings;
  holidays: readonly WorkCalendarHoliday[];
  fromDate: WorkDate;
  toDate: WorkDate;
  now: Date;
  owner: WorkEntryOwner;
  signal?: AbortSignal;
}

function pdfText(value: string): string {
  return Array.from(value).filter(character => {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127 || code === 9 || code === 10 || code === 13;
  }).join("");
}

function timestampLabel(value: string | null): string {
  if (value === null) return "-";
  const at = new Date(value);
  if (!Number.isFinite(at.getTime())) return "-";
  return `${formatWorkDateKey(at)}\n${formatWorkTimeLabel(at)} WIB`;
}

/** Returns a real, unsaved PDF. Wrapping and row splitting preserve long titles/results. */
export function buildWorkCalendarPdf(input: WorkCalendarPdfInput): jsPDF {
  if (input.fromDate > input.toDate || !Number.isFinite(input.now.getTime())) throw new RangeError("Rentang ekspor tidak valid.");
  workDateToUtcRange(input.fromDate);
  workDateToUtcRange(input.toDate);
  if (input.rows.some(row => row.entry.ownerId !== input.owner.id)) throw new Error("Pemilik pekerjaan tidak sesuai cakupan ekspor.");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", putOnlyUsedFonts: true });
  doc.setProperties({ title: "Kalender Kerja", author: pdfText(input.owner.name) });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 12;
  const ownerLines: string[] = doc.splitTextToSize(pdfText(input.owner.name), width - margin * 2);
  const headerHeight = 26 + ownerLines.length * 4;
  autoTable(doc, {
    head: [["No", "Tanggal", "Pekerjaan", "Status", "Mulai", "Selesai", "Durasi", "Hasil"]],
    body: input.rows.map(({ entry, timing }, index) => [
      String(index + 1), entry.workDate, pdfText(entry.title), getWorkEntryStatusLabel(entry.status),
      timestampLabel(timing.startsAt), timestampLabel(timing.endsAt),
      formatWorkEntryDuration(timing.durationMs), pdfText(entry.realization ?? "-"),
    ]),
    theme: "grid",
    margin: { left: margin, right: margin, top: headerHeight, bottom: 22 },
    startY: headerHeight,
    showHead: "everyPage",
    pageBreak: "auto",
    rowPageBreak: "auto",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2, overflow: "linebreak", valign: "top", textColor: [25, 25, 25], lineColor: [210, 215, 215], lineWidth: 0.15 },
    headStyles: { fillColor: [35, 70, 65], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 10 }, 1: { cellWidth: 24 }, 2: { cellWidth: 62 }, 3: { cellWidth: 29 },
      4: { cellWidth: 29 }, 5: { cellWidth: 29 }, 6: { cellWidth: 26 },
      7: { cellWidth: width - margin * 2 - 209 },
    },
    willDrawPage: () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("Kalender Kerja", margin, 14);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(ownerLines, margin, 20);
      doc.text(`${input.fromDate} s.d. ${input.toDate} | Asia/Jakarta`, margin, headerHeight - 3);
    },
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const durationNotes: string[] = doc.splitTextToSize(
      "Durasi dalam rentang: otomatis = aktif pada hari/jam kerja, tanpa libur; manual = waktu eksplisit dikurangi jeda status. Keduanya dikurangi istirahat kantor. Tidak diketahui = waktu/riwayat belum memadai.",
      width - margin * 2,
    );
    doc.text(durationNotes, margin, height - 18);
    doc.text(`Snapshot ${timestampLabel(input.now.toISOString()).replace("\n", " ")}`, margin, height - 7);
    doc.text(`Halaman ${page} / ${pages}`, width - margin, height - 7, { align: "right" });
  }
  return doc;
}

function checkAbort(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Ekspor dibatalkan.", "AbortError");
}

// Cancellation must still work when a repository implementation ignores its signal.
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("Ekspor dibatalkan.", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    promise.then(value => {
      signal.removeEventListener("abort", abort);
      resolve(value);
    }, error => {
      signal.removeEventListener("abort", abort);
      reject(error);
    });
  });
}

/**
 * Freezes the input before reads, loads at most four histories concurrently, and fails closed.
 * No file is saved here: the UI calls the returned document's save() after success/abort check.
 */
function captureExportInput(input: ExportWorkCalendarPdfInput): ExportWorkCalendarPdfInput {
  return {
    ...input,
    entries: input.entries.map(entry => ({ ...entry })),
    owner: { ...input.owner },
    fromDate: input.fromDate,
    toDate: input.toDate,
    now: new Date(input.now.getTime()),
    settings: { ...input.settings, workDays: [...input.settings.workDays] },
    holidays: input.holidays.map(holiday => ({ ...holiday })),
  };
}

/** Returns rows only after every canonical history succeeds. Does not generate or save a file. */
export async function collectWorkCalendarPdfRows(input: ExportWorkCalendarPdfInput): Promise<WorkCalendarPdfRow[]> {
  const snapshot = captureExportInput(input);
  validateWorkEntryTimingScope(snapshot);
  if (snapshot.entries.some(entry => entry.ownerId !== snapshot.owner.id)) throw new Error("Pemilik pekerjaan tidak sesuai cakupan ekspor.");
  const entries = snapshot.entries.filter(entry => entry.deletedAt === null);
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error("Pekerjaan duplikat dalam ekspor.");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const signal = controller.signal;
  input.signal?.addEventListener("abort", cancel, { once: true });
  if (input.signal?.aborted) cancel();
  let cursor = 0;
  let failure: { error: unknown } | undefined;
  const rows: WorkCalendarPdfRow[] = new Array(entries.length);
  const worker = async () => {
    try {
      while (cursor < entries.length) {
        checkAbort(signal);
        const index = cursor++;
        const entry = entries[index];
        const events = await abortable(snapshot.repository.listEntryEvents({ entryId: entry.id, signal }), signal);
        checkAbort(signal);
        rows[index] = { entry, timing: calculateWorkEntryTiming({ ...snapshot, entry, events }) };
      }
    } catch (error) {
      failure ??= { error };
      controller.abort();
    }
  };
  try {
    checkAbort(signal);
    await Promise.all(Array.from({ length: Math.min(4, entries.length) }, worker));
    if (failure) throw failure.error;
    checkAbort(signal);
    return rows;
  } finally {
    input.signal?.removeEventListener("abort", cancel);
  }
}

/** Convenience wrapper. The caller owns settings/holiday lookup and the final save()/abort guard. */
export async function exportWorkCalendarPdf(input: ExportWorkCalendarPdfInput): Promise<jsPDF> {
  const snapshot = captureExportInput(input);
  const rows = await collectWorkCalendarPdfRows(snapshot);
  if (snapshot.signal?.aborted) throw new DOMException("Ekspor dibatalkan.", "AbortError");
  return buildWorkCalendarPdf({ ...snapshot, rows });
}
