import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  applyGoodsServicesTableAlignment,
  buildPgdSignatureSlotPlan,
  buildSignatureLayoutPlan,
  clearGoodsServicesLegacySignatureArea,
  normalizeGoodsServicesWorksheet,
  resolveTableHorizontalAlignment,
} from "../document-layout-rules.mjs";

test("signature rows use first-row grid and align shorter rows right", () => {
  assert.deepEqual(buildSignatureLayoutPlan(3), {
    groupSizes: [3],
    slotCount: 3,
    groupSlotIndexes: [[0, 1, 2]],
    rowCapacity: 2,
  });
  assert.deepEqual(buildSignatureLayoutPlan(5).groupSlotIndexes, [[0, 1, 2], [1, 2]]);
  assert.deepEqual(buildSignatureLayoutPlan(6).groupSlotIndexes, [[0, 1, 2], [0, 1, 2]]);
  assert.deepEqual(buildSignatureLayoutPlan(7).groupSlotIndexes, [[0, 1, 2, 3], [1, 2, 3]]);
  assert.deepEqual(buildSignatureLayoutPlan(8).groupSlotIndexes, [[0, 1, 2, 3], [0, 1, 2, 3]]);
});

test("PGD reference signature slots match workbook geometry", () => {
  assert.deepEqual(buildPgdSignatureSlotPlan(3).groupSlotRanges, [
    [[4, 6], [7, 9], [10, 10]],
  ]);
  assert.deepEqual(buildPgdSignatureSlotPlan(5).groupSlotRanges, [
    [[4, 6], [7, 9], [10, 10]],
    [[7, 9], [10, 10]],
  ]);
  assert.deepEqual(buildPgdSignatureSlotPlan(7).groupSlotRanges, [
    [[3, 3], [4, 6], [7, 9], [10, 10]],
    [[4, 6], [7, 9], [10, 10]],
  ]);
});

test("item names stay left aligned regardless of input control", () => {
  assert.equal(resolveTableHorizontalAlignment("nama_barang", "select"), "left");
  assert.equal(resolveTableHorizontalAlignment("status", "select"), "center");
  assert.equal(resolveTableHorizontalAlignment("jumlah", "number"), "center");
});

test("final workbook normalization fixes merged item-name cells", () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("PGD");
  worksheet.mergeCells("C11:I11");
  worksheet.getCell("C11").alignment = { horizontal: "center" };

  applyGoodsServicesTableAlignment(worksheet, 11, 11);

  assert.equal(worksheet.getCell("C11").alignment.horizontal, "left");
  assert.equal(worksheet.getCell("C11").alignment.indent, 1);
  assert.equal(worksheet.getCell("K11").alignment.horizontal, "center");
  assert.equal(worksheet.getCell("M11").alignment.horizontal, "center");
});

test("goods-services notes and label use one merged block with one outer box", () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("PGD");
  worksheet.getCell("B28").value = "Baris pertama\nBaris kedua";
  worksheet.mergeCells("B28:N31");

  normalizeGoodsServicesWorksheet(worksheet);

  assert.ok(worksheet.model.merges.includes("A27:N31"));
  assert.equal(worksheet.getCell("A27").value.richText.map((part) => part.text).join(""), "Catatan :\nBaris pertama\nBaris kedua");
  assert.equal(worksheet.getCell("A27").border.top?.style, "thin");
  assert.equal(worksheet.getCell("A27").border.right?.style, "thin");
  assert.equal(worksheet.getCell("A27").border.bottom?.style, "thin");
  assert.equal(worksheet.getCell("A27").border.left?.style, "thin");
});

test("goods-services normalization is idempotent", () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("PGD");
  worksheet.getCell("A6").value = "Kepada Yth. Bagian Pengadaan";
  worksheet.getCell("A7").value = "Mohon Pengadaan Barang / Jasa dengan data sebagai berikut:";
  worksheet.getCell("A27").value = "Catatan :";
  worksheet.getCell("B28").value = "Isi catatan";

  normalizeGoodsServicesWorksheet(worksheet);
  normalizeGoodsServicesWorksheet(worksheet);

  assert.equal(worksheet.getCell("A6").value, "Kepada Yth. Bagian Pengadaan\nMohon Pengadaan Barang / Jasa dengan data sebagai berikut:");
  assert.equal(worksheet.getCell("A27").value.richText.map((part) => part.text).join(""), "Catatan :\nIsi catatan");
});

test("goods-services intro removes internal cell lines", () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("PGD");
  worksheet.getCell("A6").value = "Kepada Yth. Bagian Pengadaan";
  worksheet.getCell("A7").value = "Mohon Pengadaan Barang / Jasa dengan data sebagai berikut:";
  worksheet.mergeCells("A8:N8");

  normalizeGoodsServicesWorksheet(worksheet);

  assert.ok(worksheet.model.merges.includes("A6:N8"));
  assert.equal(
    worksheet.getCell("A6").value,
    "Kepada Yth. Bagian Pengadaan\nMohon Pengadaan Barang / Jasa dengan data sebagai berikut:",
  );
  assert.equal(worksheet.getCell("A6").border?.left?.style, "thin");
  assert.equal(worksheet.getCell("A6").border?.right?.style, "thin");
});

test("goods-services identity fields remove internal separators", () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("PGD");
  worksheet.getCell("B5").value = "No. Dokumen";
  worksheet.getCell("D5").value = ": 001/UAI/PBO.1/VI/2026";
  worksheet.getCell("I4").value = "Cabang/Departemen";
  worksheet.getCell("I5").value = "Proyek";
  worksheet.getCell("M4").value = "Pengembangan Organisasi";
  worksheet.getCell("M5").value = "-";

  normalizeGoodsServicesWorksheet(worksheet);

  ["A5:C5", "D5:H5", "I4:K4", "I5:K5", "M4:N4", "M5:N5"].forEach((range) => {
    assert.ok(worksheet.model.merges.includes(range), `${range} must be merged`);
  });
  assert.equal(worksheet.getCell("A5").value, "No. Dokumen");
  assert.equal(worksheet.getCell("D5").value, ": 001/UAI/PBO.1/VI/2026");
});

test("legacy PGD signature grid is removed completely", () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("PGD");
  worksheet.mergeCells("A32:N32");
  worksheet.mergeCells("H40:N40");
  worksheet.getCell("A50").value = "legacy";
  worksheet.getCell("A50").border = { top: { style: "thin" } };

  clearGoodsServicesLegacySignatureArea(worksheet);

  assert.equal(worksheet.model.merges.some((range) => /^(A32:N32|H40:N40)$/.test(range)), false);
  assert.equal(worksheet.getCell("A50").value, null);
  assert.deepEqual(worksheet.getCell("A50").border, {});
});
