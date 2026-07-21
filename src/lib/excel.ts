import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { normalizeProductionSerial } from "@/lib/production-code";

type ExcelRow = Record<string, string | number | boolean | null | undefined>;
type UnitAllocationTemplateRow = {
  No: number;
  Proyek: string;
  Kavling: string;
  "Struktur Atas": string | number;
  "Struktur Bawah": string | number;
  "Nomor Kode Produksi": string | number;
  "Blok": string;
  "Tanggal Produksi": string;
};

const csvCell = (value: string) => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const parseCsvLine = (line: string) => {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
};

export const excelSerialToDateInput = (serialValue: string | number) => {
  const serial = Number(serialValue);
  if (!Number.isFinite(serial) || serial <= 20000 || serial >= 80000) return "";
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 24 * 60 * 60 * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

export const exportRowsToXlsx = async (
  rows: ExcelRow[],
  sheetName: string,
  fileName: string,
  widths: number[] = []
) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  worksheet.columns = headers.map((header, index) => ({
    header,
    key: header,
    width: widths[index] || Math.max(12, Math.min(36, header.length + 4)),
  }));
  rows.forEach((row) => worksheet.addRow(row));
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).height = 22;
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), fileName);
};

const parseTemplateNumber = (value: string | number) => {
  if (typeof value === "number") return value;
  const digits = String(value || "").replace(/[^\d-]/g, "");
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : "";
};

const parseTemplateDate = (value: string) => {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return text;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
};

const parseTemplateSerial = (value: string | number) => {
  const normalized = normalizeProductionSerial(value);
  if (!normalized) return "";
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : normalized;
};

export const createUnitAllocationTemplateWorkbook = (rows: UnitAllocationTemplateRow[]) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SIGAP";
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet("Alokasi Unit");
  worksheet.columns = [
    { header: "No", key: "No", width: 8 },
    { header: "Proyek", key: "Proyek", width: 32 },
    { header: "Kavling", key: "Kavling", width: 14 },
    { header: "Struktur Atas", key: "Struktur Atas", width: 18 },
    { header: "Struktur Bawah", key: "Struktur Bawah", width: 18 },
    { header: "Nomor Kode Produksi", key: "Nomor Kode Produksi", width: 22 },
    { header: "Blok", key: "Blok", width: 14 },
    { header: "Tanggal Produksi", key: "Tanggal Produksi", width: 18 },
  ];

  rows.forEach((row) => {
    worksheet.addRow({
      ...row,
      "Struktur Atas": parseTemplateNumber(row["Struktur Atas"]),
      "Struktur Bawah": parseTemplateNumber(row["Struktur Bawah"]),
      "Nomor Kode Produksi": parseTemplateSerial(row["Nomor Kode Produksi"]),
      "Tanggal Produksi": parseTemplateDate(row["Tanggal Produksi"]),
    });
  });

  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = "A1:H1";
  worksheet.getRow(1).height = 24;
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F7A3A" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  for (let rowNumber = 2; rowNumber <= Math.max(rows.length + 1, 20); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.height = 22;
    row.getCell(4).numFmt = "#,##0";
    row.getCell(5).numFmt = "#,##0";
    row.getCell(6).numFmt = "000";
    row.getCell(8).numFmt = "dd/mm/yyyy";
    row.getCell(4).dataValidation = {
      type: "whole",
      operator: "greaterThanOrEqual",
      formulae: [0],
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: "Format nominal",
      error: "Isi nominal angka. Contoh: 1000000, 1.000.000, atau 1,000,000.",
      showInputMessage: true,
      promptTitle: "Struktur Atas",
      prompt: "Isi nominal struktur atas. Contoh: 1000000, 1.000.000, atau 1,000,000. Saat import, sistem membaca semuanya sebagai satu juta.",
    };
    row.getCell(5).dataValidation = {
      type: "whole",
      operator: "greaterThanOrEqual",
      formulae: [0],
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: "Format nominal",
      error: "Isi nominal angka. Contoh: 1000000, 1.000.000, atau 1,000,000.",
      showInputMessage: true,
      promptTitle: "Struktur Bawah",
      prompt: "Isi nominal struktur bawah. Contoh: 1000000, 1.000.000, atau 1,000,000. Saat import, sistem membaca semuanya sebagai satu juta.",
    };
    row.getCell(6).dataValidation = {
      type: "whole",
      operator: "greaterThanOrEqual",
      formulae: [0],
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: "Nomor kode produksi",
      error: "Isi nomor dengan angka. Nilai 1 maupun 001 akan ditampilkan sebagai 001.",
      showInputMessage: true,
      promptTitle: "Nomor Kode Produksi",
      prompt: "Isi nomor urut, misalnya 1 atau 001. Template menampilkannya sebagai tiga digit: 001.",
    };
    row.getCell(7).dataValidation = {
      type: "textLength",
      operator: "greaterThanOrEqual",
      formulae: [1],
      allowBlank: true,
      showErrorMessage: false,
      showInputMessage: true,
      promptTitle: "Blok",
      prompt: "Isi kode blok produksi. Contoh: 5.2.",
    };
    row.getCell(8).dataValidation = {
      type: "date",
      operator: "between",
      formulae: [new Date(2000, 0, 1), new Date(2099, 11, 31)],
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: "Format tanggal",
      error: "Isi tanggal yang valid. Contoh: 01/01/25, 01/01/2025, atau 01-01-2025.",
      showInputMessage: true,
      promptTitle: "Tanggal Produksi",
      prompt: "Isi tanggal produksi. Contoh: 01/01/25, 01/01/2025, atau 01-01-2025. Datepicker tergantung aplikasi Excel yang digunakan.",
    };
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.alignment = {
        vertical: "middle",
        horizontal: [1, 3, 6, 7, 8].includes(colNumber) ? "center" : colNumber >= 4 && colNumber <= 5 ? "right" : "left",
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFD1D5DB" } },
        left: { style: "thin", color: { argb: "FFD1D5DB" } },
        bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
        right: { style: "thin", color: { argb: "FFD1D5DB" } },
      };
    });
  }

  worksheet.getColumn(2).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  worksheet.getColumn(4).numFmt = "#,##0";
  worksheet.getColumn(5).numFmt = "#,##0";
  worksheet.getColumn(6).numFmt = "000";
  worksheet.getColumn(8).numFmt = "dd/mm/yyyy";

  return workbook;
};

export const exportUnitAllocationTemplateToXlsx = async (
  rows: UnitAllocationTemplateRow[],
  fileName: string,
) => {
  const workbook = createUnitAllocationTemplateWorkbook(rows);
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), fileName);
};

export const readSpreadsheetRows = async (file: File): Promise<string[][]> => {
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text();
    return text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map(parseCsvLine);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const rows: string[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rows.push(values.map((value) => {
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      if (value && typeof value === "object" && "text" in value) return String((value as { text?: string }).text || "");
      if (value && typeof value === "object" && "result" in value) return String((value as { result?: unknown }).result ?? "");
      return String(value ?? "");
    }));
  });
  return rows;
};

export const writeCsvFile = (rows: ExcelRow[], fileName: string) => {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(String(row[header] ?? ""))).join(",")),
  ];
  saveAs(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), fileName);
};
