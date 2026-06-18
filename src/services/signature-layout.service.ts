import ExcelJS from "exceljs";

export type SignatureLayoutConfig = {
  enabled: boolean;
  preset: "adaptive" | "pgd";
  sheet: number;
  region: string;
  max_per_row: number;
  show_role: boolean;
  show_name: boolean;
  show_job_title: boolean;
};

export type SignatureLayoutStep = {
  step_order: number;
  role_name: string;
  label: string;
  user_name?: string;
  job_title?: string;
};

export type SignaturePosition = {
  step_order: number;
  sheet: number;
  role_name: string;
  label: string;
  job_title?: string;
  header_range: string;
  ttd_range: string;
  name_range: string;
  job_range: string;
  ttd: string;
  nama: string;
  jabatan: string;
};

type BuildSignatureLayoutOptions = {
  requestPlaceDate?: string;
};

const formatRoleLabel = (roleName: string) => {
  const normalized = String(roleName || "").toLowerCase().trim();
  if (normalized === "membuat") return "Membuat";
  if (normalized === "memeriksa") return "Memeriksa";
  if (normalized === "menyetujui") return "Menyetujui";
  return roleName;
};

type ParsedRange = {
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
};

const columnToNumber = (column: string) => {
  let value = 0;
  for (const character of column.toUpperCase()) {
    value = value * 26 + character.charCodeAt(0) - 64;
  }
  return value;
};

const numberToColumn = (value: number) => {
  let result = "";
  let current = value;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
};

const parseCell = (cell: string) => {
  const match = String(cell).trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) throw new Error(`Cell tidak valid: ${cell}`);
  return { col: columnToNumber(match[1]), row: Number(match[2]) };
};

export const parseSignatureRegion = (region: string): ParsedRange => {
  const [startRaw, endRaw] = String(region).trim().toUpperCase().split(":");
  if (!startRaw || !endRaw) throw new Error("Signature region harus berbentuk B33:N45.");
  const start = parseCell(startRaw);
  const end = parseCell(endRaw);
  return {
    startCol: Math.min(start.col, end.col),
    startRow: Math.min(start.row, end.row),
    endCol: Math.max(start.col, end.col),
    endRow: Math.max(start.row, end.row),
  };
};

const formatRange = (startCol: number, startRow: number, endCol: number, endRow: number) =>
  `${numberToColumn(startCol)}${startRow}:${numberToColumn(endCol)}${endRow}`;

const topLeftCell = (range: string) => range.split(":")[0];

const rangesOverlap = (left: ParsedRange, right: ParsedRange) =>
  left.startCol <= right.endCol &&
  left.endCol >= right.startCol &&
  left.startRow <= right.endRow &&
  left.endRow >= right.startRow;

const getWorksheetMerges = (worksheet: ExcelJS.Worksheet): string[] => {
  const modelMerges = (worksheet.model as { merges?: string[] }).merges;
  return Array.isArray(modelMerges) ? [...modelMerges] : [];
};

const cloneStyle = (style: Partial<ExcelJS.Style>): Partial<ExcelJS.Style> => ({
  font: style.font ? { ...style.font } : undefined,
  fill: style.fill ? { ...style.fill } : undefined,
  border: style.border ? { ...style.border } : undefined,
  alignment: style.alignment ? { ...style.alignment } : undefined,
  numFmt: style.numFmt,
  protection: style.protection ? { ...style.protection } : undefined,
});

const applyBoxStyle = (
  worksheet: ExcelJS.Worksheet,
  range: ParsedRange,
  baseStyle: Partial<ExcelJS.Style>
) => {
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      const cell = worksheet.getCell(row, col);
      cell.style = cloneStyle(baseStyle);
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true,
      };
    }
  }
};

