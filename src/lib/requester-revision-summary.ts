import { formatSummaryValue, humanizeInputKey } from "../components/surat/request-summary";
import { formatRupiah, parseCurrencyInput } from "./rupiah";

export interface RequesterRevisionAttachment {
  file_url?: unknown;
  file_name?: unknown;
  name?: unknown;
  requirement_key?: unknown;
}

export interface RequesterRevisionSnapshot {
  formData: Readonly<Record<string, unknown>>;
  attachments?: readonly RequesterRevisionAttachment[];
}

export interface RequesterRevisionFieldChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface RequesterRevisionItemChange {
  action: "added" | "changed" | "deleted";
  beforeIndex?: number;
  afterIndex?: number;
  name: string;
  fields: RequesterRevisionFieldChange[];
  omittedFields: number;
}

export interface RequesterRevisionAttachmentChange {
  action: "added" | "removed";
  name: string;
  requirementKey: string;
}

export interface RequesterRevisionSummary {
  hasChanges: boolean;
  fields: RequesterRevisionFieldChange[];
  items: RequesterRevisionItemChange[];
  attachments: RequesterRevisionAttachmentChange[];
  counts: {
    fields: number;
    itemsAdded: number;
    itemsChanged: number;
    itemsDeleted: number;
    attachmentsAdded: number;
    attachmentsRemoved: number;
  };
  omitted: { fields: number; items: number; attachments: number };
}

export const REQUESTER_REVISION_SUMMARY_LIMITS = {
  entriesPerGroup: 30,
  fieldsPerItem: 12,
  textLength: 180,
} as const;

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
const text = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";
const compact = (value: string): string => value.length > REQUESTER_REVISION_SUMMARY_LIMITS.textLength
  ? `${value.slice(0, REQUESTER_REVISION_SUMMARY_LIMITS.textLength - 3)}...` : value;
const moneyField = /(^|_)(nominal|harga|biaya|amount|price|subtotal|total)(_|$)/;
const labels: Record<string, string> = {
  judul_surat: "Judul surat", request_place: "Tempat surat", request_date: "Tanggal surat",
  name: "Nama", description: "Deskripsi", estimasi_harga_satuan: "Estimasi harga satuan",
};
const label = (key: string) => compact(labels[key] || humanizeInputKey(key));

// Canonical JSON is only an in-memory matching aid, never a persisted item identity.
// Reject unsupported/deep values conservatively instead of hiding changes or recursing forever.
function canonical(value: unknown, depth = 0): string | undefined {
  if (value == null || value === "") return '""';
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (depth >= 12 || typeof value !== "object") return undefined;
  const keys = Array.isArray(value) ? value.map((_, index) => String(index)) : Object.keys(value).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const entry = Array.isArray(value) ? value[Number(key)] : record(value)[key];
    if (!Array.isArray(value) && (entry == null || entry === "")) continue;
    const part = canonical(entry, depth + 1);
    if (part === undefined) return undefined;
    parts.push(`${JSON.stringify(key)}:${part}`);
  }
  return `${Array.isArray(value) ? "[" : "{"}${parts.join(",")}${Array.isArray(value) ? "]" : "}"}`;
}

function equal(before: unknown, after: unknown): boolean {
  if (Object.is(before, after)) return true;
  const previous = canonical(before);
  return previous !== undefined && previous === canonical(after);
}

function display(value: unknown, key: string, depth = 0): string {
  if (value == null || value === "") return "-";
  if (moneyField.test(key) && (typeof value === "string" || typeof value === "number")
    && parseCurrencyInput(value) !== null) return formatRupiah(value);
  if (typeof value !== "object") return compact(formatSummaryValue(value));
  if (depth >= 3) return "[Detail]";
  if (Array.isArray(value)) {
    const entries = value.slice(0, 3).map(entry => display(entry, key, depth + 1));
    return compact(`${entries.join(", ")}${value.length > 3 ? ` (+${value.length - 3})` : ""}`) || "-";
  }
  const entries = Object.entries(record(value));
  return compact(entries.slice(0, 3).map(([child, entry]) =>
    `${label(child)}: ${display(entry, child, depth + 1)}`).join("; ")
    + (entries.length > 3 ? ` (+${entries.length - 3})` : "")) || "-";
}

function changedFields(before: Record<string, unknown>, after: Record<string, unknown>, excluded: string[] = []) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => !excluded.includes(key) && !equal(before[key], after[key]))
    .map(key => ({ field: compact(key), label: label(key), before: display(before[key], key), after: display(after[key], key) }));
}

function itemName(value: unknown, index: number): string {
  const row = record(value);
  for (const key of ["nama_barang", "keterangan", "name", "description", "item_name"]) {
    const name = text(row[key]).trim();
    if (name) return compact(name);
  }
  return `Item ${index + 1}`;
}

function itemId(value: unknown): string | undefined {
  const id = record(value).id;
  return (typeof id === "string" && id.trim()) || (typeof id === "number" && Number.isFinite(id))
    ? `${typeof id}:${id}` : undefined;
}

