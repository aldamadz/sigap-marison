export const PGD_ITEM_STATUSES = ["1", "2", "3", "4"] as const;

export function isPgdItemStatus(value: unknown): boolean {
  return PGD_ITEM_STATUSES.some((status) => status === value);
}

export function getPgdUnitStatus(input: Record<string, unknown>): string {
  if (isPgdItemStatus(input.unit_item_status)) return String(input.unit_item_status);
  const items = input.items;
  const first = Array.isArray(items) ? items[0] : null;
  const previousStatus = first && typeof first === "object" && !Array.isArray(first)
    ? (first as Record<string, unknown>).status
    : null;
  return isPgdItemStatus(previousStatus) ? String(previousStatus) : "";
}
