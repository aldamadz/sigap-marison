const thinBorder = { style: "thin", color: { argb: "FF000000" } };
const marisonSoftGreenFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7FAF5" } };
const marisonHeaderFont = { color: { argb: "FF111827" }, bold: true };

const SIGNATURE_GROUPS = {
  2: [2],
  3: [3],
  4: [4],
  5: [3, 2],
  6: [3, 3],
  7: [4, 3],
  8: [4, 4],
};

export const buildSignatureLayoutPlan = (total, maxPerRow = 4) => {
  const count = Number(total);
  if (!Number.isInteger(count) || count < 2 || count > 8) {
    throw new Error("Jumlah penandatangan harus 2 sampai 8.");
  }

  const preferred = maxPerRow === 4 ? SIGNATURE_GROUPS[count] : null;
  const groupSizes = preferred || Array.from(
    { length: Math.ceil(count / maxPerRow) },
    (_item, index) => Math.min(maxPerRow, count - index * maxPerRow),
  );
  const slotCount = groupSizes[0];
  const groupSlotIndexes = groupSizes.map((size) => {
    const offset = slotCount - size;
    return Array.from({ length: size }, (_item, index) => offset + index);
  });

  return { groupSizes: [...groupSizes], slotCount, groupSlotIndexes, rowCapacity: 2 };
};

const PGD_SIGNATURE_REFERENCE = {
  3: {
    groupSizes: [3],
    dateRange: [4, 10],
    groupSlotRanges: [
      [[4, 6], [7, 9], [10, 10]],
    ],
  },
  4: {
    groupSizes: [4],
    dateRange: [3, 10],
    groupSlotRanges: [
      [[3, 3], [4, 6], [7, 9], [10, 10]],
    ],
  },
  5: {
    groupSizes: [3, 2],
    dateRange: [4, 10],
    groupSlotRanges: [
      [[4, 6], [7, 9], [10, 10]],
      [[7, 9], [10, 10]],
    ],
  },
  6: {
    groupSizes: [3, 3],
    dateRange: [4, 10],
    groupSlotRanges: [
      [[4, 6], [7, 9], [10, 10]],
      [[4, 6], [7, 9], [10, 10]],
    ],
  },
  7: {
    groupSizes: [4, 3],
    dateRange: [3, 10],
    groupSlotRanges: [
      [[3, 3], [4, 6], [7, 9], [10, 10]],
      [[4, 6], [7, 9], [10, 10]],
    ],
  },
  8: {
    groupSizes: [4, 4],
    dateRange: [3, 10],
    groupSlotRanges: [
      [[3, 3], [4, 6], [7, 9], [10, 10]],
      [[3, 3], [4, 6], [7, 9], [10, 10]],
    ],
  },
};

export const buildPgdSignatureSlotPlan = (total) => {
  const count = Number(total);
  const reference = PGD_SIGNATURE_REFERENCE[count];
  if (!reference) {
    throw new Error("Preset PGD hanya mendukung 3 sampai 8 tahap tanda tangan.");
  }

  return {
    groupSizes: [...reference.groupSizes],
    dateRange: [...reference.dateRange],
    groupSlotRanges: reference.groupSlotRanges.map((row) => row.map((range) => [...range])),
    rowCapacity: 2,
    geometry: "pgd_reference_v2",
  };
};

