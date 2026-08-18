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
