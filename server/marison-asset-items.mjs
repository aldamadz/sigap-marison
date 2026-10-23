import { parseItemQuantity } from "@sigap/shared";

const asRecord = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const asArray = (value) => Array.isArray(value) ? value : [];
const text = (...values) => values.map((value) => String(value ?? "").trim()).find(Boolean) || "";
const normalizedText = (...values) => text(...values).toLocaleLowerCase("id-ID");
const normalizedStatus = (...values) => normalizedText(...values).replace(/[\s-]+/g, "_");

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
};

export const freezeMarisonAssetPayload = deepFreeze;

const itemId = (item) => text(item.id, item.item_id, item.request_item_id, item.parent_item_id);
const itemName = (item) => normalizedText(item.nama_barang, item.item_name, item.nama, item.barang, item.name);
const rowParentId = (row) => text(
  row.parent_item_id,
  row.request_item_id,
  (Array.isArray(row.details) || row.applicant_original) && row.id,
);
const rowParentName = (row) => normalizedText(
  row.parent_item_name,
  row.parent_name,
  asRecord(row.applicant_original).name,
);

const legacyIndex = (row) => {
  const value = Number(row.parent_item_index ?? row.item_number ?? row.parent_index ?? row.no);
  return Number.isInteger(value) && value > 0 ? value - 1 : null;
};

const matchParentIndex = (items, row) => {
  const parentId = rowParentId(row);
  if (parentId) {
    const matches = items.flatMap((item, index) => itemId(item) === parentId ? [index] : []);
    if (matches.length === 1) return matches[0];
    // Canonical recommendation parents receive generated IDs when historical
    // applicant rows have no stable IDs. Only then may identity fall back to
    // the immutable order/name snapshot.
    if (items.some((item) => Boolean(itemId(item)))) return null;
  }

  const index = legacyIndex(row);
  if (index !== null && index < items.length) return index;

  const canonicalOrder = Number(row.order);
  if ((Array.isArray(row.details) || row.applicant_original)
    && Number.isInteger(canonicalOrder) && canonicalOrder >= 0 && canonicalOrder < items.length) {
    const expectedName = rowParentName(row);
    if (!expectedName || itemName(items[canonicalOrder]) === expectedName) return canonicalOrder;
  }

  const name = rowParentName(row) || itemName(row);
  if (!name) return null;
  const matches = items.flatMap((item, itemIndex) => itemName(item) === name ? [itemIndex] : []);
  return matches.length === 1 ? matches[0] : null;
};

const isNotRecommended = (detail) => {
  const action = normalizedStatus(detail.recommendation_action, detail.action, detail.status);
  const marker = normalizedText(detail.tidak_direkomendasikan);
  return detail.is_recommended === false || [
    "not_recommended",
    "tidak_direkomendasikan",
    "rejected",
    "ditolak",
  ].includes(action) || (Boolean(marker) && !["false", "0", "no", "tidak", "-"].includes(marker));
};

const isRecommended = (item) => {
  const status = normalizedStatus(item.recommendation_status, item.status);
  return [
    "recommended",
    "direkomendasikan",
  ].includes(status);
};

