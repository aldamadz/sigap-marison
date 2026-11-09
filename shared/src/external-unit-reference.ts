const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";

export const getExternalUnitReference = (value: unknown) => {
  const unit = record(value);
  const raw = Object.hasOwn(unit, "raw") ? record(unit.raw) : unit;
  const code = text(raw.production_code);
  const match = /^(\d+)\/UAI\/PRC\/([^/]+)\/(\d{2})\/(\d{2})\/(\d{4})$/u.exec(code);
  return {
    type: text(raw.type) || text(raw.unit_type) || text(raw.tipe) || text(raw.house_type),
    design: text(raw.design) || text(raw.desain) || (match?.[2] ?? ""),
    serial: match?.[1] ?? "",
    date: match ? `${match[5]}-${match[4]}-${match[3]}` : "",
    productionCode: code,
  };
};

export const applyExternalUnitReference = (unit: unknown, detail: Record<string, unknown>): Record<string, unknown> => {
  const reference = getExternalUnitReference(unit);
  return {
    ...detail,
    // A persisted/explicit value (even an empty edit) wins over external defaults.
    unit_type: Object.hasOwn(detail, 'unit_type') ? text(detail.unit_type) : reference.type,
    production_block: Object.hasOwn(detail, 'production_block') ? text(detail.production_block) : reference.design,
    production_serial: Object.hasOwn(detail, 'production_serial') ? text(detail.production_serial) : reference.serial,
    production_date: Object.hasOwn(detail, 'production_date') ? text(detail.production_date) : reference.date,
  };
};
