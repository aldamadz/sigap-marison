import ExcelJS from "exceljs";
import { normalizeGoodsServicesWorksheet } from "./document-layout-rules.mjs";

const thinBorder = { style: "thin", color: { argb: "FF000000" } };

const setCellThinBorder = (cell, sides = {}) => {
  cell.border = {
    top: sides.top ? thinBorder : undefined,
    left: sides.left ? thinBorder : undefined,
    bottom: sides.bottom ? thinBorder : undefined,
    right: sides.right ? thinBorder : undefined,
  };
};

const setRangeGridBorder = (worksheet, startRow, endRow, startCol, endCol) => {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      worksheet.getCell(row, col).border = {
        top: thinBorder,
        left: thinBorder,
        bottom: thinBorder,
        right: thinBorder,
      };
    }
  }
};

const setRangeOuterBorder = (worksheet, startRow, endRow, startCol, endCol) => {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      setCellThinBorder(worksheet.getCell(row, col), {
        top: row === startRow,
        bottom: row === endRow,
        left: col === startCol,
        right: col === endCol,
      });
    }
  }
};

const wrapLines = (value, maxChars = 115, maxLines = 7) => {
  const words = String(value || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
};

const isRecommendationSheet = (worksheet) => {
  const heading = String(worksheet.getCell("C1").value || "").toUpperCase();
  return heading.includes("REKOMENDASI PEREMAJAAN BARANG / ALAT KERJA");
};

const recommendationLocationPic = (location, pic) => {
  const rawLocation = String(location || "").trim();
  const templateLocation = /^kantor pusat\s*\/\s*/i.test(rawLocation)
    ? rawLocation.replace(/^kantor pusat\s*\/\s*/i, "").trim()
    : rawLocation;
  const templatePic = String(pic || "").trim().split(/\s+/)[0] || "";
  return [templateLocation, templatePic].filter(Boolean).join(" / ");
};

const recommendationSummaryRows = (items) => (Array.isArray(items) ? items : []).flatMap((item) => {
  const details = Array.isArray(item?.details) ? item.details : [];
  if (details.length === 0) return [item];
  return details.map((detail) => ({
    location: detail?.location || item?.location,
    pic: detail?.pic || item?.pic,
  }));
});

const projectRecommendationMainTable = (worksheet, items) => {
  const sourceRows = recommendationSummaryRows(items);
  if (sourceRows.length === 0) return false;
  const tableRows = [];
  for (let row = 8; row <= 16; row += 1) {
    const sequence = Number(worksheet.getCell(row, 1).value);
    const itemName = String(worksheet.getCell(row, 2).value || "").trim();
    if (Number.isInteger(sequence) && sequence > 0 && itemName) tableRows.push(row);
  }
  let changed = false;
  tableRows.forEach((row, index) => {
    const source = sourceRows[index];
    if (!source) return;
    const value = recommendationLocationPic(source.location, source.pic);
    if (!value) return;
    const cell = worksheet.getCell(row, 5);
    if (cell.value === value) return;
    cell.value = value;
    cell.alignment = { ...(cell.alignment || {}), horizontal: "left", vertical: "middle", wrapText: true };
    changed = true;
  });
  return changed;
};

const isGoodsServicesSheet = (worksheet) =>
  String(worksheet.getCell("C9").value || "").toUpperCase().includes("NAMA BARANG") &&
  String(worksheet.getCell("J9").value || "").toUpperCase().includes("SAT");

const normalizeLogo = (workbook, worksheet) => {
  const logoCell = worksheet.getCell("A1");
  const logoValue = logoCell.value;
  const hasValueError = logoValue === "#VALUE!" ||
    (logoValue && typeof logoValue === "object" && logoValue.error === "#VALUE!");
  if (hasValueError) logoCell.value = null;
  if (worksheet.getImages().length > 0) return hasValueError;

  const embeddedLogo = (workbook.media || []).find((media) =>
    media.type === "image" && String(media.extension).toLowerCase() === "png" && media.buffer
  );
  if (!embeddedLogo) return hasValueError;

  const imageId = workbook.addImage({ buffer: embeddedLogo.buffer, extension: "png" });
  worksheet.addImage(imageId, {
    tl: { col: 0.22, row: 0.4 },
    ext: { width: 140, height: 50 },
    editAs: "oneCell",
  });
  return true;
};

const normalizeRecommendationNotes = (worksheet) => {
  const merges = Array.isArray(worksheet.model.merges) ? worksheet.model.merges : [];

  const noteCell = worksheet.getCell("B18").value ? worksheet.getCell("B18") : worksheet.getCell("A18");
  const noteText = noteCell.value;
  const noteFont = { ...(noteCell.font || {}), name: noteCell.font?.name || "Arial", size: noteCell.font?.size || 11 };
  const lines = wrapLines(noteText, 130, 7);

  [...merges].forEach((range) => {
    const match = String(range).match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!match) return;
    const startRow = Number(match[2]);
    const endRow = Number(match[4]);
    if (startRow >= 17 && endRow <= 24) {
      try { worksheet.unMergeCells(range); } catch { /* ignore already-unmerged cells */ }
    }
  });

  for (let row = 17; row <= 24; row += 1) {
    for (let col = 1; col <= 8; col += 1) {
      const cell = worksheet.getCell(row, col);
      cell.value = null;
      setCellThinBorder(cell, {
        left: col === 1,
        right: col === 8,
        top: row === 17,
        bottom: row === 24,
      });
      cell.font = noteFont;
      cell.alignment = { horizontal: "left", vertical: "middle", wrapText: false, indent: 1 };
    }
  }

  worksheet.mergeCells("A17:H17");
  const labelCell = worksheet.getCell("A17");
  labelCell.value = "Catatan :";
  labelCell.font = { ...noteFont, bold: true };
  labelCell.alignment = { horizontal: "left", vertical: "middle", wrapText: false, indent: 1 };
  labelCell.border = { top: thinBorder, left: thinBorder, right: thinBorder, bottom: thinBorder };

  worksheet.mergeCells("A18:H24");
  const contentCell = worksheet.getCell("A18");
  contentCell.value = lines.join("\n") || null;
  contentCell.font = noteFont;
  contentCell.alignment = { horizontal: "left", vertical: "top", wrapText: true, indent: 1 };
  contentCell.border = { left: thinBorder, right: thinBorder, bottom: thinBorder };
  setRangeOuterBorder(worksheet, 18, 24, 1, 8);
  contentCell.border = { left: thinBorder, right: thinBorder, bottom: thinBorder };
  return true;
};

