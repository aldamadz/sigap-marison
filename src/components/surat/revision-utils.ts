import { formatSummaryValue } from "@/components/surat/request-summary";
import { parseRupiahInteger, formatRupiah as formatRupiahCanonical } from "@/lib/rupiah";

export type RevisionItemChange = {
  index: number;
  action?: "keep" | "reject" | "adjust";
  nama_barang?: string;
  value_type?: "unit_count" | "quantity" | "money" | "recommendation" | "text" | string;
  nilai_diajukan?: string | number | null;
  nilai_disetujui?: string | number | null;
  jumlah_diajukan?: string | number | null;
  jumlah_disetujui?: string | number | null;
  unit_diajukan?: string | number | null;
  unit_disetujui?: string | number | null;
  nominal_diajukan?: string | number | null;
  nominal_disetujui?: string | number | null;
  alasan?: string;
  note?: string;
};

export type ActiveRevision = {
  event_id?: string;
  target_type?: string;
  target_user_ids?: string[];
  from_step?: number;
  target_step?: number | null;
  reason?: string;
  changes?: Record<string, unknown>;
  awaiting_requester_acceptance?: boolean;
  requires_requester_acceptance?: boolean;
  created_at?: string;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export const getActiveRevision = (surat: unknown): ActiveRevision | null => {
  const snapshot = asRecord(asRecord(surat).data_snapshot);
  const revision = asRecord(snapshot.revision);
  if (Object.keys(revision).length > 0) return revision as ActiveRevision;
  const appliedRevision = asRecord(snapshot.applied_revision);
  return Object.keys(appliedRevision).length > 0 ? appliedRevision as ActiveRevision : null;
};

export const getRevisionItemChanges = (revision?: ActiveRevision | null): RevisionItemChange[] => {
  const changes = asRecord(revision?.changes);
  const rows = Array.isArray(changes.item_revisions) ? changes.item_revisions : [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    .map((row) => ({
      index: Number(row.index),
      action: String(row.action || "keep") as RevisionItemChange["action"],
      nama_barang: String(row.nama_barang || ""),
      value_type: String(row.value_type || row.revision_value_type || ""),
      nilai_diajukan: row.nilai_diajukan as string | number | null,
      nilai_disetujui: row.nilai_disetujui as string | number | null,
      jumlah_diajukan: row.jumlah_diajukan as string | number | null,
      jumlah_disetujui: row.jumlah_disetujui as string | number | null,
      unit_diajukan: row.unit_diajukan as string | number | null,
      unit_disetujui: row.unit_disetujui as string | number | null,
      nominal_diajukan: row.nominal_diajukan as string | number | null,
      nominal_disetujui: row.nominal_disetujui as string | number | null,
      alasan: String(row.alasan || row.reason || ""),
      note: String(row.note || ""),
    }))
    .filter((row) => Number.isFinite(row.index) && row.index >= 0);
};

export const getRevisionChangeByIndex = (revision: ActiveRevision | null | undefined, index: number) =>
  getRevisionItemChanges(revision).find((change) => Number(change.index) === index) || null;

const isDisplayableItemRevision = (change: RevisionItemChange) =>
  change.action === "reject" || change.action === "adjust";

export const applyRevisionToItems = (items: unknown, revision?: ActiveRevision | null) => {
  const rows = Array.isArray(items) ? items : [];
  const changes = getRevisionItemChanges(revision);
  if (changes.length === 0) return rows;
  return rows.map((item, index) => {
    const row = asRecord(item);
    const change = changes.find((entry) => entry.index === index);
    if (!change || !isDisplayableItemRevision(change)) return item;
    return {
      ...row,
      __revision: change,
      __revision_action: change.action,
      __revision_reason: change.alasan,
      __revision_value_type: change.value_type,
      __revision_value_requested: getRevisionRequestedValue(change),
      __revision_value_approved: getRevisionApprovedValue(change),
    };
  });
};

const cleanText = (value: unknown) => String(value ?? "").trim();

const hasValue = (value: unknown) => {
  const text = cleanText(value);
  return Boolean(text && text !== "-");
};

export const getRevisionRequestedValue = (change?: Partial<RevisionItemChange> | null) => {
  if (!change) return null;
  const type = String(change.value_type || "").toLowerCase();
  if (type === "unit_count") return change.unit_diajukan ?? change.jumlah_diajukan ?? change.nilai_diajukan;
  if (type === "quantity") return change.jumlah_diajukan ?? change.nilai_diajukan;
  if (type === "money") return change.nominal_diajukan ?? change.nilai_diajukan;
  return change.nilai_diajukan ?? change.jumlah_diajukan ?? change.nominal_diajukan ?? change.unit_diajukan ?? null;
};

export const getRevisionApprovedValue = (change?: Partial<RevisionItemChange> | null) => {
  if (!change) return null;
  const type = String(change.value_type || "").toLowerCase();
  if (type === "unit_count") return change.unit_disetujui ?? change.jumlah_disetujui ?? change.nilai_disetujui;
  if (type === "quantity") return change.jumlah_disetujui ?? change.nilai_disetujui;
  if (type === "money") return change.nominal_disetujui ?? change.nilai_disetujui;
  return change.nilai_disetujui ?? change.jumlah_disetujui ?? change.nominal_disetujui ?? change.unit_disetujui ?? null;
};

export const formatRevisionMoney = (value: unknown) => {
  const amount = parseRupiahInteger(value);
  if (!amount) return formatSummaryValue(value);
  return formatRupiahCanonical(amount);
};

export const formatRevisionValue = (
  value: unknown,
  change?: Partial<RevisionItemChange> | null,
  row?: Record<string, unknown>
) => {
  if (!hasValue(value)) return "-";
  const type = String(change?.value_type || row?.__revision_value_type || "").toLowerCase();
  const text = formatSummaryValue(value).trim();
  if (type === "unit_count") {
    const digits = text.replace(/[^\d]/g, "");
    return digits ? `${Number(digits).toLocaleString("id-ID")} unit` : text;
  }
  if (type === "quantity") return text;
  if (type === "money") return formatRevisionMoney(value);
  if (type === "recommendation") return text;

  const unit = String(row?.sat || row?.satuan || row?.unit || "").trim();
  if (/^unit$/i.test(unit) && /^\d+([.,]\d+)?$/.test(text)) return `${text} unit`;
  return text;
};

export const hasMeaningfulRevisionChange = (change: RevisionItemChange) => {
  if (!change) return false;
  if (change.action === "reject" || change.action === "adjust") return true;
  return false;
};