function itemChanges(before: unknown[], after: unknown[]): RequesterRevisionItemChange[] {
  const pairs = new Map<number, number>();
  const used = new Set<number>();
  const ids = new Map<string, number[]>();
  const unchanged = new Map<string, number[]>();
  before.forEach((row, index) => {
    const id = itemId(row);
    const key = id ?? canonical(row);
    if (key === undefined) return;
    const map = id === undefined ? unchanged : ids;
    map.set(key, [...(map.get(key) || []), index]);
  });
  after.forEach((row, index) => {
    const id = itemId(row);
    const key = id ?? canonical(row);
    const match = key === undefined ? undefined : (id === undefined ? unchanged : ids).get(key)?.shift();
    if (match !== undefined) { pairs.set(index, match); used.add(match); }
  });
  // Exact matches anchor insertions/deletions. Remaining ID-less rows pair in order,
  // so editing a label at the same position does not become a delete/add pair.
  const remaining = before.map((_, index) => index).filter(index => !used.has(index) && itemId(before[index]) === undefined);
  let cursor = 0;
  after.forEach((row, index) => {
    if (pairs.has(index) || itemId(row) !== undefined || cursor >= remaining.length) return;
    const match = remaining[cursor++];
    pairs.set(index, match);
    used.add(match);
  });
  const changes: RequesterRevisionItemChange[] = [];
  after.forEach((row, afterIndex) => {
    const beforeIndex = pairs.get(afterIndex);
    if (beforeIndex !== undefined && equal(before[beforeIndex], row)) return;
    const fields = beforeIndex === undefined ? [] : changedFields(record(before[beforeIndex]), record(row));
    changes.push({
      action: beforeIndex === undefined ? "added" : "changed", beforeIndex, afterIndex,
      name: itemName(row, afterIndex), fields: fields.slice(0, REQUESTER_REVISION_SUMMARY_LIMITS.fieldsPerItem),
      omittedFields: Math.max(0, fields.length - REQUESTER_REVISION_SUMMARY_LIMITS.fieldsPerItem),
    });
  });
  before.forEach((row, beforeIndex) => {
    if (!used.has(beforeIndex)) changes.push({ action: "deleted", beforeIndex, name: itemName(row, beforeIndex), fields: [], omittedFields: 0 });
  });
  return changes;
}

function attachmentChanges(before: readonly RequesterRevisionAttachment[], after: readonly RequesterRevisionAttachment[]) {
  const key = (file: RequesterRevisionAttachment) => JSON.stringify([
    text(file.requirement_key), text(file.file_url) || text(file.file_name) || text(file.name),
  ]);
  const remaining = new Map<string, number[]>();
  before.forEach((file, index) => remaining.set(key(file), [...(remaining.get(key(file)) || []), index]));
  const kept = new Set<number>();
  const changes: RequesterRevisionAttachmentChange[] = [];
  const change = (file: RequesterRevisionAttachment, index: number, action: RequesterRevisionAttachmentChange["action"]) => ({
    action, name: compact(text(file.file_name) || text(file.name) || `Lampiran ${index + 1}`),
    requirementKey: compact(text(file.requirement_key)),
  });
  after.forEach((file, index) => {
    const match = remaining.get(key(file))?.shift();
    if (match === undefined) changes.push(change(file, index, "added"));
    else kept.add(match);
  });
  before.forEach((file, index) => { if (!kept.has(index)) changes.push(change(file, index, "removed")); });
  return changes;
}

/** Display-only diff of full requester snapshots; not an authorization or audit payload. */
export function summarizeRequesterRevision(
  baseline: RequesterRevisionSnapshot,
  current: RequesterRevisionSnapshot,
): RequesterRevisionSummary {
  const beforeInput = record(baseline.formData.form_input_data);
  const afterInput = record(current.formData.form_input_data);
  const fields = [
    ...changedFields(baseline.formData, current.formData, ["form_input_data"]),
    ...changedFields(beforeInput, afterInput, ["items"]).map(field => ({ ...field, field: compact(`form_input_data.${field.field}`) })),
  ];
  const items = itemChanges(Array.isArray(beforeInput.items) ? beforeInput.items : [], Array.isArray(afterInput.items) ? afterInput.items : []);
  const attachments = attachmentChanges(baseline.attachments || [], current.attachments || []);
  const limit = REQUESTER_REVISION_SUMMARY_LIMITS.entriesPerGroup;
  return {
    hasChanges: fields.length + items.length + attachments.length > 0,
    fields: fields.slice(0, limit), items: items.slice(0, limit), attachments: attachments.slice(0, limit),
    counts: {
      fields: fields.length,
      itemsAdded: items.filter(item => item.action === "added").length,
      itemsChanged: items.filter(item => item.action === "changed").length,
      itemsDeleted: items.filter(item => item.action === "deleted").length,
      attachmentsAdded: attachments.filter(file => file.action === "added").length,
      attachmentsRemoved: attachments.filter(file => file.action === "removed").length,
    },
    omitted: {
      fields: Math.max(0, fields.length - limit), items: Math.max(0, items.length - limit),
      attachments: Math.max(0, attachments.length - limit),
    },
  };
}