const normalizeRecommendationTableMerges = (worksheet) => {
  const merges = Array.isArray(worksheet.model.merges) ? worksheet.model.merges : [];
  let changed = false;
  setRangeGridBorder(worksheet, 8, 16, 1, 10);
  for (let row = 8; row <= 16; row += 1) {
    const range = `B${row}:C${row}`;
    if (!merges.includes(range)) {
      try {
        worksheet.mergeCells(range);
        changed = true;
      } catch {
        // Ignore cells already covered by another merge in custom templates.
      }
    }
    const cell = worksheet.getCell(`B${row}`);
    cell.alignment = { ...(cell.alignment || {}), horizontal: "left", vertical: "middle", wrapText: true, indent: 1 };
    setRangeGridBorder(worksheet, row, row, 2, 3);
  }
  return changed;
};

const normalizeRecommendationSignatureArea = (worksheet) => {
  setRangeGridBorder(worksheet, 17, 24, 9, 10);
  ["I17:J17", "I18:I18", "J18:J18", "I19:I22", "J19:J22", "I23:I23", "J23:J23", "I24:I24", "J24:J24"].forEach((range) => {
    try {
      const [start, end] = range.split(":");
      if (!start || !end || start === end) return;
      worksheet.mergeCells(range);
    } catch {
      // Ignore if the template already has an equivalent merge.
    }
  });
  for (let row = 17; row <= 24; row += 1) {
    for (let col = 9; col <= 10; col += 1) {
      const cell = worksheet.getCell(row, col);
      cell.alignment = {
        ...(cell.alignment || {}),
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
    }
  }
  return true;
};

export const normalizeWorkbookForPdf = async (sourcePath, options = {}) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(sourcePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return false;

  if (isGoodsServicesSheet(worksheet)) {
    normalizeGoodsServicesWorksheet(worksheet);
    await workbook.xlsx.writeFile(sourcePath);
    return true;
  }
  if (!isRecommendationSheet(worksheet)) return false;

  const logoChanged = normalizeLogo(workbook, worksheet);
  const tableChanged = normalizeRecommendationTableMerges(worksheet);
  const locationPicChanged = projectRecommendationMainTable(worksheet, options.recommendationItems);
  const notesChanged = normalizeRecommendationNotes(worksheet);
  const signatureChanged = normalizeRecommendationSignatureArea(worksheet);
  const changed = logoChanged || tableChanged || locationPicChanged || notesChanged || signatureChanged;
  if (changed) await workbook.xlsx.writeFile(sourcePath);
  return changed;
};