export const applyGoodsServicesTableAlignment = (worksheet, startRow = 11, endRow = 25) => {
  for (let row = startRow; row <= endRow; row += 1) {
    const hasItem = [2, 3, 10, 11, 13, 14].some((col) => {
      const value = worksheet.getCell(row, col).value;
      return value !== null && value !== undefined && String(value).trim() !== "";
    });
    for (let col = 3; col <= 9; col += 1) {
      const cell = worksheet.getCell(row, col);
      cell.fill = { type: "pattern", pattern: "none" };
      cell.alignment = {
        ...(cell.alignment || {}),
        horizontal: "left",
        vertical: "middle",
        wrapText: true,
        indent: 1,
      };
    }
    for (let col = 1; col <= 14; col += 1) {
      const cell = worksheet.getCell(row, col);
      cell.fill = { type: "pattern", pattern: "none" };
      if (col === 1 && !hasItem) cell.value = null;
    }
    for (let col of [1, 10, 11, 12, 13]) {
      const cell = worksheet.getCell(row, col);
      cell.alignment = {
        ...(cell.alignment || {}),
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
    }
    const itemCell = worksheet.getCell(row, 3);
    itemCell.alignment = {
      ...(itemCell.alignment || {}),
      horizontal: "left",
      vertical: "middle",
      wrapText: true,
      indent: 1,
    };
    const noteCell = worksheet.getCell(row, 14);
    noteCell.alignment = {
      ...(noteCell.alignment || {}),
      horizontal: "left",
      vertical: "middle",
      wrapText: true,
      indent: 1,
    };
  }
  return true;
};

const parseCellAddress = (address) => {
  const match = String(address || "").match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  let col = 0;
  for (const char of match[1].toUpperCase()) col = col * 26 + char.charCodeAt(0) - 64;
  return { col, row: Number(match[2]) };
};

const columnNumberToName = (columnNumber) => {
  let value = Number(columnNumber);
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
};

const setRangeFillAndFont = (worksheet, range, fill = marisonSoftGreenFill, font = marisonHeaderFont) => {
  const [startAddress, endAddress = startAddress] = String(range).split(":");
  const start = parseCellAddress(startAddress);
  const end = parseCellAddress(endAddress);
  if (!start || !end) return;
  for (let row = start.row; row <= end.row; row += 1) {
    for (let col = start.col; col <= end.col; col += 1) {
      const cell = worksheet.getCell(row, col);
      cell.fill = fill;
      cell.font = { ...(cell.font || {}), ...font };
      cell.alignment = { ...(cell.alignment || {}), horizontal: "center", vertical: "middle", wrapText: true };
    }
  }
};

const setRangeOuterBorder = (worksheet, range) => {
  const [startAddress, endAddress = startAddress] = String(range).split(":");
  const start = parseCellAddress(startAddress);
  const end = parseCellAddress(endAddress);
  if (!start || !end) return;
  for (let row = start.row; row <= end.row; row += 1) {
    for (let col = start.col; col <= end.col; col += 1) {
      worksheet.getCell(row, col).border = {
        ...(worksheet.getCell(row, col).border || {}),
        ...(row === start.row ? { top: thinBorder } : {}),
        ...(row === end.row ? { bottom: thinBorder } : {}),
        ...(col === start.col ? { left: thinBorder } : {}),
        ...(col === end.col ? { right: thinBorder } : {}),
      };
    }
  }
};

const setCellBorder = (worksheet, address, sides = {}) => {
  worksheet.getCell(address).border = {
    top: sides.top ? thinBorder : undefined,
    left: sides.left ? thinBorder : undefined,
    bottom: sides.bottom ? thinBorder : undefined,
    right: sides.right ? thinBorder : undefined,
  };
};

const setCellAlignment = (cell, alignment) => {
  cell.style = {
    ...(cell.style || {}),
    alignment: { ...alignment },
  };
};

const setRangeCleanOuterBorder = (worksheet, range) => {
  const [startAddress, endAddress = startAddress] = String(range).split(":");
  const start = parseCellAddress(startAddress);
  const end = parseCellAddress(endAddress);
  if (!start || !end) return;
  for (let row = start.row; row <= end.row; row += 1) {
    for (let col = start.col; col <= end.col; col += 1) {
      worksheet.getCell(row, col).border = {
        top: row === start.row ? thinBorder : undefined,
        left: col === start.col ? thinBorder : undefined,
        bottom: row === end.row ? thinBorder : undefined,
        right: col === end.col ? thinBorder : undefined,
      };
    }
  }
};

const splitNoteLines = (value) => String(value || "")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const cellValueToText = (value) => {
  if (value && typeof value === "object" && Array.isArray(value.richText)) {
    return value.richText.map((part) => String(part?.text || "")).join("");
  }
  return String(value || "");
};

const normalizeGoodsServicesNotes = (worksheet, noteRange) => {
  const [noteStart, noteEnd = noteStart] = noteRange.split(":");
  const start = parseCellAddress(noteStart);
  const end = parseCellAddress(noteEnd);
  if (!start || !end) return;

  const blockStart = { col: Math.max(1, start.col - 1), row: Math.max(1, start.row - 1) };
  const seenMasters = new Set();
  const existingLines = [];
  for (let row = blockStart.row; row <= end.row; row += 1) {
    for (let col = blockStart.col; col <= end.col; col += 1) {
      const sourceCell = worksheet.getCell(row, col);
      const master = sourceCell.master || sourceCell;
      if (seenMasters.has(master.address)) continue;
      seenMasters.add(master.address);
      splitNoteLines(cellValueToText(master.value)).forEach((line) => {
        const cleaned = line.replace(/^catatan\s*:\s*/i, "").trim();
        if (cleaned) existingLines.push(cleaned);
      });
    }
  }

  const existingMerges = Array.isArray(worksheet.model?.merges) ? [...worksheet.model.merges] : [];
  existingMerges.forEach((range) => {
    const parsed = String(range).toUpperCase().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!parsed) return;
    const mergeStart = parseCellAddress(`${parsed[1]}${parsed[2]}`);
    const mergeEnd = parseCellAddress(`${parsed[3]}${parsed[4]}`);
    if (!mergeStart || !mergeEnd) return;
    const overlapsNote = mergeStart.row <= end.row &&
      mergeEnd.row >= blockStart.row &&
      mergeStart.col <= end.col &&
      mergeEnd.col >= blockStart.col;
    if (overlapsNote) {
      try { worksheet.unMergeCells(range); } catch { /* keep going when ExcelJS already unmerged it */ }
    }
  });

  for (let row = blockStart.row; row <= end.row; row += 1) {
    for (let col = blockStart.col; col <= end.col; col += 1) {
      const cell = worksheet.getCell(row, col);
      cell.value = null;
      cell.border = {};
    }
  }

  const blockRange = `${columnNumberToName(blockStart.col)}${blockStart.row}:${columnNumberToName(end.col)}${end.row}`;
  ensureMerge(worksheet, blockRange);
  const cell = worksheet.getCell(blockStart.row, blockStart.col);
  const fontName = cell.font?.name || "Arial";
  const fontSize = Number(cell.font?.size || 11);
  cell.value = {
    richText: [
      { text: "Catatan :", font: { name: fontName, size: fontSize, bold: true } },
      ...(existingLines.length
        ? [{ text: `\n${existingLines.join("\n")}`, font: { name: fontName, size: fontSize, bold: false } }]
        : []),
    ],
  };
  cell.alignment = { ...(cell.alignment || {}), horizontal: "left", vertical: "top", wrapText: true, indent: 1 };
  cell.font = { ...(cell.font || {}), name: fontName, size: fontSize, bold: false };
  cell.border = { top: thinBorder, right: thinBorder, bottom: thinBorder, left: thinBorder };
};