const applyMergedRangeStyle = (
  worksheet: ExcelJS.Worksheet,
  range: ParsedRange,
  baseStyle: Partial<ExcelJS.Style>,
  options: { bold?: boolean } = {}
) => {
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      const cell = worksheet.getCell(row, col);
      cell.style = cloneStyle(baseStyle);
      cell.border = {
        top: row === range.startRow ? { style: "thin", color: { argb: "FF000000" } } : undefined,
        bottom: row === range.endRow ? { style: "thin", color: { argb: "FF000000" } } : undefined,
        left: col === range.startCol ? { style: "thin", color: { argb: "FF000000" } } : undefined,
        right: col === range.endCol ? { style: "thin", color: { argb: "FF000000" } } : undefined,
      };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      if (options.bold) cell.font = { ...(cell.font || {}), bold: true };
    }
  }
};

const normalizeRoleKey = (value: string) => String(value || "").toLowerCase().trim();

const buildPgdSignatureLayout = (
  worksheet: ExcelJS.Worksheet,
  config: SignatureLayoutConfig,
  steps: SignatureLayoutStep[],
  region: ParsedRange,
  baseStyle: Partial<ExcelJS.Style>,
  options: BuildSignatureLayoutOptions
): SignaturePosition[] => {
  if (steps.length < 3 || steps.length > 6) {
    throw new Error("Preset PGD hanya mendukung 3 sampai 6 tahap tanda tangan.");
  }
  if (region.endCol - region.startCol + 1 !== 11) {
    throw new Error("Preset PGD membutuhkan region selebar 11 kolom, contoh D33:N45.");
  }

  const roleCounts = steps.reduce<Record<string, number>>((counts, step) => {
    const key = normalizeRoleKey(step.role_name);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const expectedRoles = ["membuat", "memeriksa", "menyetujui"];
  if (Object.keys(roleCounts).some(role => !expectedRoles.includes(role))) {
    throw new Error("Preset PGD hanya menerima role Membuat, Memeriksa, dan Menyetujui.");
  }
  const roleSequence = steps.map(step => normalizeRoleKey(step.role_name));
  const expectedSequence = expectedRoles.flatMap(role => Array(roleCounts[role] || 0).fill(role));
  if (roleSequence.join("|") !== expectedSequence.join("|") || expectedRoles.some(role => !roleCounts[role])) {
    throw new Error("Urutan preset PGD harus Membuat, lalu Memeriksa, lalu Menyetujui.");
  }

  const validDistribution =
    (steps.length === 3 && expectedRoles.every(role => roleCounts[role] === 1)) ||
    (steps.length === 4 && expectedRoles.filter(role => roleCounts[role] === 2).length === 1 && expectedRoles.every(role => roleCounts[role] >= 1)) ||
    (steps.length === 5 && expectedRoles.filter(role => roleCounts[role] === 1).length === 1 && expectedRoles.every(role => roleCounts[role] >= 1 && roleCounts[role] <= 2)) ||
    (steps.length === 6 && expectedRoles.every(role => roleCounts[role] === 2));
  if (!validDistribution) {
    throw new Error(`Distribusi ${steps.length} tahap tidak cocok dengan template PGD.`);
  }

  const requiredRows = steps.length === 6 ? 13 : 7;
  if (region.endRow - region.startRow + 1 < requiredRows) {
    throw new Error(`Preset PGD ${steps.length} tahap membutuhkan region minimal ${requiredRows} baris.`);
  }

  const offsetRange = (startOffset: number, startRowOffset: number, endOffset: number, endRowOffset: number) => ({
    startCol: region.startCol + startOffset,
    startRow: region.startRow + startRowOffset,
    endCol: region.startCol + endOffset,
    endRow: region.startRow + endRowOffset,
  });
  const rowOneSlots = steps.length === 3
    ? [[4, 6], [7, 9], [10, 10]]
    : steps.length === 4 || steps.length === 6
      ? [[3, 3], [4, 6], [7, 9], [10, 10]]
      : [[1, 2], [3, 3], [4, 6], [7, 9], [10, 10]];
  const slotRows = steps.length === 6
    ? [
        ...rowOneSlots.map(([start, end]) => ({ start, end, header: 1, ttdStart: 2, ttdEnd: 4, name: 5, job: 6 })),
        { start: 4, end: 6, header: 7, ttdStart: 8, ttdEnd: 10, name: 11, job: 12 },
        { start: 7, end: 9, header: 7, ttdStart: 8, ttdEnd: 10, name: 11, job: 12 },
      ]
    : rowOneSlots.map(([start, end]) => ({ start, end, header: 1, ttdStart: 2, ttdEnd: 4, name: 5, job: 6 }));

  const dateStart = rowOneSlots[0][0];
  const dateEnd = rowOneSlots[rowOneSlots.length - 1][1];
  const dateRange = offsetRange(dateStart, 0, dateEnd, 0);
  worksheet.mergeCells(formatRange(dateRange.startCol, dateRange.startRow, dateRange.endCol, dateRange.endRow));
  applyMergedRangeStyle(worksheet, dateRange, baseStyle);
  const dateCell = worksheet.getCell(dateRange.startRow, dateRange.startCol);
  dateCell.value = String(options.requestPlaceDate || "").trim() || null;
  dateCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

  const positions: SignaturePosition[] = [];
  const headerGroups = new Map<string, { role: string; startCol: number; endCol: number; row: number; steps: number[] }>();
  steps.forEach((step, index) => {
    const slot = slotRows[index];
    const ttdRange = offsetRange(slot.start, slot.ttdStart, slot.end, slot.ttdEnd);
    const nameRange = offsetRange(slot.start, slot.name, slot.end, slot.name);
    const jobRange = offsetRange(slot.start, slot.job, slot.end, slot.job);
    [ttdRange, nameRange, jobRange].forEach(item => {
      worksheet.mergeCells(formatRange(item.startCol, item.startRow, item.endCol, item.endRow));
      applyMergedRangeStyle(worksheet, item, baseStyle);
    });

    const nameCell = worksheet.getCell(nameRange.startRow, nameRange.startCol);
    nameCell.value = config.show_name ? String(step.user_name || "").toUpperCase() : null;
    const jobCell = worksheet.getCell(jobRange.startRow, jobRange.startCol);
    jobCell.value = config.show_job_title ? String(step.job_title || step.label || "") : null;

    const role = normalizeRoleKey(step.role_name);
    const groupKey = `${slot.header}:${role}`;
    const existing = headerGroups.get(groupKey);
    if (existing) {
      existing.endCol = ttdRange.endCol;
      existing.steps.push(step.step_order);
    } else {
      headerGroups.set(groupKey, {
        role,
        startCol: ttdRange.startCol,
        endCol: ttdRange.endCol,
        row: region.startRow + slot.header,
        steps: [step.step_order],
      });
    }

    positions.push({
      step_order: step.step_order,
      sheet: config.sheet,
      role_name: step.role_name,
      label: step.label,
      job_title: step.job_title || step.label,
      header_range: "",
      ttd_range: formatRange(ttdRange.startCol, ttdRange.startRow, ttdRange.endCol, ttdRange.endRow),
      name_range: formatRange(nameRange.startCol, nameRange.startRow, nameRange.endCol, nameRange.endRow),
      job_range: formatRange(jobRange.startCol, jobRange.startRow, jobRange.endCol, jobRange.endRow),
      ttd: numberToColumn(ttdRange.startCol) + ttdRange.startRow,
      nama: numberToColumn(nameRange.startCol) + nameRange.startRow,
      jabatan: numberToColumn(jobRange.startCol) + jobRange.startRow,
    });
  });

  headerGroups.forEach(group => {
    const range = { startCol: group.startCol, startRow: group.row, endCol: group.endCol, endRow: group.row };
    const formatted = formatRange(range.startCol, range.startRow, range.endCol, range.endRow);
    worksheet.mergeCells(formatted);
    applyMergedRangeStyle(worksheet, range, baseStyle, { bold: true });
    const cell = worksheet.getCell(range.startRow, range.startCol);
    cell.value = config.show_role ? formatRoleLabel(group.role) : null;
    group.steps.forEach(stepOrder => {
      const position = positions.find(item => item.step_order === stepOrder);
      if (position) position.header_range = formatted;
    });
  });

  return positions;
};

export const normalizeSignatureLayoutConfig = (value: unknown): SignatureLayoutConfig => {
  const raw = typeof value === "string"
    ? (() => {
        try { return JSON.parse(value || "{}"); } catch { return {}; }
      })()
    : (value && typeof value === "object" ? value : {});
  const config = raw as Partial<SignatureLayoutConfig>;
  return {
    enabled: config.enabled === true,
    preset: config.preset === "pgd" ? "pgd" : "adaptive",
    sheet: Math.max(1, Number(config.sheet || 1)),
    region: String(config.region || "").trim().toUpperCase(),
    max_per_row: Math.min(4, Math.max(2, Number(config.max_per_row || 4))),
    show_role: config.show_role !== false,
    show_name: config.show_name !== false,
    show_job_title: config.show_job_title !== false,
  };
};

export const buildDynamicSignatureLayout = (
  workbook: ExcelJS.Workbook,
  configInput: SignatureLayoutConfig,
  stepsInput: SignatureLayoutStep[],
  options: BuildSignatureLayoutOptions = {}
): SignaturePosition[] => {
  const config = normalizeSignatureLayoutConfig(configInput);
  const steps = [...stepsInput].sort((a, b) => a.step_order - b.step_order);
  if (!config.enabled) return [];
  if (steps.length < 2 || steps.length > 8) {
    throw new Error("Layout tanda tangan dinamis membutuhkan 2 sampai 8 tahap.");
  }

  const worksheet = workbook.worksheets[Math.max(config.sheet - 1, 0)];
  if (!worksheet) throw new Error(`Sheet ${config.sheet} tidak ditemukan.`);
  const region = parseSignatureRegion(config.region);
  const dateRow = region.startRow;
  const layoutStartRow = region.startRow + 1;
  const totalRows = region.endRow - layoutStartRow + 1;
  const totalColumns = region.endCol - region.startCol + 1;
  const rowGroups = Math.ceil(steps.length / config.max_per_row);
  const rowsPerGroup = Math.floor(totalRows / rowGroups);
  if (rowsPerGroup < 5) {
    throw new Error("Signature region terlalu pendek. Setiap baris kotak membutuhkan minimal 5 row Excel.");
  }

  const baseCell = worksheet.getCell(region.startRow, region.startCol);
  const baseStyle = cloneStyle(baseCell.style);
  getWorksheetMerges(worksheet).forEach(mergeRange => {
    if (rangesOverlap(parseSignatureRegion(mergeRange), region)) {
      worksheet.unMergeCells(mergeRange);
    }
  });

  for (let row = region.startRow; row <= region.endRow; row += 1) {
    for (let col = region.startCol; col <= region.endCol; col += 1) {
      const cell = worksheet.getCell(row, col);
      cell.value = null;
      cell.style = cloneStyle(baseStyle);
    }
  }

  if (config.preset === "pgd") {
    const positions = buildPgdSignatureLayout(worksheet, config, steps, region, baseStyle, options);
    worksheet.pageSetup.printArea = formatRange(
      1,
      1,
      Math.max(worksheet.columnCount, region.endCol),
      Math.max(worksheet.rowCount, region.endRow)
    );
    return positions;
  }

  const requestPlaceDate = String(options.requestPlaceDate || "").trim();
  if (requestPlaceDate) {
    const dateRange = formatRange(region.startCol, dateRow, region.endCol, dateRow);
    worksheet.mergeCells(dateRange);
    const dateCell = worksheet.getCell(topLeftCell(dateRange));
    dateCell.value = requestPlaceDate;
    dateCell.font = { ...(dateCell.font || {}), bold: false };
    dateCell.alignment = {
      ...(dateCell.alignment || {}),
      horizontal: "right",
      vertical: "middle",
      wrapText: false,
    };
  }

  const slotCount = steps.length <= config.max_per_row ? steps.length : config.max_per_row;
  const slotRanges = Array.from({ length: slotCount }, (_item, index) => {
    const startCol = region.startCol + Math.floor((index * totalColumns) / slotCount);
    const endCol = index === slotCount - 1
      ? region.endCol
      : region.startCol + Math.floor(((index + 1) * totalColumns) / slotCount) - 1;
    return { startCol, endCol };
  });

  const positions: SignaturePosition[] = [];
  for (let groupIndex = 0; groupIndex < rowGroups; groupIndex += 1) {
    const groupSteps = steps.slice(
      groupIndex * config.max_per_row,
      (groupIndex + 1) * config.max_per_row
    );
    const groupStartRow = layoutStartRow + groupIndex * rowsPerGroup;
    const groupEndRow = groupIndex === rowGroups - 1
      ? region.endRow
      : groupStartRow + rowsPerGroup - 1;
    const firstSlotIndex = Math.floor((slotRanges.length - groupSteps.length) / 2);
    const headerGroups: Array<{ key: string; label: string; startCol: number; endCol: number; range: string }> = [];

    groupSteps.forEach((step, itemIndex) => {
      const slot = slotRanges[firstSlotIndex + itemIndex] || slotRanges[itemIndex] || slotRanges[0];
      const startCol = slot.startCol;
      const endCol = slot.endCol;
      const headerRow = groupStartRow;
      const nameRow = groupEndRow - 1;
      const jobRow = groupEndRow;
      const ttdStartRow = headerRow + 1;
      const ttdEndRow = Math.max(ttdStartRow, nameRow - 1);

      const headerRange = formatRange(startCol, headerRow, endCol, headerRow);
      const ttdRange = formatRange(startCol, ttdStartRow, endCol, ttdEndRow);
      const nameRange = formatRange(startCol, nameRow, endCol, nameRow);
      const jobRange = formatRange(startCol, jobRow, endCol, jobRow);
      [ttdRange, nameRange, jobRange].forEach(range => worksheet.mergeCells(range));
      applyBoxStyle(worksheet, { startCol, startRow: headerRow, endCol, endRow: groupEndRow }, baseStyle);

      const roleKey = String(step.role_name || step.label || "").toLowerCase().trim();
      const roleLabel = formatRoleLabel(step.role_name || step.label || "");
      const previousHeader = headerGroups[headerGroups.length - 1];
      if (previousHeader && previousHeader.key === roleKey) {
        previousHeader.endCol = endCol;
        previousHeader.range = formatRange(previousHeader.startCol, headerRow, previousHeader.endCol, headerRow);
      } else {
        headerGroups.push({ key: roleKey, label: roleLabel, startCol, endCol, range: headerRange });
      }

      const nameCell = worksheet.getCell(topLeftCell(nameRange));
      nameCell.value = config.show_name ? String(step.user_name || "").toUpperCase() : null;
      const jobCell = worksheet.getCell(topLeftCell(jobRange));
      jobCell.value = config.show_job_title ? String(step.job_title || step.label || "") : null;

      positions.push({
        step_order: step.step_order,
        sheet: config.sheet,
        role_name: step.role_name,
        label: step.label,
        job_title: step.job_title || step.label,
        header_range: "",
        ttd_range: ttdRange,
        name_range: nameRange,
        job_range: jobRange,
        ttd: topLeftCell(ttdRange),
        nama: topLeftCell(nameRange),
        jabatan: topLeftCell(jobRange),
      });
    });

    headerGroups.forEach(group => {
      worksheet.mergeCells(group.range);
      const headerCell = worksheet.getCell(topLeftCell(group.range));
      headerCell.value = config.show_role ? group.label : null;
      headerCell.font = { ...(headerCell.font || {}), bold: true };
      headerCell.alignment = {
        ...(headerCell.alignment || {}),
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      positions
        .filter(position => position.step_order >= groupSteps[0].step_order)
        .filter(position => {
          const cell = parseCell(position.ttd);
          return cell.col >= group.startCol && cell.col <= group.endCol && cell.row >= groupStartRow && cell.row <= groupEndRow;
        })
        .forEach(position => { position.header_range = group.range; });
    });
  }

  worksheet.pageSetup.printArea = formatRange(
    1,
    1,
    Math.max(worksheet.columnCount, region.endCol),
    Math.max(worksheet.rowCount, region.endRow)
  );
  return positions;
};
