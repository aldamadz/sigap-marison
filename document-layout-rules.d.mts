export interface SignatureLayoutPlan {
  groupSizes: number[];
  slotCount: number;
  groupSlotIndexes: number[][];
  rowCapacity: number;
}

export interface PgdSignatureSlotPlan {
  groupSizes: number[];
  dateRange: [number, number];
  groupSlotRanges: Array<Array<[number, number]>>;
  rowCapacity: number;
  geometry: "pgd_reference_v2";
}

export function buildSignatureLayoutPlan(total: number, maxPerRow?: number): SignatureLayoutPlan;
export function buildPgdSignatureSlotPlan(total: number): PgdSignatureSlotPlan;
export function clearGoodsServicesLegacySignatureArea(worksheet: unknown): void;
export function resolveTableHorizontalAlignment(
  key: string,
  type: string,
): "left" | "center";
export function applyGoodsServicesTableAlignment(
  worksheet: import("exceljs").Worksheet,
  startRow?: number,
  endRow?: number,
): boolean;
export function normalizeGoodsServicesWorksheet(
  worksheet: import("exceljs").Worksheet,
  options?: { noteRange?: string },
): boolean;
