export const CHECKER_INPUT_TYPES = ["text", "textarea", "money", "number"] as const;

export type CheckerInputType = (typeof CHECKER_INPUT_TYPES)[number];

export type CheckerInputField = {
  key: string;
  label: string;
  type: CheckerInputType;
  required: boolean;
  placeholder?: string;
  helperText?: string;
  min?: number;
};

export type CheckerInputSchema = {
  review_mode?: "fund_item_checklist";
  title?: string;
  description?: string;
  fields: CheckerInputField[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isCheckerInputType = (value: unknown): value is CheckerInputType =>
  typeof value === "string" && CHECKER_INPUT_TYPES.includes(value as CheckerInputType);

export const normalizeCheckerInputSchema = (value: unknown): CheckerInputSchema => {
  if (!isRecord(value) || !Array.isArray(value.fields)) return { fields: [] };

  const seen = new Set<string>();
  const fields = value.fields.flatMap((raw): CheckerInputField[] => {
    if (!isRecord(raw)) return [];
    const key = String(raw.key || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    const label = String(raw.label || "").trim();
    const type = isCheckerInputType(raw.type) ? raw.type : "text";
    if (!key || !label || seen.has(key)) return [];
    seen.add(key);

    const min = typeof raw.min === "number" && Number.isFinite(raw.min) ? raw.min : undefined;
    return [{
      key,
      label,
      type,
      required: raw.required === true,
      ...(String(raw.placeholder || "").trim() ? { placeholder: String(raw.placeholder).trim() } : {}),
      ...(String(raw.helperText || raw.helper_text || "").trim()
        ? { helperText: String(raw.helperText || raw.helper_text).trim() }
        : {}),
      ...(min !== undefined ? { min } : {}),
    }];
  });

  return {
    ...(value.review_mode === "fund_item_checklist" ? { review_mode: "fund_item_checklist" as const } : {}),
    ...(String(value.title || "").trim() ? { title: String(value.title).trim() } : {}),
    ...(String(value.description || "").trim() ? { description: String(value.description).trim() } : {}),
    fields,
  };
};

export const FUND_ITEM_CHECKLIST_SCHEMA: CheckerInputSchema = {
  review_mode: "fund_item_checklist",
  title: "Pemeriksaan item dana",
  description: "Periksa setiap item sebelum diteruskan ke manager.",
  fields: [{ key: "item_checks", label: "Checklist item dana", type: "text", required: true }],
};

export type FundItemCheck = { item_index: number; item: unknown; checked: boolean; note: string };
export const matchesFundItemSnapshot = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => matchesFundItemSnapshot(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key =>
    Object.prototype.hasOwnProperty.call(right, key) && matchesFundItemSnapshot(left[key], right[key]));
};
export const readFundItemChecks = (value: unknown): FundItemCheck[] => {
  try {
    const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.filter((row): row is FundItemCheck =>
      isRecord(row) && Number.isSafeInteger(row.item_index) && typeof row.checked === "boolean" && typeof row.note === "string") : [];
  } catch { return []; }
};
export const isFundItemChecklistComplete = (items: unknown[], value: unknown) => {
  const checks = readFundItemChecks(value);
  return items.length > 0 && checks.length === items.length && items.every((item, index) =>
    checks[index]?.item_index === index && checks[index]?.checked === true && checks[index].note.length <= 2000 && matchesFundItemSnapshot(checks[index].item, item));
};

const numericValue = (value: unknown, type: "money" | "number") => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value ?? "").trim();
  const normalized = type === "money"
    ? raw.replace(/^Rp\s*/i, "").replace(/\s/g, "")
    : raw;
  const valid = type === "money"
    ? /^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(normalized)
    : /^-?\d+(?:\.\d+)?$/.test(normalized);
  if (!valid) return null;
  const parsed = Number(type === "money"
    ? normalized.replace(/\./g, "").replace(",", ".")
    : normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const validateCheckerInput = (
  schemaValue: unknown,
  input: Record<string, unknown>,
): string[] => {
  const schema = normalizeCheckerInputSchema(schemaValue);
  const issues: string[] = [];

  schema.fields.forEach((field) => {
    const value = input[field.key];
    const empty = value === null || value === undefined || String(value).trim() === "";
    if (field.required && empty) {
      issues.push(`${field.label} wajib diisi.`);
      return;
    }
    if (empty) return;
    if (field.type === "money" || field.type === "number") {
      const parsed = numericValue(value, field.type);
      if (parsed === null) {
        issues.push(`${field.label} harus berupa angka.`);
      } else if (field.min !== undefined && parsed < field.min) {
        issues.push(`${field.label} minimal ${field.min}.`);
      }
    }
  });

  return issues;
};

export const canonicalizeCheckerInput = (
  schemaValue: unknown,
  input: Record<string, unknown>,
): Record<string, string | number> => {
  const schema = normalizeCheckerInputSchema(schemaValue);
  const entries: Array<[string, string | number]> = [];
  schema.fields.forEach((field) => {
    const value = input[field.key];
    if (value === null || value === undefined || String(value).trim() === "") return;
    if (field.type === "money" || field.type === "number") {
      const parsed = numericValue(value, field.type);
      if (parsed !== null) entries.push([field.key, parsed]);
      return;
    }
    entries.push([field.key, String(value).trim()]);
  });
  return Object.fromEntries(entries);
};
