import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProductionCode, normalizeProductionSerial } from "../../production-code.mjs";
import { createUnitAllocationTemplateWorkbook } from "@/lib/excel";

describe("production code serial", () => {
  it("keeps a minimum of three digits", () => {
    expect(normalizeProductionSerial(1)).toBe("001");
    expect(normalizeProductionSerial("1")).toBe("001");
    expect(normalizeProductionSerial("001")).toBe("001");
    expect(normalizeProductionSerial(12)).toBe("012");
    expect(normalizeProductionSerial(1234)).toBe("1234");
  });

  it("uses the normalized serial in a complete production code", () => {
    expect(buildProductionCode({ serial: 1, block: "5.2", date: "01/01/2026" }))
      .toBe("001/UAI/PRC/5.2/01/01/2026");
  });

  it("formats and normalizes the allocation spreadsheet boundary", () => {
    const excel = readFileSync(join(process.cwd(), "src/lib/excel.ts"), "utf8");
    const inbox = readFileSync(join(process.cwd(), "src/pages/surat/InboxPage.tsx"), "utf8");
    expect(excel).toContain('row.getCell(7).numFmt = "000"');
    expect(excel).toContain('worksheet.getColumn(7).numFmt = "000"');
    expect(excel).toContain('"Nomor Kode Produksi": parseTemplateSerial');
    expect(inbox).toContain("production_serial: normalizeProductionSerial(row[serialIndex])");
    expect(inbox).toContain("normalizeAllocationDetailForPersistence");
  });

  it("guards incomplete inbox surat relations before rendering detail", () => {
    const inbox = readFileSync(join(process.cwd(), "src/pages/surat/InboxPage.tsx"), "utf8");
    expect(inbox).toContain("const getInboxSurat = (item: any) => {");
    expect(inbox).toContain("Array.isArray(item?.surat_registrasi)");
    expect(inbox).toContain("if (!surat?.id)");
    expect(inbox).toContain("const activeSurat = getInboxSurat(selectedItem);");
    expect(inbox).toContain("{selectedItem && activeSurat ?");
    expect(inbox).toContain("Data antrean belum lengkap");
  });

  it("stores a numeric serial and renders it with three digits in Excel", () => {
    const workbook = createUnitAllocationTemplateWorkbook([{
      No: 1,
      Proyek: "Proyek Uji",
      Kavling: "A01",
      "Struktur Atas": 1_000_000,
      "Struktur Bawah": 2_000_000,
      "Tipe Unit": "60",
      "Nomor Kode Produksi": "001",
      Blok: "5.2",
      "Tanggal Produksi": "01/01/2026",
    }]);
    const serialCell = workbook.getWorksheet("Alokasi Unit")?.getCell("G2");
    expect(serialCell?.value).toBe("001");
    expect(serialCell?.numFmt).toBe("000");
  });
});