const normalizeGoodsServicesIntro = (worksheet) => {
  const range = "A6:N8";
  const seenMasters = new Set();
  const lines = [worksheet.getCell("A6"), worksheet.getCell("A7")]
    .flatMap((sourceCell) => {
      const master = sourceCell.master || sourceCell;
      if (seenMasters.has(master.address)) return [];
      seenMasters.add(master.address);
      return splitNoteLines(cellValueToText(master.value));
    })
    .filter(Boolean);
  const existingMerges = Array.isArray(worksheet.model?.merges) ? [...worksheet.model.merges] : [];
  existingMerges.forEach((existingRange) => {
    const parsed = String(existingRange).toUpperCase().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!parsed) return;
    const mergeStart = parseCellAddress(`${parsed[1]}${parsed[2]}`);
    const mergeEnd = parseCellAddress(`${parsed[3]}${parsed[4]}`);
    if (!mergeStart || !mergeEnd) return;
    const overlaps = mergeStart.row <= 8 && mergeEnd.row >= 6 && mergeStart.col <= 14 && mergeEnd.col >= 1;
    if (overlaps) {
      try { worksheet.unMergeCells(existingRange); } catch { /* already unmerged */ }
    }
  });
  for (let row = 6; row <= 8; row += 1) {
    for (let col = 1; col <= 14; col += 1) {
      const cell = worksheet.getCell(row, col);
      cell.value = null;
      cell.border = {};
    }
  }
  ensureMerge(worksheet, range);
  const cell = worksheet.getCell("A6");
  cell.value = lines.join("\n");
  cell.alignment = { ...(cell.alignment || {}), horizontal: "left", vertical: "middle", wrapText: true, indent: 1 };
  cell.border = { top: thinBorder, right: thinBorder, bottom: thinBorder, left: thinBorder };
};

