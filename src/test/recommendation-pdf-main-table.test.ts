import ExcelJS from "exceljs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeWorkbookForPdf } from "../../document-workbook-normalizer.mjs";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const createRecommendationWorkbook = async () => {
  const directory = await mkdtemp(join(tmpdir(), "recommendation-main-table-"));
  tempDirectories.push(directory);
  const path = join(directory, "source.xlsx");
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Rekomendasi");
  worksheet.getCell("C1").value = "REKOMENDASI PEREMAJAAN BARANG / ALAT KERJA";
  worksheet.getCell("E6").value = "LOKASI / PIC";
  worksheet.getCell("A9").value = 1;
  worksheet.getCell("B9").value = "Meja Gaming";
  worksheet.getCell("A10").value = 2;
  worksheet.getCell("B10").value = "Kursi Gaming";
  await workbook.xlsx.writeFile(path);
  return path;
};

describe("recommendation PDF main table", () => {
  it("projects canonical Location/PIC into each rendered recommendation row", async () => {
    const path = await createRecommendationWorkbook();

    await normalizeWorkbookForPdf(path, {
      recommendationItems: [
        {
          id: "item-1",
          order: 1,
          applicantName: "Meja Gaming",
          status: "recommended",
          location: "Kantor Pusat / Marketing",
          pic: "Andreas Bayu Darmawan",
          details: [{ id: "detail-1", order: 1, heading: "Meja Gaming" }],
        },
        {
          id: "item-2",
          order: 2,
          applicantName: "Kursi Gaming",
          status: "recommended",
          location: "Kantor Pusat / Marketing",
          pic: "Andreas Bayu Darmawan",
          details: [{ id: "detail-2", order: 1, heading: "Kursi Gaming" }],
        },
      ],
    });

    const normalized = new ExcelJS.Workbook();
    await normalized.xlsx.readFile(path);
    expect(normalized.worksheets[0].getCell("E9").value).toBe("Marketing / Andreas");
    expect(normalized.worksheets[0].getCell("E10").value).toBe("Marketing / Andreas");
  });

  it("does not replace a historical table value when canonical Location/PIC is unavailable", async () => {
    const path = await createRecommendationWorkbook();
    const original = new ExcelJS.Workbook();
    await original.xlsx.readFile(path);
    original.worksheets[0].getCell("E9").value = "Cabang Lama / PIC Lama";
    await original.xlsx.writeFile(path);

    await normalizeWorkbookForPdf(path, {
      recommendationItems: [{
        id: "item-1",
        order: 1,
        applicantName: "Meja Gaming",
        status: "recommended",
        location: "",
        pic: "",
        details: [{ id: "detail-1", order: 1, heading: "Meja Gaming" }],
      }],
    });

    const normalized = new ExcelJS.Workbook();
    await normalized.xlsx.load(await readFile(path));
    expect(normalized.worksheets[0].getCell("E9").value).toBe("Cabang Lama / PIC Lama");
  });

  it("projects an explicit rejected decision and clears stale recommendation output", async () => {
    const path = await createRecommendationWorkbook();
    const original = new ExcelJS.Workbook();
    await original.xlsx.readFile(path);
    original.worksheets[0].getCell("G9").value = "✓";
    original.worksheets[0].getCell("I9").value = "Pembelian baru";
    await original.xlsx.writeFile(path);

    await normalizeWorkbookForPdf(path, {
      recommendationItems: [{
        id: "item-1",
        order: 1,
        applicantName: "Headset",
        status: "not_recommended",
        location: "Marketing",
        pic: "Andreas Bayu Darmawan",
        rejectionReason: "Kondisi masih layak",
        details: [{
          id: "stale-detail",
          order: 1,
          heading: "Headset baru",
          status: "recommended",
          action: "purchase_new",
          description: "Pembelian baru",
        }],
      }],
    });

    const normalized = new ExcelJS.Workbook();
    await normalized.xlsx.readFile(path);
    const sheet = normalized.worksheets[0];
    expect(sheet.getCell("B9").value).toBe("Headset");
    expect(sheet.getCell("G9").value).toBeNull();
    expect(sheet.getCell("H9").value).toBeNull();
    expect(sheet.getCell("I9").value).toBe("TIDAK DIREKOMENDASIKAN");
    expect(sheet.getCell("J9").value).toBe("Kondisi masih layak");
  });
});
