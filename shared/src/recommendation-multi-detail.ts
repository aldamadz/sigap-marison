export type RecommendationStatus = "recommended" | "not_recommended";
export type RecommendationAction = "purchase_new" | "replace" | "service";
export type RecommendationIdFactory = () => string;

export type RecommendationAttachment = {
  id: string;
  order: number;
  caption?: string;
  source?: string;
  storage_path?: string;
  metadata?: Record<string, unknown>;
  legacy_fields?: Record<string, unknown>;
};

export type RecommendationReferenceLink = {
  id: string;
  order: number;
  url: string;
  caption?: string;
  source?: string;
  storage_path?: string;
  metadata?: Record<string, unknown>;
  legacy_fields?: Record<string, unknown>;
};

export type RecommendationDetail = {
  id: string;
  order: number;
  action: RecommendationAction;
  name: string;
  quantity: number;
  description: string;
  description_manually_edited: boolean;
  notes: string;
  location?: string;
  pic?: string;
  attachments: RecommendationAttachment[];
  reference_links: RecommendationReferenceLink[];
  legacy_fields?: Record<string, unknown>;
};

export type RecommendationParentItem = {
  id: string;
  order: number;
  status: RecommendationStatus;
  rejection_reason: string;
  applicant_original: Readonly<{
    name: string;
    quantity: number;
    notes: string;
  }>;
  location: string;
  pic: string;
  details: RecommendationDetail[];
  legacy_fields?: Record<string, unknown>;
};

export type RecommendationMultiDetail = {
  version: 1;
  items: RecommendationParentItem[];
};

type LegacyRow = Record<string, unknown>;

export const RECOMMENDATION_DESCRIPTION_DEFAULTS: Readonly<Record<RecommendationAction, string>> = Object.freeze({
  purchase_new: "Pembelian baru",
  replace: "Ganti komponen",
  service: "Servis",
});

const ACTION_ALIASES: Record<string, RecommendationAction | undefined> = {
  purchase_new: "purchase_new",
  beli_baru: "purchase_new",
  "beli baru": "purchase_new",
  replace: "replace",
  ganti: "replace",
  service: "service",
  servis: "service",
};

const LEGACY_ACTIONS: Record<RecommendationAction, string> = {
  purchase_new: "beli_baru",
  replace: "ganti",
  service: "service",
};

const knownParentKeys = new Set([
  "id", "parent_item_id", "parent_item_index", "parent_item_name", "parent_item_quantity",
  "order",
  "parent_item_notes", "original_name", "original_quantity", "original_notes", "applicant_original",
  "recommendation_status", "status", "is_recommended", "rejection_reason", "reason", "alasan",
  "keterangan", "location", "lokasi", "pic", "lokasi_pic", "details", "recommendation_details", "items",
]);

const knownDetailKeys = new Set([
  ...knownParentKeys, "detail_id", "recommendation_detail_id", "order", "no", "nama_barang", "nama",
  "name", "asset_name", "specification", "spesifikasi", "jumlah", "quantity", "catatan", "notes",
  "recommendation_action", "action", "service", "servis", "ganti", "beli_baru", "tidak_direkomendasikan",
  "uraian", "description", "description_manually_edited", "estimated_price", "harga_estimasi",
  "detail_location", "detail_pic", "recommendation_attachment", "attachment", "attachments",
  "reference_links", "reference_link", "link",
]);

