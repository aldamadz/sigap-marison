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
import { formatWorkDateKey, formatWorkDateFull, formatWorkTimeLabel, workDateToUtcRange } from "./work-calendar-date";
import { buildWorkEntryDailyReports } from "./work-entry-daily-report";
import { matchesWorkCalendarStatusFilter, type WorkCalendarStatusFilter } from "./work-calendar-status-filter";
import { getWorkEntryStatusLabel } from "./work-entry-status";
import {
  formatWorkEntryDuration,
  validateWorkEntryTimingScope,
  type WorkEntryTiming,
} from "./work-entry-timing";

export interface WorkCalendarPdfRow {
  entry: WorkEntry;
  timing: WorkEntryTiming;
  reportDate: WorkDate;
  statusKnown: boolean;
}

export interface WorkCalendarPdfInput {
  rows: readonly WorkCalendarPdfRow[];
  owner: WorkEntryOwner;
  fromDate: WorkDate;
  toDate: WorkDate;
  now: Date;
}

export interface ExportWorkCalendarPdfInput {
  /** Date-scoped canonical entries, before status filtering; includes carryovers. */
  entries: readonly WorkEntry[];
  repository: Pick<WorkEntryRepository, "listEntryEvents">;
  settings: WorkCalendarWorkSettings;
  holidays: readonly WorkCalendarHoliday[];
  fromDate: WorkDate;
  toDate: WorkDate;
  now: Date;
  owner: WorkEntryOwner;
  signal?: AbortSignal;
  statusFilter?: WorkCalendarStatusFilter;
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
  return formatWorkTimeLabel(at) ?? "-";
}

export function formatWorkCalendarReportDate(date: WorkDate): string {
  workDateToUtcRange(date);
  return formatWorkDateFull(date).replace(/, (\d) /, ", 0$1 ");
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
  const identityWidth = 105;
  const ownerLines: string[] = doc.splitTextToSize(pdfText(input.owner.name), identityWidth);
  const jobLines: string[] = input.owner.jobTitle ? doc.splitTextToSize(pdfText(input.owner.jobTitle), identityWidth) : [];
  const period = input.fromDate === input.toDate ? formatWorkCalendarReportDate(input.fromDate)
    : `${formatWorkCalendarReportDate(input.fromDate)} - ${formatWorkCalendarReportDate(input.toDate)}`;
  const periodLines: string[] = doc.splitTextToSize(period, width - margin * 2);
  const identityHeight = 18 + (ownerLines.length + jobLines.length) * 4;
  const periodY = Math.max(30, identityHeight + 5);
  const headerHeight = periodY + periodLines.length * 4 + 9;
  autoTable(doc, {
    head: [["No", "Tanggal", "Pekerjaan", "Status", "Mulai", "Selesai", "Durasi", "Hasil"]],
    body: input.rows.map(({ entry, timing, reportDate, statusKnown }, index) => [
      String(index + 1), formatWorkCalendarReportDate(reportDate), pdfText(entry.title),
      statusKnown ? getWorkEntryStatusLabel(entry.status) : "Riwayat belum tersedia",
      timestampLabel(timing.startsAt), timestampLabel(timing.endsAt),
      formatWorkEntryDuration(timing.durationMs), pdfText(entry.realization ?? "-"),
    ]),
    theme: "striped",
    margin: { left: margin, right: margin, top: headerHeight, bottom: 26 },
    startY: headerHeight,
    showHead: "everyPage",
    pageBreak: "auto",
    rowPageBreak: "avoid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 3, overflow: "linebreak", valign: "top", textColor: [35, 42, 45], lineColor: [225, 231, 228], lineWidth: { bottom: 0.15 } },
    alternateRowStyles: { fillColor: [246, 249, 247] },
    headStyles: { fillColor: [34, 86, 64], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: 35 }, 2: { cellWidth: 67 }, 3: { cellWidth: 30 },
      4: { cellWidth: 18, halign: "center" }, 5: { cellWidth: 18, halign: "center" }, 6: { cellWidth: 23, halign: "center" },
      7: { cellWidth: width - margin * 2 - 201 },
    },
    didParseCell: ({ section, column, row, cell }) => {
      if (section !== "body" || column.index !== 3) return;
      const report = input.rows[row.index];
      if (!report?.statusKnown) return;
      cell.styles.fontStyle = "bold";
      const colors: Record<WorkEntry["status"], [number, number, number]> = {
        planned: [90, 100, 110], in_progress: [30, 104, 147], completed: [34, 110, 70], blocked: [163, 89, 18],
      };
      cell.styles.textColor = colors[report.entry.status];
    },
    willDrawPage: () => {
      doc.setFillColor(34, 86, 64);
      doc.rect(margin, 11, 1.2, 13, "F");
      doc.setTextColor(90, 104, 98);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("SIGAP / LAPORAN AKTIVITAS", margin + 5, 14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(31, 49, 40);
      doc.setFontSize(19);
      doc.text("Kalender Kerja", margin + 5, 23);
      doc.setFontSize(11);
      doc.text(ownerLines, width - margin, 14, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(90, 104, 98);
      if (jobLines.length) doc.text(jobLines, width - margin, 14 + ownerLines.length * 4 + 2, { align: "right" });
      doc.setFontSize(10);
      doc.setTextColor(45, 58, 51);
      doc.text(periodLines, margin, periodY);
      doc.setDrawColor(213, 224, 218);
      doc.setLineWidth(0.3);
      doc.line(margin, headerHeight - 5, width - margin, headerHeight - 5);
    },
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const durationNotes: string[] = doc.splitTextToSize(
      "Status dan hasil mengikuti akhir hari laporan, bukan status terbaru. Durasi harian dikurangi istirahat kantor dan jeda pekerjaan. Tidak diketahui = waktu/riwayat belum memadai.",
      width - margin * 2,
    );
    doc.setTextColor(95, 108, 101);
    doc.text(durationNotes, margin, height - 19);
    doc.text(`Diunduh ${formatWorkCalendarReportDate(formatWorkDateKey(input.now))}, ${timestampLabel(input.now.toISOString())}`, margin, height - 7);
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
  const rows: WorkCalendarPdfRow[][] = new Array(entries.length);
  const worker = async () => {
    try {
      while (cursor < entries.length) {
        checkAbort(signal);
        const index = cursor++;
        const entry = entries[index];
        const events = await abortable(snapshot.repository.listEntryEvents({ entryId: entry.id, signal }), signal);
        checkAbort(signal);
        rows[index] = buildWorkEntryDailyReports({ ...snapshot, entry, events }).filter(row =>
          !snapshot.statusFilter || snapshot.statusFilter === "all" || (row.statusKnown
            && matchesWorkCalendarStatusFilter(row.entry, snapshot.statusFilter, row.reportDate)),
        );
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
    return rows.flat().sort((a, b) => a.reportDate.localeCompare(b.reportDate));
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