const normalizeGoodsServicesIdentityBorders = (worksheet) => {
  for (let row = 4; row <= 5; row += 1) {
    for (let col = 1; col <= 6; col += 1) {
      worksheet.getCell(row, col).border = {};
    }
  }

  setCellBorder(worksheet, "A4", { left: true });
  setCellBorder(worksheet, "B4", { top: true, left: true, right: true, bottom: true });
  setCellBorder(worksheet, "C4", { right: true, bottom: true });
  setCellBorder(worksheet, "D4", {});
  setCellBorder(worksheet, "E4", { top: true, left: true, right: true, bottom: true });
  setCellBorder(worksheet, "F4", { top: true, right: true, bottom: true });

  setCellBorder(worksheet, "A5", { top: true, left: true, right: true, bottom: true });
  setCellBorder(worksheet, "B5", { top: true, left: true, right: true, bottom: true });
  setCellBorder(worksheet, "C5", { top: true, left: true, right: true, bottom: true });
  setCellBorder(worksheet, "D5", { top: true, bottom: true });
  setCellBorder(worksheet, "E5", { top: true, left: true, bottom: true });
  setCellBorder(worksheet, "F5", { top: true, bottom: true });
};

const rebuildSingleRowMerge = (worksheet, range, sourceAddress) => {
  const [startAddress, endAddress = startAddress] = range.split(":");
  const start = parseCellAddress(startAddress);
  const end = parseCellAddress(endAddress);
  if (!start || !end) return;
  const sourceCell = worksheet.getCell(sourceAddress || startAddress);
  const value = sourceCell.value;
  const sourceStyle = JSON.parse(JSON.stringify(sourceCell.style || {}));
  const existingMerges = Array.isArray(worksheet.model?.merges) ? [...worksheet.model.merges] : [];
  existingMerges.forEach((existingRange) => {
    const parsed = String(existingRange).toUpperCase().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!parsed) return;
    const mergeStart = parseCellAddress(`${parsed[1]}${parsed[2]}`);
    const mergeEnd = parseCellAddress(`${parsed[3]}${parsed[4]}`);
    if (!mergeStart || !mergeEnd) return;
    const overlaps = mergeStart.row <= end.row && mergeEnd.row >= start.row &&
      mergeStart.col <= end.col && mergeEnd.col >= start.col;
    if (overlaps) {
      try { worksheet.unMergeCells(existingRange); } catch { /* already unmerged */ }
    }
  });
  for (let col = start.col; col <= end.col; col += 1) {
    const cell = worksheet.getCell(start.row, col);
    cell.value = null;
    cell.border = {};
  }
  ensureMerge(worksheet, range);
  const cell = worksheet.getCell(start.row, start.col);
  cell.style = sourceStyle;
  cell.value = value;
  cell.border = { top: thinBorder, right: thinBorder, bottom: thinBorder, left: thinBorder };
  cell.alignment = { ...(cell.alignment || {}), vertical: "middle", wrapText: true };
};

const normalizeGoodsServicesIdentityMerges = (worksheet) => {
  rebuildSingleRowMerge(worksheet, "A5:C5", "B5");
  rebuildSingleRowMerge(worksheet, "D5:H5", "D5");
  rebuildSingleRowMerge(worksheet, "I4:K4", "I4");
  rebuildSingleRowMerge(worksheet, "I5:K5", "I5");
  rebuildSingleRowMerge(worksheet, "M4:N4", "M4");
  rebuildSingleRowMerge(worksheet, "M5:N5", "M5");
};

const ensureMerge = (worksheet, range) => {
  const merges = Array.isArray(worksheet.model?.merges) ? worksheet.model.merges : [];
  if (merges.includes(range)) return;
  try {
    worksheet.mergeCells(range);
  } catch {
    // Existing templates may already have an overlapping merge. Keep the template merge.
  }
};

