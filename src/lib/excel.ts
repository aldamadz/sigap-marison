import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

type ExcelRow = Record<string, string | number | boolean | null | undefined>;

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