function record(value: unknown): LegacyRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as LegacyRow : {};
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value === "string" && !/^\s*\d+\s*$/.test(value)) throw new Error(`${field} must be a positive integer.`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${field} must be a positive integer.`);
  return parsed;
}

function nonnegativeInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function unknownFields(row: LegacyRow, knownKeys: Set<string>): Record<string, unknown> | undefined {
  const fields = Object.fromEntries(Object.entries(row).filter(([key]) => !knownKeys.has(key)));
  return Object.keys(fields).length ? fields : undefined;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as LegacyRow).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function deterministicId(prefix: string, value: unknown): string {
  let hash = 0x811c9dc5;
  for (const character of canonicalJson(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${prefix}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function checked(row: LegacyRow, key: string): boolean {
  const value = row[key];
  if (value === true || value === 1) return true;
  return ["true", "1", "yes", "ya", "x", "v", "✓"].includes(text(value).toLowerCase());
}

function normalizeStatus(row: LegacyRow): RecommendationStatus {
  const explicit = text(row.recommendation_status ?? row.status).toLowerCase().replace(/[\s-]+/g, "_");
  const action = text(row.recommendation_action ?? row.action).toLowerCase().replace(/[\s-]+/g, "_");
  const rejectionMarker = text(row.tidak_direkomendasikan).toLowerCase();
  return row.is_recommended === false || ["not_recommended", "tidak_direkomendasikan", "rejected", "ditolak"]
    .includes(explicit || action) || (Boolean(rejectionMarker) && !["false", "0", "no", "tidak", "-"].includes(rejectionMarker))
    ? "not_recommended" : "recommended";
}

function normalizeAction(row: LegacyRow): RecommendationAction {
  const explicit = text(row.recommendation_action ?? row.action).toLowerCase();
  const checkedAction = ["service", "servis", "ganti", "beli_baru"].find((key) => checked(row, key));
  const action = ACTION_ALIASES[explicit] ?? ACTION_ALIASES[checkedAction ?? ""];
  if (!action) throw new Error("Recommended detail requires a valid action.");
  return action;
}

function legacyRejectionReason(row: LegacyRow): string {
  if (normalizeStatus(row) !== "not_recommended") return "";
  const explicit = text(row.rejection_reason ?? row.reason);
  if (explicit) return explicit;
  const marker = text(row.tidak_direkomendasikan);
  if (marker && !checked(row, "tidak_direkomendasikan")) return marker;
  return text(row.alasan ?? row.keterangan);
}

function attachmentValues(row: LegacyRow): unknown[] {
  if (Array.isArray(row.attachments)) return row.attachments;
  const singular = record(row.recommendation_attachment ?? row.attachment);
  if (Array.isArray(singular.attachments)) return singular.attachments;
  if (Object.keys(singular).length) return [singular];
  const flatPath = row.storage_path ?? row.file_url;
  return text(flatPath) ? [{ storage_path: flatPath, caption: row.file_name }] : [];
}

function orderedAttachments(row: LegacyRow, detailId: string): RecommendationAttachment[] {
  return attachmentValues(row).map((value, index) => {
    const item = record(value);
    const { id, order, caption, source, storage_path, file_url, metadata, ...legacy_fields } = item;
    return {
      id: text(id) || deterministicId(`${detailId}_attachment`, { ...item, order: undefined }),
      order: nonnegativeInteger(order, index),
      ...(text(caption) && { caption: text(caption) }),
      ...(text(source) && { source: text(source) }),
      ...(text(storage_path ?? file_url) && { storage_path: text(storage_path ?? file_url) }),
      ...(Object.keys(record(metadata)).length && { metadata: record(metadata) }),
      ...(Object.keys(legacy_fields).length && { legacy_fields }),
    };
  }).sort((a, b) => a.order - b.order);
}

function orderedLinks(row: LegacyRow, detailId: string): RecommendationReferenceLink[] {
  const values = Array.isArray(row.reference_links)
    ? row.reference_links
    : text(row.reference_link ?? row.link) ? [{ url: row.reference_link ?? row.link }] : [];
  return values.map((value, index) => {
    const item = typeof value === "string" ? { url: value } : record(value);
    const { id, order, url, caption, source, storage_path, metadata, ...legacy_fields } = item;
    if (!text(url)) throw new Error("Reference link URL is required.");
    return {
      id: text(id) || deterministicId(`${detailId}_link`, { ...item, order: undefined }),
      order: nonnegativeInteger(order, index),
      url: text(url),
      ...(text(caption) && { caption: text(caption) }),
      ...(text(source) && { source: text(source) }),
      ...(text(storage_path) && { storage_path: text(storage_path) }),
      ...(Object.keys(record(metadata)).length && { metadata: record(metadata) }),
      ...(Object.keys(legacy_fields).length && { legacy_fields }),
    };
  }).sort((a, b) => a.order - b.order);
}

function nestedDetails(row: LegacyRow): LegacyRow[] {
  const values = Array.isArray(row.details) ? row.details
    : Array.isArray(row.recommendation_details) ? row.recommendation_details
      : [];
  return values.map(record);
}

function hasNestedDetails(row: LegacyRow): boolean {
  return Array.isArray(row.details) || Array.isArray(row.recommendation_details);
}

function validateParent(parent: RecommendationParentItem): void {
  if (!Number.isInteger(parent.order) || parent.order < 0) throw new Error("parent.order must be a nonnegative integer.");
  if (!text(parent.applicant_original.name)) throw new Error("Applicant original name is required.");
  positiveInteger(parent.applicant_original.quantity, "applicant_original.quantity");
  if (parent.status === "not_recommended") {
    if (!text(parent.location)) throw new Error("Not-recommended parent requires location.");
    if (!text(parent.pic)) throw new Error("Not-recommended parent requires PIC.");
    if (!text(parent.rejection_reason)) throw new Error("Not-recommended parent requires rejection_reason.");
    return;
  }
  if (parent.details.length === 0) throw new Error("Recommended parent requires at least one detail.");
  parent.details.forEach((detail) => {
    if (!text(detail.name)) throw new Error("Recommendation detail name/spec is required.");
    positiveInteger(detail.quantity, "detail.quantity");
    normalizeAction({ recommendation_action: detail.action });
  });
}

export function readLegacyRecommendationItems(rows: unknown): RecommendationMultiDetail {
  const values = Array.isArray(rows) ? rows : Array.isArray(record(rows).items) ? record(rows).items as unknown[] : [];
  const parents = new Map<string, RecommendationParentItem>();
  values.forEach((raw) => {
    const row = record(raw);
    const original = record(row.applicant_original);
    const originalName = text(original.name ?? row.parent_item_name ?? row.original_name ?? row.nama_barang ?? row.nama ?? row.name);
    const originalQuantity = positiveInteger(original.quantity ?? row.parent_item_quantity ?? row.original_quantity ?? row.jumlah ?? row.quantity ?? 1, "applicant_original.quantity");
    const originalNotes = text(original.notes ?? row.parent_item_notes ?? row.original_notes ?? row.catatan ?? row.notes);
    if (!originalName) throw new Error("Applicant original name is required.");
    const parentId = text(row.parent_item_id) || (hasNestedDetails(row) ? text(row.id) : "") ||
      deterministicId("parent", { name: originalName, quantity: originalQuantity, notes: originalNotes });
    const rowStatus = normalizeStatus(row);
    const location = text(row.location ?? row.lokasi ?? row.lokasi_pic);
    const pic = text(row.pic);
    let parent = parents.get(parentId);
    if (!parent) {
      parent = {
        id: parentId,
        order: nonnegativeInteger(row.order ?? row.parent_item_index, parents.size),
        status: rowStatus,
        rejection_reason: legacyRejectionReason(row),
        applicant_original: Object.freeze({ name: originalName, quantity: originalQuantity, notes: originalNotes }),
        location,
        pic,
        details: [],
        ...(unknownFields(row, knownParentKeys) && { legacy_fields: unknownFields(row, knownParentKeys) }),
      };
      parents.set(parentId, parent);
    } else if (parent.status !== rowStatus) {
      throw new Error(`Conflicting decisions for parent ${parentId}.`);
    }

    const candidates = hasNestedDetails(row) ? nestedDetails(row) : rowStatus === "recommended" ? [row] : [];
    candidates.forEach((candidate) => {
      const detailRow = { ...row, ...candidate };
      const name = text(detailRow.name ?? detailRow.asset_name ?? detailRow.nama_barang ?? detailRow.nama ?? detailRow.specification ?? detailRow.spesifikasi) ||
        (parent!.details.length === 0 ? originalName : "");
      if (!name) throw new Error("Recommendation detail name/spec is required.");
      const detailId = text(detailRow.detail_id ?? detailRow.recommendation_detail_id) ||
        (hasNestedDetails(row) ? text(candidate.id) : text(row.id)) ||
        deterministicId(`${parentId}_detail`, { ...candidate, order: undefined, no: undefined });
      const action = normalizeAction(detailRow);
      const description = text(detailRow.description ?? detailRow.uraian) || RECOMMENDATION_DESCRIPTION_DEFAULTS[action];
      parent!.details.push({
        id: detailId,
        order: nonnegativeInteger(detailRow.order ?? detailRow.no, parent!.details.length),
        action,
        name,
        quantity: positiveInteger(detailRow.quantity ?? detailRow.jumlah ?? 1, "detail.quantity"),
        description,
        description_manually_edited: detailRow.description_manually_edited === true,
        notes: text(detailRow.notes ?? detailRow.catatan),
        ...(text(detailRow.detail_location ?? detailRow.location) && { location: text(detailRow.detail_location ?? detailRow.location) }),
        ...(text(detailRow.detail_pic ?? detailRow.pic) && { pic: text(detailRow.detail_pic ?? detailRow.pic) }),
        attachments: orderedAttachments(detailRow, detailId),
        reference_links: orderedLinks(detailRow, detailId),
        ...(unknownFields(candidate, knownDetailKeys) && { legacy_fields: unknownFields(candidate, knownDetailKeys) }),
      });
    });
  });
  const model = { version: 1 as const, items: [...parents.values()] };
  model.items.forEach(validateParent);
  return model;
}

function parentFields(parent: RecommendationParentItem, parentIndex: number): LegacyRow {
  return {
    ...parent.legacy_fields,
    parent_item_id: parent.id,
    parent_item_index: parentIndex + 1,
    order: parent.order,
    parent_item_name: parent.applicant_original.name,
    parent_item_quantity: parent.applicant_original.quantity,
    parent_item_notes: parent.applicant_original.notes,
    recommendation_status: parent.status,
    is_recommended: parent.status === "recommended",
    ...(parent.location && { location: parent.location }),
    ...(parent.pic && { pic: parent.pic }),
  };
}

export function flattenRecommendationItems(model: RecommendationMultiDetail): LegacyRow[] {
  return withoutRecommendationEstimatedPrices(model).items.flatMap<LegacyRow>((parent, parentIndex): LegacyRow[] => {
    validateParent(parent);
    if (parent.status === "not_recommended") {
      return [{
        ...parentFields(parent, parentIndex),
        detail_id: `${parent.id}_decision`,
        no: 1,
        nama_barang: parent.applicant_original.name,
        jumlah: parent.applicant_original.quantity,
        recommendation_action: "tidak_direkomendasikan",
        tidak_direkomendasikan: "✓",
        service: "",
        ganti: "",
        beli_baru: "",
        rejection_reason: parent.rejection_reason,
        alasan: parent.rejection_reason,
        keterangan: parent.rejection_reason,
        uraian: parent.rejection_reason,
        attachments: [],
        reference_links: [],
        reference_link: "",
      }];
    }
    return [...parent.details].sort((a, b) => a.order - b.order).map((detail, detailIndex) => {
      const action = LEGACY_ACTIONS[detail.action];
      return {
        ...parentFields(parent, parentIndex),
        ...detail.legacy_fields,
        detail_id: detail.id,
        no: detailIndex + 1,
        order: detail.order,
        nama_barang: detail.name,
        jumlah: detail.quantity,
        notes: detail.notes,
        recommendation_action: action,
        service: action === "service" ? "✓" : "",
        ganti: action === "ganti" ? "✓" : "",
        beli_baru: action === "beli_baru" ? "✓" : "",
        tidak_direkomendasikan: "",
        uraian: detail.description,
        description_manually_edited: detail.description_manually_edited,
        ...(detail.location && { detail_location: detail.location }),
        ...(detail.pic && { detail_pic: detail.pic }),
        attachments: detail.attachments.map(({ legacy_fields, ...attachment }) => ({ ...legacy_fields, ...attachment })),
        reference_links: detail.reference_links.map(({ legacy_fields, ...link }) => ({ ...legacy_fields, ...link })),
        reference_link: detail.reference_links[0]?.url ?? "",
      };
    });
  });
}

export function withoutRecommendationEstimatedPrices(model: RecommendationMultiDetail): RecommendationMultiDetail {
  return {
    ...model,
    items: model.items.map((parent) => ({
      ...parent,
      details: parent.details.map((detail) => {
        const {
          estimated_price: _estimatedPrice,
          harga_estimasi: _legacyEstimatedPrice,
          ...cleanDetail
        } = detail as RecommendationDetail & Record<string, unknown>;
        return cleanDetail as RecommendationDetail;
      }),
    })),
  };
}

export function applyRecommendationDescriptionDefault(detail: RecommendationDetail, action: RecommendationAction): RecommendationDetail {
  return detail.description_manually_edited ? detail : { ...detail, action, description: RECOMMENDATION_DESCRIPTION_DEFAULTS[action] };
}

export function setRecommendationDescription(detail: RecommendationDetail, description: string): RecommendationDetail {
  return { ...detail, description, description_manually_edited: true };
}

export function createRecommendationId(idFactory: RecommendationIdFactory = () => crypto.randomUUID()): string {
  const id = text(idFactory());
  if (!id) throw new Error("ID factory returned an empty ID.");
  return id;
}

export function addRecommendationDetail(parent: RecommendationParentItem, detail: RecommendationDetail): RecommendationParentItem {
  if (parent.details.some((item) => item.id === detail.id)) throw new Error(`Duplicate detail ID: ${detail.id}`);
  return { ...parent, details: [...parent.details, detail] };
}

export function removeRecommendationDetail(parent: RecommendationParentItem, detailId: string): RecommendationParentItem {
  const details = parent.details.filter((detail) => detail.id !== detailId);
  if (parent.status === "recommended" && details.length === 0) throw new Error("Recommended parent requires at least one detail.");
  return { ...parent, details };
}

export function reorderRecommendationDetails(parent: RecommendationParentItem, detailIds: string[]): RecommendationParentItem {
  if (detailIds.length !== parent.details.length || new Set(detailIds).size !== detailIds.length) throw new Error("Detail reorder must contain every stable ID once.");
  const details = new Map(parent.details.map((detail) => [detail.id, detail]));
  return { ...parent, details: detailIds.map((id, order) => {
    const detail = details.get(id);
    if (!detail) throw new Error(`Unknown detail ID: ${id}`);
    return { ...detail, order };
  }) };
}
