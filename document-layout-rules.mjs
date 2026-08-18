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