export const clearGoodsServicesLegacySignatureArea = (worksheet) => {
  const startRow = 32;
  const endRow = 64;
  const startCol = 1;
  const endCol = 14;
  const existingMerges = Array.isArray(worksheet.model?.merges) ? [...worksheet.model.merges] : [];
  existingMerges.forEach((existingRange) => {
    const parsed = String(existingRange).toUpperCase().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!parsed) return;
    const mergeStart = parseCellAddress(`${parsed[1]}${parsed[2]}`);
    const mergeEnd = parseCellAddress(`${parsed[3]}${parsed[4]}`);
    if (!mergeStart || !mergeEnd) return;
    const overlaps = mergeStart.row <= endRow && mergeEnd.row >= startRow &&
      mergeStart.col <= endCol && mergeEnd.col >= startCol;
    if (overlaps) {
      try { worksheet.unMergeCells(existingRange); } catch { /* already unmerged */ }
    }
  });
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const cell = worksheet.getCell(row, col);
      cell.value = null;
      cell.style = {};
      cell.border = {};
      cell.fill = { type: "pattern", pattern: "none" };
    }
  }
};

export const normalizeGoodsServicesWorksheet = (worksheet, options = {}) => {
  setRangeFillAndFont(worksheet, "A1:N3");
  setRangeFillAndFont(worksheet, "A9:N9");
  ensureMerge(worksheet, "L2:M2");
  setCellAlignment(worksheet.getCell("L2"), { horizontal: "left", vertical: "middle", wrapText: true, indent: 1 });
  setRangeOuterBorder(worksheet, "L2:M2");

  normalizeGoodsServicesIdentityBorders(worksheet);
  normalizeGoodsServicesIdentityMerges(worksheet);
  normalizeGoodsServicesIntro(worksheet);

  ["B4", "E4"].forEach((address) => {
    const cell = worksheet.getCell(address);
    cell.alignment = { ...(cell.alignment || {}), horizontal: "center", vertical: "middle", wrapText: true };
  });

  ensureMerge(worksheet, "M4:N4");
  ensureMerge(worksheet, "M5:N5");
  worksheet.getCell("L4").alignment = { ...(worksheet.getCell("L4").alignment || {}), horizontal: "center", vertical: "middle" };
  worksheet.getCell("L5").alignment = { ...(worksheet.getCell("L5").alignment || {}), horizontal: "center", vertical: "middle" };
  worksheet.getCell("M4").alignment = { ...(worksheet.getCell("M4").alignment || {}), horizontal: "left", vertical: "middle", wrapText: true, indent: 1 };
  worksheet.getCell("M5").alignment = { ...(worksheet.getCell("M5").alignment || {}), horizontal: "left", vertical: "middle", wrapText: true, indent: 1 };
  setRangeOuterBorder(worksheet, "M4:N4");
  setRangeOuterBorder(worksheet, "M5:N5");

  for (let row = 11; row <= 25; row += 1) {
    ensureMerge(worksheet, `C${row}:I${row}`);
    ensureMerge(worksheet, `K${row}:L${row}`);
  }
  applyGoodsServicesTableAlignment(worksheet);

  for (let row = 28; row <= 31; row += 1) {
    for (let col = 1; col <= 14; col += 1) {
      worksheet.getCell(row, col).border = {};
    }
  }
  normalizeGoodsServicesNotes(worksheet, String(options.noteRange || "B28:N31").toUpperCase());

  ["B4", "E4"].forEach((address) => {
    setCellAlignment(worksheet.getCell(address), { horizontal: "center", vertical: "middle", wrapText: true });
  });
  for (let row = 11; row <= 25; row += 1) {
    setCellAlignment(worksheet.getCell(`C${row}`), { horizontal: "left", vertical: "middle", wrapText: true, indent: 1 });
    setCellAlignment(worksheet.getCell(`K${row}`), { horizontal: "center", vertical: "middle", wrapText: true });
    setCellAlignment(worksheet.getCell(`M${row}`), { horizontal: "center", vertical: "middle", wrapText: true });
    setCellAlignment(worksheet.getCell(`N${row}`), { horizontal: "left", vertical: "middle", wrapText: true, indent: 1 });
  }

  return true;
};

export const resolveTableHorizontalAlignment = (key, type) => {
  const normalizedKey = String(key || "").trim().toLowerCase();
  if (["nama_barang", "nama", "barang"].includes(normalizedKey)) return "left";
  return ["number", "date", "select"].includes(String(type || "").trim().toLowerCase())
    ? "center"
    : "left";
};
