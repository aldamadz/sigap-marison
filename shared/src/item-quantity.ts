const SCALE = 1_000_000n;

/** Item measurements are decimal; IDs, row orders and building counts are not. */
export function parseItemQuantity(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value).trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,6})?$/.test(raw)) return null;
  const quantity = Number(raw);
  return Number.isFinite(quantity) && quantity > 0 && quantity <= Number.MAX_SAFE_INTEGER
    ? quantity : null;
}

/** Round each extended price once to whole Rupiah, without floating-point drift. */
export function itemQuantityTotal(value: unknown, unitPrice: unknown): number | null {
  const quantity = parseItemQuantity(value);
  if (quantity === null || typeof unitPrice !== "number" || !Number.isSafeInteger(unitPrice) || unitPrice < 0) return null;
  const [whole, fraction = ""] = String(quantity).split(".");
  const scaled = BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, "0"));
  const total = (scaled * BigInt(unitPrice) + SCALE / 2n) / SCALE;
  return total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null;
}