const positiveInteger = (value) => {
  if (typeof value === "string" && !/^\s*\d+\s*$/.test(value)) return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

const detailRows = (row) => {
  const nested = asArray(row.details).length > 0
    ? asArray(row.details)
    : asArray(row.recommendation_details).length > 0
      ? asArray(row.recommendation_details)
      : asArray(row.items);
  return nested.length > 0 ? nested.map(asRecord) : [row];
};

const externalAttachments = (value) => asArray(value).flatMap((entry) => {
  const attachment = asRecord(entry);
  const name = text(attachment.name);
  const link = text(attachment.link);
  return name && /^https:\/\//i.test(link) ? [{ name, link }] : [];
});

export class MarisonAssetItemsError extends Error {
  constructor(message = "Tidak ada detail rekomendasi aset valid untuk dikirim.") {
    super(message);
    this.name = "MarisonAssetItemsError";
    this.code = "MARISON_ASSET_ITEMS_EMPTY";
    this.status = 422;
  }
}

export const mapMarisonAssetItems = ({ applicantItems, recommendationRows, recommendationPdf, applicantAttachments = [] }) => {
  const items = asArray(applicantItems).map(asRecord);
  const canonical = !Array.isArray(recommendationRows) && Array.isArray(asRecord(recommendationRows).items);
  const recommendations = Array.isArray(recommendationRows)
    ? recommendationRows
    : asArray(asRecord(recommendationRows).items);
  const pdf = asRecord(recommendationPdf);
  if (!text(pdf.name) || (!/^https:\/\//i.test(text(pdf.link))
    && (pdf.type !== "sigap_recommendation_pdf" || !text(pdf.surat_id)))) {
    throw new MarisonAssetItemsError("PDF rekomendasi gabungan belum tersedia.");
  }
  const sharedPdf = pdf.type === "sigap_recommendation_pdf"
    ? { type: pdf.type, surat_id: text(pdf.surat_id), name: text(pdf.name) }
    : { name: text(pdf.name), link: text(pdf.link) };

  const outgoing = recommendations.flatMap((value) => {
    const row = asRecord(value);
    const parentIndex = matchParentIndex(items, row);
    if (parentIndex === null) return [];
    if (canonical && !isRecommended(row)) return [];
    const parent = items[parentIndex];

    return detailRows(row).flatMap((detail) => {
      if (!canonical && isNotRecommended(detail)) return [];
      const rawQuantity = detail.quantity ?? detail.jumlah ?? parent.quantity ?? parent.jumlah;
      if (parseItemQuantity(rawQuantity) !== null && !Number.isInteger(parseItemQuantity(rawQuantity))) {
        throw new MarisonAssetItemsError("API external Aset masih mensyaratkan jumlah bulat. Jumlah desimal tidak dibulatkan atau dihilangkan otomatis.");
      }
      const quantity = positiveInteger(rawQuantity);
      const assetName = text(
        detail.asset_name,
        detail.detail_name,
        detail.name,
        detail.nama_barang,
        detail.specification,
        detail.specification_name,
        detail.spesifikasi,
        detail.uraian,
      );
      if (!quantity || !assetName) return [];
      const description = text(detail.description, detail.detail_description, detail.keterangan, detail.notes, detail.catatan);
      return [{
        asset_name: assetName,
        quantity,
        ...(description ? { description } : {}),
        attachments: [...externalAttachments(applicantAttachments), sharedPdf].filter((attachment, index, all) =>
          all.findIndex(other => attachment.link ? other.link === attachment.link
            : other.type === attachment.type && other.surat_id === attachment.surat_id) === index),
      }];
    });
  });

  if (outgoing.length === 0) throw new MarisonAssetItemsError();
  return deepFreeze(outgoing);
};

export const mapMarisonApplicantAssetItems = ({ applicantItems, attachments }) => {
  const sharedAttachments = externalAttachments(attachments);
  const outgoing = asArray(applicantItems).flatMap((value) => {
    const item = asRecord(value);
    const assetName = text(item.asset_name, item.nama_barang, item.item_name, item.nama, item.barang, item.name);
    const rawQuantity = item.quantity ?? item.jumlah;
    if (parseItemQuantity(rawQuantity) !== null && !Number.isInteger(parseItemQuantity(rawQuantity))) {
      throw new MarisonAssetItemsError("API external Aset masih mensyaratkan jumlah bulat. Jumlah desimal tidak dibulatkan atau dihilangkan otomatis.");
    }
    const quantity = positiveInteger(rawQuantity);
    if (!assetName) return [];
    const description = text(item.description, item.keterangan, item.notes, item.catatan);
    return [{
      asset_name: assetName,
      ...(quantity ? { quantity } : {}),
      ...(description ? { description } : {}),
      ...(sharedAttachments.length > 0 ? { attachments: sharedAttachments } : {}),
    }];
  });

  if (outgoing.length === 0) {
    throw new MarisonAssetItemsError("Item aset pemohon belum valid untuk dikirim.");
  }
  return deepFreeze(outgoing);
};

export const mapMarisonAssetRequest = ({
  request,
  applicantItems,
  recommendationRows,
  recommendationPdf,
  recommendationRequired = true,
  applicantAttachments = [],
}) => deepFreeze({
  ...structuredClone(asRecord(request)),
  items: recommendationRequired
    ? mapMarisonAssetItems({ applicantItems, recommendationRows, recommendationPdf, applicantAttachments })
    : mapMarisonApplicantAssetItems({ applicantItems, attachments: applicantAttachments }),
});
