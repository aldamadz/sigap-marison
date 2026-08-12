import {
  flattenRecommendationItems,
  type RecommendationAction,
  type RecommendationAttachment,
  type RecommendationDetail,
  type RecommendationMultiDetail,
  type RecommendationParentItem,
  type RecommendationReferenceLink,
} from "@sigap/shared";

type InputRecord = Record<string, unknown>;
type IdFactory = () => string;

export function createRecommendationClientId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  if (bytes.some(Boolean)) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const asRecord = (value: unknown): InputRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? value as InputRecord : {};

const text = (value: unknown) => String(value ?? "").trim();

const positiveQuantity = (value: unknown) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

const createId = (idFactory: IdFactory) => {
  const id = text(idFactory());
  if (!id) throw new Error("ID detail rekomendasi tidak tersedia.");
  return id;
};

const legacyAction = (row: InputRecord): RecommendationAction => {
  const explicit = text(row.recommendation_action ?? row.action).toLowerCase();
  if (["purchase_new", "beli_baru", "beli baru"].includes(explicit) || text(row.beli_baru)) return "purchase_new";
  if (["replace", "ganti"].includes(explicit) || text(row.ganti)) return "replace";
  if (["service", "servis"].includes(explicit) || text(row.service)) return "service";
  return "purchase_new";
};

const actionDescription = (action: RecommendationAction) => {
  if (action === "purchase_new") return "Pembelian baru";
  if (action === "replace") return "Penggantian komponen";
  return "Servis";
};

const legacyAttachment = (row: InputRecord, detailId: string): RecommendationAttachment[] => {
  const nested = asRecord(row.recommendation_attachment);
  const values = Array.isArray(row.attachments)
    ? row.attachments
    : Array.isArray(nested.attachments)
      ? nested.attachments
      : text(nested.file_url ?? row.recommendation_attachment_url)
        ? [{
            id: nested.draft_file_id ?? row.recommendation_attachment_draft_file_id,
            storage_path: nested.file_url ?? row.recommendation_attachment_url,
            caption: nested.file_name ?? row.recommendation_attachment_file_name,
            source: nested.source ?? row.recommendation_attachment_source,
            metadata: {
              draft_file_id: nested.draft_file_id ?? row.recommendation_attachment_draft_file_id,
              file_name: nested.file_name ?? row.recommendation_attachment_file_name,
              file_type: nested.file_type ?? row.recommendation_attachment_file_type,
              file_size: nested.file_size ?? row.recommendation_attachment_file_size,
            },
          }]
        : [];
  return values.map((value, order) => {
    const attachment = asRecord(value);
    return {
      id: text(attachment.id) || `${detailId}-attachment-${order + 1}`,
      order,
      ...(text(attachment.caption ?? attachment.file_name) && { caption: text(attachment.caption ?? attachment.file_name) }),
      ...(text(attachment.source) && { source: text(attachment.source) }),
      ...(text(attachment.storage_path ?? attachment.file_url) && { storage_path: text(attachment.storage_path ?? attachment.file_url) }),
      ...(Object.keys(asRecord(attachment.metadata)).length > 0 && { metadata: asRecord(attachment.metadata) }),
    };
  });
};

const legacyLinks = (row: InputRecord, detailId: string): RecommendationReferenceLink[] => {
  const values = Array.isArray(row.reference_links)
    ? row.reference_links
    : text(row.reference_link ?? row.link)
      ? [{ url: row.reference_link ?? row.link }]
      : [];
  return values.map((value, order) => {
    const link = typeof value === "string" ? { url: value } : asRecord(value);
    return {
      id: text(link.id) || `${detailId}-link-${order + 1}`,
      order,
      url: text(link.url),
      ...(text(link.caption) && { caption: text(link.caption) }),
    };
  }).filter((link) => link.url);
};

const isCanonicalModel = (value: unknown): value is RecommendationMultiDetail => {
  const model = asRecord(value);
  return model.version === 1 && Array.isArray(model.items);
};

