import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { readSpreadsheetRows } from "@/lib/excel";
import { parseCurrencyInput } from "@/lib/rupiah";
import { createUnitRecapAttachment } from "@/services/surat/pdf-builders";

const pdf = vi.hoisted(() => ({ table: vi.fn() }));
vi.mock("jspdf-autotable", () => ({ default: pdf.table }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const currencyHeaders = ["Struktur Atas", "Atas", "Struktur Bawah", "Bawah"];
const rawAmounts = [
  [1_703_120, 245999.99999999997],
  [1_703_120, 434492.28583774244],
  [1826521.0770666667, 1203009.0050617284],
];

async function workbookFile(edit?: (sheet: ExcelJS.Worksheet) => void) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Alokasi Unit");
  sheet.addRow(["No", "Proyek", "Kavling", "Tipe Unit", "Struktur Atas", "Struktur Bawah", "Nomor Kode Produksi", "Desain", "Tanggal Produksi"]);
  rawAmounts.forEach(([atas, bawah], index) => {
    const row = sheet.addRow([index + 1, "Proyek Uji", ["B25", "B34", "C32"][index], "30/53", atas, bawah, `00${index + 1}`, "5.3", "21/08/2026"]);
    row.getCell(5).numFmt = '"Rp "#,##0';
    row.getCell(6).numFmt = '"Rp "#,##0';
  });
  edit?.(sheet);
  const bytes = await workbook.xlsx.writeBuffer();
  return { name: "template.xlsx", arrayBuffer: async () => bytes } as File;
}

describe("Unit allocation import money", () => {
  it("preserves all six displayed amounts and the exact recap totals", async () => {
    const rows = await readSpreadsheetRows(await workbookFile(), { currencyHeaders });
    const amounts = rows.slice(1).map(row => row.slice(4, 6).map(parseCurrencyInput));
    expect(amounts).toEqual([[1703120, 246000], [1703120, 434492], [1826521, 1203009]]);

    const units = rows.slice(1).map(row => ({
      value: row[2], label: row[2], type: row[3],
      allocation_detail: { struktur_atas: row[4], struktur_bawah: row[5] },
    }));
    const file = createUnitRecapAttachment({ name: "Proyek Uji" }, units);
    expect(file.type).toBe("application/pdf");
    const options = pdf.table.mock.lastCall![1];
    expect(options.body.map((row: string[]) => row.slice(3))).toEqual([
      ["Rp 1.703.120", "Rp 246.000", "Rp 1.949.120"],
      ["Rp 1.703.120", "Rp 434.492", "Rp 2.137.612"],
      ["Rp 1.826.521", "Rp 1.203.009", "Rp 3.029.530"],
    ]);
    expect(options.foot[0].slice(3)).toEqual(["Rp 5.232.761", "Rp 1.883.501", "Rp 7.116.262"]);
  });

  it("rounds cached numeric formula and shared-formula results without evaluating formulas", async () => {
    const file = await workbookFile(sheet => {
      sheet.getCell("F2").value = { formula: "246000-0.00000000003", result: rawAmounts[0][1] };
      sheet.getCell("F3").value = { sharedFormula: "F2", result: rawAmounts[1][1] };
      sheet.getCell("E4").value = { formula: "1+1", result: rawAmounts[2][0] };
    });
    const rows = await readSpreadsheetRows(file, { currencyHeaders });
    expect(rows[1][5]).toBe("246000");
    expect(rows[2][5]).toBe("434492");
    expect(rows[3][4]).toBe("1826521");
  });

  it.each(["not money", -0.1, Number.MAX_SAFE_INTEGER + 1, { formula: "1+1" }, { formula: "1/0", result: { error: "#DIV/0!" } }])("rejects invalid nonempty currency %j instead of silently clearing it", async value => {
    const file = await workbookFile(sheet => { sheet.getCell("F2").value = value as ExcelJS.CellValue; });
    await expect(readSpreadsheetRows(file, { currencyHeaders })).rejects.toThrow(/F2.*Struktur Bawah/);
  });

  it("keeps explicit zero and blank distinct and leaves non-currency columns untouched", async () => {
    const file = await workbookFile(sheet => {
      sheet.getCell("E2").value = 0;
      sheet.getCell("F2").value = null;
      sheet.getCell("D2").value = "030/053";
      sheet.getCell("E3").value = "Rp 1.703.120";
    });
    const rows = await readSpreadsheetRows(file, { currencyHeaders });
    expect(rows[1].slice(3, 8)).toEqual(["030/053", "0", "", "001", "5.3"]);
    expect(rows[2][4]).toBe("1703120");
  });

  it("does not change the default spreadsheet reader or the strict shared rupiah parser", async () => {
    const rows = await readSpreadsheetRows(await workbookFile());
    expect(rows[1][5]).toBe("245999.99999999997");
    expect(parseCurrencyInput(1.5)).toBeNull();
    expect(parseCurrencyInput("1.5")).toBeNull();
  });

  it("preserves cached formula zero and rounds fractional rupiah consistently", async () => {
    const file = await workbookFile(sheet => {
      sheet.getCell("E2").value = { formula: "0", result: 0 };
      sheet.getCell("F2").value = 1234.5;
      sheet.getCell("E3").value = 1234.49;
    });
    const rows = await readSpreadsheetRows(file, { currencyHeaders });
    expect(rows[1].slice(4, 6)).toEqual(["0", "1235"]);
    expect(rows[2][4]).toBe("1234");
  });

  it("validates CSV currency using the same headers without guessing decimal text", async () => {
    const csv = (text: string) => ({ name: "template.csv", text: async () => text } as File);
    const rows = await readSpreadsheetRows(csv('Kavling,Atas,Bawah,Desain\nB25,"Rp 1.703.120",246000,5.3'), { currencyHeaders });
    expect(rows[1]).toEqual(["B25", "1703120", "246000", "5.3"]);
    await expect(readSpreadsheetRows(csv("Kavling,Atas,Bawah\nB25,1703120,invalid"), { currencyHeaders })).rejects.toThrow(/C2.*Bawah/);
  });

  it.runIf(Boolean(process.env.SIGAP_UNIT_IMPORT_WORKBOOK))("verifies the supplied workbook through the real importer and PDF table", async () => {
    const bytes = readFileSync(process.env.SIGAP_UNIT_IMPORT_WORKBOOK!);
    const rows = await readSpreadsheetRows({ name: "supplied.xlsx", arrayBuffer: async () => Uint8Array.from(bytes).buffer } as File, { currencyHeaders });
    const units = rows.slice(1).filter(row => row[2]).map(row => ({
      value: row[2], label: row[2], unit_type: "3053",
      allocation_detail: { struktur_atas: row[4], struktur_bawah: row[5] },
    }));
    expect(units.map(unit => [unit.value, unit.allocation_detail.struktur_atas, unit.allocation_detail.struktur_bawah])).toEqual([
      ["B25", "1703120", "246000"], ["B34", "1703120", "434492"], ["C32", "1826521", "1203009"],
    ]);
    const actual = await vi.importActual<typeof import("jspdf-autotable")>("jspdf-autotable");
    pdf.table.mockImplementationOnce(actual.default);
    const file = createUnitRecapAttachment({ name: "Marison Sragen", branch: { name: "KCP SRAGEN" } }, units);
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
    expect(Buffer.from(buffer).subarray(0, 5).toString()).toBe("%PDF-");
    if (process.env.SIGAP_UNIT_IMPORT_PDF) writeFileSync(process.env.SIGAP_UNIT_IMPORT_PDF, Buffer.from(buffer));
  });
});
