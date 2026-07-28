import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ExcelJS from "exceljs";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

describe("ExcelJS security boundary", () => {
  it("does not use the streaming ExcelJS APIs", async () => {
    const sourceFiles = [
      "src/lib/excel.ts",
      "src/services/export.service.ts",
      "src/services/surat.service.ts",
      "src/services/signature-layout.service.ts",
      "document-workbook-normalizer.mjs",
      "document-layout-rules.mjs",
      "scripts/test-document-layout-rules.mjs",
      "scripts/generate-hierarchy-parent-sql.mjs",
      "scripts/apply-hierarchy-parent-from-preview.mjs",
      "src/test/recommendation-template.test.ts",
      "src/test/signature-layout.test.ts",
    ];

    const source = await Promise.all(
      sourceFiles.map(file => readFile(resolve(process.cwd(), file), "utf8")),
    );

    expect(source.join("\n")).not.toMatch(/ExcelJS\.stream\.xlsx\./);
  });

  it("fails clearly if streaming output is invoked", () => {
    expect(() => new ExcelJS.stream.xlsx.WorkbookWriter({})).toThrow(
      "ExcelJS streaming XLSX output is disabled in SIGAP",
    );
  });

  it("keeps the in-memory workbook API available", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Security test");
    worksheet.getCell("A1").value = "SIGAP";
    worksheet.mergeCells("A1:B1");
    worksheet.getCell("A1").font = { bold: true, color: { argb: "FF123456" } };
    worksheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FF" } };
    worksheet.getCell("A2").dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: ['"Approved,Rejected"'],
    };
    worksheet.pageSetup.printArea = "A1:B3";
    const imageId = workbook.addImage({ buffer: onePixelPng, extension: "png" });
    worksheet.addImage(imageId, "C1:D3");

    const buffer = await workbook.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(buffer);
    const reopenedSheet = reopened.getWorksheet("Security test")!;

    expect(reopenedSheet.getCell("A1").value).toBe("SIGAP");
    expect((reopenedSheet.model as { merges?: string[] }).merges).toContain("A1:B1");
    expect(reopenedSheet.getCell("A1").font.bold).toBe(true);
    expect((reopenedSheet.getCell("A1").fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe("FFE8F0FF");
    expect(reopenedSheet.getCell("A2").dataValidation.type).toBe("list");
    expect(reopenedSheet.pageSetup.printArea).toBe("A1:B3");
    expect(reopenedSheet.getImages()).toHaveLength(1);
  });
});
