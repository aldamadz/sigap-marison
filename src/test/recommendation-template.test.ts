import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { suratService } from "@/services/surat.service";

// ExcelJS 4 types resolve Buffer through an older Node declaration while the
// project uses generic Buffer types from Node 22. The runtime value is the same
// binary Buffer; keep the compatibility cast at this fixture boundary.
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
) as unknown as ExcelJS.Media["buffer"];

describe("recommendation template compatibility", () => {
  it("replaces an in-cell image error with a regular embedded image", () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Rekomendasi");
    worksheet.getCell("A1").value = { error: "#VALUE!" };
    workbook.addImage({ buffer: onePixelPng, extension: "png" });

    suratService.normalizeRecommendationTemplate(workbook, worksheet);

    expect(worksheet.getCell("A1").value).toBeNull();
    expect(worksheet.getImages()).toHaveLength(1);
    const imageRange = worksheet.getImages()[0].range as unknown as {
      tl: { col: number; row: number };
      ext: { width: number; height: number };
    };
    expect(imageRange.tl.col).toBeCloseTo(0.1, 2);
    expect(imageRange.tl.row).toBeCloseTo(0.12, 2);
    expect(imageRange.ext).toEqual({ width: 170, height: 60 });
  });

  it("keeps row-wise note merges and the final bottom border", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Rekomendasi");

    for (let row = 18; row <= 24; row += 1) {
      for (let col = 2; col <= 8; col += 1) {
        const cell = worksheet.getCell(row, col);
        cell.border = {
          bottom: row === 24 ? { style: "medium" } : undefined,
          left: col === 2 ? { style: "thin" } : undefined,
          right: col === 8 ? { style: "thin" } : undefined,
        };
      }
      worksheet.mergeCells(`B${row}:H${row}`);
    }

    const field: Parameters<typeof suratService.writeWrappedField>[1] = {
      key: "catatan",
      label: "Catatan",
      type: "textarea",
      cell: "B18",
      merge_range: "B18:H24",
      font_name: "Arial",
      font_size: 11,
    };
    suratService.writeWrappedField(
      worksheet,
      field,
      "Catatan panjang yang perlu dibagi ke beberapa baris tanpa menghilangkan border paling bawah."
    );

    expect((worksheet.model as { merges?: string[] }).merges).toContain("B24:H24");
    expect((worksheet.model as { merges?: string[] }).merges).not.toContain("B18:H24");

    const saved = await workbook.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(saved);
    expect(reopened.worksheets[0].getCell("B24").border.bottom?.style).toBe("medium");
  });
});
