const asRecord = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const asArray = (value) => Array.isArray(value) ? value : [];
const text = (...values) => values.map((value) => String(value ?? "").trim()).find(Boolean) || "";
const normalizedText = (...values) => text(...values).toLocaleLowerCase("id-ID");

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
    return matches.length === 1 ? matches[0] : null;
  }

  const index = legacyIndex(row);
  if (index !== null && index < items.length) return index;

  const name = rowParentName(row) || itemName(row);
  if (!name) return null;
  const matches = items.flatMap((item, itemIndex) => itemName(item) === name ? [itemIndex] : []);
  return matches.length === 1 ? matches[0] : null;
};

const isNotRecommended = (detail) => {
  const action = normalizedText(detail.recommendation_action, detail.action, detail.status);
  return detail.is_recommended === false || [
    "not_recommended",
    "tidak_direkomendasikan",
    "tidak direkomendasikan",
    "rejected",
  ].includes(action) || Boolean(text(detail.tidak_direkomendasikan));
};

const isRecommended = (item) => {
  const status = normalizedText(item.recommendation_status, item.status);
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

const money = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 ? value : null;
  const digits = String(value).replace(/[^\d-]/g, "");
  const number = Number(digits);
  return digits && Number.isInteger(number) && number >= 0 ? number : null;
};

const detailRows = (row) => {
  const nested = asArray(row.details).length > 0
    ? asArray(row.details)
    : asArray(row.recommendation_details).length > 0
      ? asArray(row.recommendation_details)
      : asArray(row.items);
  return nested.length > 0 ? nested.map(asRecord) : [row];
};

export class MarisonAssetItemsError extends Error {
  constructor(message = "Tidak ada detail rekomendasi aset valid untuk dikirim.") {
    super(message);
    this.name = "MarisonAssetItemsError";
    this.code = "MARISON_ASSET_ITEMS_EMPTY";
    this.status = 422;
  }
}

export const mapMarisonAssetItems = ({ applicantItems, recommendationRows, recommendationPdf }) => {
  const items = asArray(applicantItems).map(asRecord);
  const canonical = !Array.isArray(recommendationRows) && Array.isArray(asRecord(recommendationRows).items);
  const recommendations = Array.isArray(recommendationRows)
    ? recommendationRows
    : asArray(asRecord(recommendationRows).items);
  const pdf = asRecord(recommendationPdf);
  if (!text(pdf.name) || !/^https:\/\//i.test(text(pdf.link))) throw new MarisonAssetItemsError("PDF rekomendasi gabungan belum tersedia.");
  const sharedPdf = { name: text(pdf.name), link: text(pdf.link) };

  const outgoing = recommendations.flatMap((value) => {
    const row = asRecord(value);
    const parentIndex = matchParentIndex(items, row);
    if (parentIndex === null) return [];
    if (canonical && !isRecommended(row)) return [];
    const parent = items[parentIndex];

    return detailRows(row).flatMap((detail) => {
      if (!canonical && isNotRecommended(detail)) return [];
      const quantity = positiveInteger(detail.quantity ?? detail.jumlah ?? parent.quantity ?? parent.jumlah);
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
      const estimatedPrice = money(
        detail.estimated_price ?? detail.harga_perkiraan ?? detail.perkiraan_harga ?? detail.harga ?? detail.nominal ?? detail.nilai,
      );
      const description = text(detail.description, detail.detail_description, detail.keterangan, detail.notes, detail.catatan);
      return [{
        asset_name: assetName,
        quantity,
        ...(estimatedPrice === null ? {} : { estimated_price: estimatedPrice }),
        ...(description ? { description } : {}),
        attachments: [sharedPdf],
      }];
    });
  });

  if (outgoing.length === 0) throw new MarisonAssetItemsError();
  return deepFreeze(outgoing);
};

export const mapMarisonAssetRequest = ({ request, applicantItems, recommendationRows, recommendationPdf }) => deepFreeze({
  ...structuredClone(asRecord(request)),
  items: mapMarisonAssetItems({ applicantItems, recommendationRows, recommendationPdf }),
});