export function buildRecommendationMultiDetail(
  applicantItems: unknown,
  existingInput?: InputRecord,
  idFactory: IdFactory = createRecommendationClientId,
): RecommendationMultiDetail {
  if (isCanonicalModel(existingInput?.recommendation_multi_detail)) {
    return existingInput.recommendation_multi_detail;
  }

  const parents = Array.isArray(applicantItems) ? applicantItems.map(asRecord) : [];
  const legacyRows = Array.isArray(existingInput?.recommendation_items)
    ? existingInput.recommendation_items.map(asRecord)
    : [];

  return {
    version: 1,
    items: parents.map((applicant, order): RecommendationParentItem => {
      const legacy = legacyRows[order] || {};
      const parentId = text(legacy.parent_item_id ?? applicant.parent_item_id ?? applicant.id) || createId(idFactory);
      const originalName = text(
        applicant.parent_item_name ?? applicant.nama_barang ?? applicant.nama ?? applicant.barang ?? applicant.name,
      ) || `Item ${order + 1}`;
      const originalQuantity = positiveQuantity(applicant.jumlah ?? applicant.quantity ?? applicant.parent_item_quantity);
      const originalNotes = text(applicant.keterangan ?? applicant.catatan ?? applicant.notes);
      const notRecommended = ["tidak_direkomendasikan", "not_recommended", "rejected", "ditolak"]
        .includes(text(legacy.recommendation_action ?? legacy.recommendation_status).toLowerCase());
      const detailId = text(legacy.detail_id) || createId(idFactory);
      const action = legacyAction(legacy);
      const detail: RecommendationDetail = {
        id: detailId,
        order: 0,
        action,
        name: text(legacy.nama_barang ?? legacy.name) || originalName,
        quantity: positiveQuantity(legacy.jumlah ?? legacy.quantity ?? originalQuantity),
        description: text(legacy.uraian ?? legacy.description) || actionDescription(action),
        description_manually_edited: legacy.description_manually_edited === true,
        notes: text(legacy.keterangan ?? legacy.notes),
        attachments: legacyAttachment(legacy, detailId),
        reference_links: legacyLinks(legacy, detailId),
      };
      const estimatedPrice = Number(legacy.estimated_price ?? legacy.harga_estimasi);
      if (Number.isFinite(estimatedPrice) && estimatedPrice >= 0) detail.estimated_price = estimatedPrice;

      return {
        id: parentId,
        order,
        status: notRecommended ? "not_recommended" : "recommended",
        rejection_reason: notRecommended ? text(legacy.rejection_reason ?? legacy.keterangan ?? legacy.alasan) : "",
        applicant_original: Object.freeze({ name: originalName, quantity: originalQuantity, notes: originalNotes }),
        location: text(legacy.location ?? legacy.lokasi ?? legacy.lokasi_pic),
        pic: text(legacy.pic ?? legacy.lokasi_pic),
        details: notRecommended ? [] : [detail],
      };
    }),
  };
}

export function syncRecommendationMultiDetailInput(
  current: InputRecord,
  model: RecommendationMultiDetail,
): InputRecord {
  const nextInput: InputRecord = {
    ...current,
    recommendation_multi_detail: model,
  };

  // The canonical draft may be temporarily incomplete while the user edits it.
  // Keep the last valid legacy projection when the strict serializer rejects
  // that transient state; final submission still rebuilds it fail-closed.
  try {
    return {
      ...nextInput,
      recommendation_items: flattenRecommendationItems(model),
    };
  } catch {
    return nextInput;
  }
}

export function recommendationMultiDetailErrors(model: RecommendationMultiDetail): string[] {
  const errors: string[] = [];
  model.items.forEach((parent, parentIndex) => {
    const item = `Item ${parentIndex + 1}`;
    if (!text(parent.location)) errors.push(`${item}: lokasi wajib dipilih.`);
    if (!text(parent.pic)) errors.push(`${item}: PIC wajib dipilih.`);
    if (parent.status === "not_recommended") {
      if (text(parent.rejection_reason).length < 5) errors.push(`${item}: alasan tidak direkomendasikan wajib diisi.`);
      return;
    }
    if (parent.details.length === 0) errors.push(`${item}: minimal satu detail rekomendasi wajib ditambahkan.`);
    [...parent.details].sort((a, b) => a.order - b.order).forEach((detail, detailIndex) => {
      const label = `${item}.${detailIndex + 1}`;
      if (!text(detail.name)) errors.push(`${label}: nama atau spesifikasi wajib diisi.`);
      if (!Number.isInteger(detail.quantity) || detail.quantity < 1) errors.push(`${label}: jumlah minimal 1.`);
      if (!text(detail.description)) errors.push(`${label}: uraian wajib diisi.`);
      if (!text(detail.notes)) errors.push(`${label}: keterangan wajib diisi.`);
      if (detail.attachments.length === 0) errors.push(`${label}: lampiran gambar wajib ditambahkan.`);
      detail.reference_links.forEach((link, linkIndex) => {
        try {
          const url = new URL(link.url);
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
        } catch {
          errors.push(`${label}: link ${linkIndex + 1} tidak valid.`);
        }
      });
    });
  });
  return errors;
}

export function createRecommendationDetail(
  parent: RecommendationParentItem,
  idFactory: IdFactory = createRecommendationClientId,
): RecommendationDetail {
  return {
    id: createId(idFactory),
    order: parent.details.length,
    action: "purchase_new",
    name: parent.details.length === 0 ? parent.applicant_original.name : "",
    quantity: 1,
    description: "Pembelian baru",
    description_manually_edited: false,
    notes: "",
    attachments: [],
    reference_links: [],
  };
}

export const recommendationActionDescription = actionDescription;
