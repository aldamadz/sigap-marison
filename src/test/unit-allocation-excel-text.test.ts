import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { createUnitAllocationTemplateWorkbook, readSpreadsheetRows } from "@/lib/excel";

function template(type = "30/53", design = "5.3") {
  return createUnitAllocationTemplateWorkbook([{
    No: 1, Proyek: "Proyek Uji", Kavling: "B25", "Tipe Unit": type,
    "Struktur Atas": 1_000_000, "Struktur Bawah": 0,
    "Nomor Kode Produksi": "001", Blok: design, "Tanggal Produksi": "20/08/2026",
  }]);
}

describe("Unit allocation XLSX text cells", () => {
  it.each(["30/53", "60/72", "030", "30", ""])("preserves exact external type %j and design after writing and reopening", async type => {
    const bytes = await template(type).xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(bytes);
    const sheet = reopened.getWorksheet("Alokasi Unit")!;
    expect(sheet.getCell("D2").value ?? "").toBe(type);
    expect(sheet.getCell("D2").text).toBe(type);
    expect(sheet.getCell("H2").value).toBe("5.3");
    expect(sheet.getCell("H2").text).toBe("5.3");
    expect(sheet.getCell("D2").type).not.toBe(ExcelJS.ValueType.Formula);
    expect(sheet.getCell("D2").numFmt).toBe("@");
    expect(sheet.getCell("H2").numFmt).toBe("@");
    expect(sheet.getCell("D20").numFmt).toBe("@");
    expect(sheet.getCell("H20").numFmt).toBe("@");
    expect(sheet.getCell("E2").value).toBe(1_000_000);
    expect(sheet.getCell("F2").value).toBe(0);
    expect(sheet.getCell("G2").value).toBe("001");
    expect(sheet.getCell("I2").value).toBeInstanceOf(Date);
    expect(sheet.getRow(1).values).toEqual([undefined, "No", "Proyek", "Kavling", "Tipe Unit", "Struktur Atas", "Struktur Bawah", "Nomor Kode Produksi", "Desain", "Tanggal Produksi"]);
    expect(sheet.autoFilter).toBe("A1:I1");
    expect(sheet.getCell("E2").dataValidation.type).toBe("whole");
  });

  it("round-trips through the actual importer without serialized object text", async () => {
    const bytes = await template().xlsx.writeBuffer();
    const rows = await readSpreadsheetRows({ name: "template.xlsx", arrayBuffer: async () => bytes } as File);
    expect(rows[1].slice(0, 8)).toEqual(["1", "Proyek Uji", "B25", "30/53", "1000000", "0", "001", "5.3"]);
    expect(JSON.stringify(rows)).not.toContain('{\\"text\\":');
  });

  it("keeps formula-looking external text as literal strings", async () => {
    const bytes = await template("=1+1", "=HYPERLINK(\"https://example.invalid\")").xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(bytes);
    const sheet = reopened.worksheets[0];
    expect(sheet.getCell("D2").value).toBe("=1+1");
    expect(sheet.getCell("H2").type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell("H2").formula).toBeUndefined();
  });
});
