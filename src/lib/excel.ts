import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { normalizeProductionSerial } from "@/lib/production-code";
import { parseCurrencyInput } from "@/lib/rupiah";

type ExcelRow = Record<string, string | number | boolean | null | undefined>;
type UnitAllocationTemplateRow = {
  No: number;
  Proyek: string;
  Kavling: string;
  "Struktur Atas": string | number;
  "Struktur Bawah": string | number;
  "Tipe Unit": string;
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
  const str = String(value || "").trim();
  const cleaned = str.replace(/^Rp\.?\s*/i, "").replace(/[.,\s]/g, "").replace(/\D/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : "";
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
  return normalized;
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
    { header: "Tipe Unit", key: "Tipe Unit", width: 14 },
    { header: "Struktur Atas", key: "Struktur Atas", width: 18 },
    { header: "Struktur Bawah", key: "Struktur Bawah", width: 18 },
    { header: "Nomor Kode Produksi", key: "Nomor Kode Produksi", width: 22 },
    { header: "Desain", key: "Blok", width: 14 },
    { header: "Tanggal Produksi", key: "Tanggal Produksi", width: 18 },
  ];

  rows.forEach((row) => {
    worksheet.addRow({
      ...row,
      "Tipe Unit": String(row["Tipe Unit"] ?? ""),
      "Struktur Atas": parseTemplateNumber(row["Struktur Atas"]),
      "Struktur Bawah": parseTemplateNumber(row["Struktur Bawah"]),
      "Nomor Kode Produksi": parseTemplateSerial(row["Nomor Kode Produksi"]),
      "Blok": String(row["Blok"] ?? ""),
      "Tanggal Produksi": parseTemplateDate(row["Tanggal Produksi"]),
    });
  });

  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = "A1:I1";
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
    row.getCell(4).numFmt = "@";
    row.getCell(5).numFmt = "#,##0";
    row.getCell(6).numFmt = "#,##0";
    row.getCell(7).numFmt = "000";
    row.getCell(8).numFmt = "@";
    row.getCell(9).numFmt = "dd/mm/yyyy";
    row.getCell(4).dataValidation = {
      type: "textLength",
      operator: "greaterThanOrEqual",
      formulae: [1],
      allowBlank: true,
      showErrorMessage: false,
      showInputMessage: true,
      promptTitle: "Tipe Unit",
      prompt: "Tipe berasal dari external dan tidak diubah melalui impor. Format seperti 60/72 dipertahankan.",
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
      promptTitle: "Struktur Atas",
      prompt: "Isi nominal struktur atas. Contoh: 1000000, 1.000.000, atau 1,000,000. Saat import, sistem membaca semuanya sebagai satu juta.",
    };
    row.getCell(6).dataValidation = {
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
    row.getCell(7).dataValidation = {
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
    row.getCell(8).dataValidation = {
      type: "textLength",
      operator: "greaterThanOrEqual",
      formulae: [1],
      allowBlank: true,
      showErrorMessage: false,
      showInputMessage: true,
      promptTitle: "Desain",
      prompt: "Isi desain hanya bila belum disediakan external. Contoh: 5.2.",
    };
    row.getCell(9).dataValidation = {
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
        horizontal: [1, 3, 4, 7, 8, 9].includes(colNumber) ? "center" : colNumber >= 5 && colNumber <= 6 ? "right" : "left",
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
  worksheet.getColumn(4).numFmt = "@";
  worksheet.getColumn(5).numFmt = "#,##0";
  worksheet.getColumn(6).numFmt = "#,##0";
  worksheet.getColumn(7).numFmt = "000";
  worksheet.getColumn(8).numFmt = "@";
  worksheet.getColumn(9).numFmt = "dd/mm/yyyy";

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

const normalizeSpreadsheetHeader = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

const spreadsheetValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === "object" && "text" in value) return value.text ?? "";
  if (value && typeof value === "object" && "result" in value) return value.result ?? "";
  return value;
};

const spreadsheetAddress = (row: number, column: number) => {
  let letters = "";
  for (let index = column + 1; index > 0; index = Math.floor((index - 1) / 26)) {
    letters = String.fromCharCode(65 + (index - 1) % 26) + letters;
  }
  return `${letters}${row + 1}`;
};

const normalizeSpreadsheetRows = (rows: unknown[][], currencyHeaders: readonly string[]) => {
  const aliases = new Set(currencyHeaders.map(normalizeSpreadsheetHeader));
  const headerIndex = rows.findIndex(row => row.some(value => aliases.has(normalizeSpreadsheetHeader(spreadsheetValue(value)))));
  const headers = rows[headerIndex] || [];
  return rows.map((row, rowIndex) => (currencyHeaders.length ? Array.from(row) : row).map((rawValue, columnIndex) => {
    const value = spreadsheetValue(rawValue);
    const header = String(spreadsheetValue(headers[columnIndex]) ?? "");
    if (headerIndex >= 0 && rowIndex > headerIndex && aliases.has(normalizeSpreadsheetHeader(header))) {
      const isFormula = rawValue && typeof rawValue === "object" && ("formula" in rawValue || "sharedFormula" in rawValue);
      const missingResult = isFormula && (!("result" in rawValue) || rawValue.result === undefined || rawValue.result === null || rawValue.result === "");
      if (!missingResult && (value === null || value === undefined || String(value).trim() === "")) return "";
      // Excel formulas retain fractions even when the displayed amount has no decimals.
      const amount = typeof value === "number" && Number.isFinite(value) && value >= 0
        ? parseCurrencyInput(Math.round(value))
        : parseCurrencyInput(value);
      if (missingResult || amount === null) {
        throw new Error(`Sel ${spreadsheetAddress(rowIndex, columnIndex)} (${header}): nominal tidak valid. Isi angka rupiah; jika memakai rumus, hitung ulang dan simpan file di Excel terlebih dahulu.`);
      }
      return String(amount);
    }
    return String(value ?? "");
  }));
};

export const readSpreadsheetRows = async (
  file: File,
  options: { currencyHeaders?: readonly string[] } = {},
): Promise<string[][]> => {
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text();
    const rows = text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map(parseCsvLine);
    return normalizeSpreadsheetRows(rows, options.currencyHeaders || []);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const rows: unknown[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rows.push(options.currencyHeaders?.length ? values.map((value, index) => {
      if (value && typeof value === "object" && ("formula" in value || "sharedFormula" in value)) {
        // ExcelJS's value object omits a zero formula result; the getter retains it.
        return { ...value, result: row.getCell(index + 1).result };
      }
      return value;
    }) : values);
  });
  return normalizeSpreadsheetRows(rows, options.currencyHeaders || []);
};

export const writeCsvFile = (rows: ExcelRow[], fileName: string) => {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(String(row[header] ?? ""))).join(",")),
  ];
  saveAs(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), fileName);
};
