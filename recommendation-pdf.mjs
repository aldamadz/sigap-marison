const asRecord = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const asArray = (value) => Array.isArray(value) ? value : [];
const text = (...values) => values.map((value) => String(value ?? "").trim()).find(Boolean) || "";
const orderNumber = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const imageExtension = /\.(png|jpe?g|webp|gif|tiff?|avif)(?:$|[?#])/i;
const imageMime = /^image\//i;
const notRecommendedPattern = /not[\s_-]*recommended|tidak[\s_-]*direkomendasikan|rejected|ditolak/i;
const isNotRecommended = (value) => notRecommendedPattern.test(String(value || ""));
const recommendationStatusLabel = (value) => isNotRecommended(value) ? "Tidak direkomendasikan" : "Direkomendasikan";
const recommendationActionLabel = (value) => {
  const action = String(value || "").trim().toLowerCase();
  if (["service", "servis"].includes(action)) return "Servis";
  if (["replace", "replacement", "ganti"].includes(action)) return "Ganti";
  if (["purchase_new", "beli_baru", "beli baru"].includes(action)) return "Pembelian baru";
  return "";
};

export const parseStorageRef = (value, options = {}) => {
  const record = asRecord(value);
  const raw = text(
    record.storage_path,
    record.file_url,
    record.url,
    record.path,
    typeof value === "string" ? value : "",
  );
  if (!raw) return null;
  const clean = raw.split("?")[0].replace(/\\/g, "/");
  const marker = clean.match(/^(.*)\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i);
  const externalBases = asArray(options.externalBases).filter(Boolean).map((base) => String(base).replace(/\/+$/, ""));
  if (marker) {
    return {
      bucket: decodeURIComponent(marker[2]),
      path: decodeURIComponent(marker[3]),
      origin: externalBases.some((base) => marker[1].startsWith(base)) ? "external" : "primary",
    };
  }
  const decoded = decodeURIComponent(clean).replace(/^\/+/, "");
  const [first, ...rest] = decoded.split("/");
  if (["dokumen_surat", "lampiran_surat"].includes(first) && rest.length) {
    return { bucket: first, path: rest.join("/"), origin: text(record.origin, options.defaultOrigin, "primary") };
  }
  return {
    bucket: text(record.bucket, options.defaultBucket),
    path: decoded,
    origin: text(record.origin, options.defaultOrigin, "primary"),
  };
};

const normalizeAttachment = (value, fallbackOrder, fallbackId) => {
  const row = typeof value === "string" ? { file_url: value } : asRecord(value);
  const legacy = asRecord(row.legacy_fields);
  const metadata = asRecord(row.metadata);
  const url = text(row.file_url, row.url, row.path, row.storage_path, row.link, legacy.file_url, legacy.url);
  const name = text(row.file_name, row.name, row.caption, legacy.file_name, metadata.file_name, url.split(/[/?#]/).filter(Boolean).at(-1));
  const mimeType = text(row.file_type, row.mime_type, row.content_type, legacy.file_type, metadata.file_type);
  return {
    id: text(row.id, row.attachment_id, row.draft_file_id, fallbackId),
    order: orderNumber(row.order ?? row.sort_order ?? row.position, fallbackOrder),
    url,
    name,
    mimeType,
    required: row.required !== false,
    isImage: imageMime.test(mimeType) || imageExtension.test(name) || imageExtension.test(url),
  };
};

const collectAttachments = (row) => {
  const source = asRecord(row);
  const nested = asRecord(source.recommendation_attachment);
  const values = [
    ...asArray(source.attachments),
    ...asArray(source.recommendation_attachments),
    ...asArray(nested.attachments),
  ];
  if (nested.file_url || nested.url || nested.path || nested.draft_file_id) values.push(nested);
  if (source.recommendation_attachment_url || source.recommendation_attachment_file_name) {
    values.push({
      id: source.recommendation_attachment_id || source.recommendation_attachment_draft_file_id,
      file_url: source.recommendation_attachment_url,
      file_name: source.recommendation_attachment_file_name,
      file_type: source.recommendation_attachment_file_type,
    });
  }
  const seen = new Set();
  return values
    .map((value, index) => normalizeAttachment(value, index + 1, `attachment-${index + 1}`))
    .filter((attachment) => {
      const key = attachment.id || attachment.url || `${attachment.name}:${attachment.order}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
};

const recommendationRows = (source) => {
  const input = asRecord(source);
  const canonical = asRecord(input.recommendation_multi_detail);
  if (Object.hasOwn(input, "recommendation_multi_detail")) return asArray(canonical.items);
  if (asArray(input.recommendation_items).length) return asArray(input.recommendation_items);
  if (asArray(asRecord(input.recommendation).items).length) return asArray(asRecord(input.recommendation).items);
  return asArray(input.items);
};

const rowKey = (row, index) => text(row.id, row.parent_item_id, row.item_id, `index:${index}`);
const mergeRows = (primary, fallback) => {
  const fallbackByKey = new Map(fallback.map((raw, index) => [rowKey(asRecord(raw), index), asRecord(raw)]));
  const merged = primary.map((raw, index) => {
    const row = asRecord(raw);
    const old = fallbackByKey.get(rowKey(row, index)) || asRecord(fallback[index]);
    fallbackByKey.delete(rowKey(row, index));
    const details = asArray(row.details).length ? row.details : asArray(row.recommendation_details).length ? row.recommendation_details : undefined;
    const oldDetails = asArray(old.details).length ? old.details : asArray(old.recommendation_details);
    return { ...old, ...row, ...(details ? { details } : oldDetails.length ? { details: oldDetails } : {}) };
  });
  return [...merged, ...fallbackByKey.values()];
};

export const resolveRecommendationSource = (childInput = {}, parentInput = {}, childSnapshotInput = {}, parentSnapshotInput = {}) => {
  const child = asRecord(childInput);
  const parent = { ...asRecord(parentSnapshotInput), ...asRecord(parentInput) };
  const parentItems = asArray(parent.items).length ? asArray(parent.items) : asArray(asRecord(parentSnapshotInput).items);
  const currentRows = recommendationRows(child);
  const snapshotRows = recommendationRows(childSnapshotInput);
  let canonicalItems = currentRows.length ? mergeRows(currentRows, snapshotRows) : snapshotRows;
  if (!asArray(asRecord(child.recommendation_multi_detail).items).length && canonicalItems.length) {
    const groups = new Map();
    canonicalItems.forEach((rawRow, index) => {
      const row = asRecord(rawRow);
      const groupKey = text(row.parent_item_id, asArray(row.details).length ? row.id : "") || `legacy-row-${index + 1}`;
      if (!groups.has(groupKey)) groups.set(groupKey, { ...row, id: groupKey, details: [] });
      groups.get(groupKey).details.push(...(asArray(row.details).length ? asArray(row.details) : [row]));
    });
    canonicalItems = [...groups.values()];
  }

  return canonicalItems.map((rawItem, itemIndex) => {
    const item = asRecord(rawItem);
    const parentIndex = Math.max(orderNumber(item.parent_item_index, itemIndex + 1) - 1, 0);
    const parentItem = asRecord(parentItems[parentIndex]);
    const itemStatus = text(item.status, item.recommendation_status, item.recommendation_action);
    const rejected = isNotRecommended(itemStatus) || item.is_recommended === false;
    const explicitDetails = [
      ...asArray(item.details),
      ...asArray(item.recommendation_details),
      ...asArray(item.detail_items),
    ];
    // A parent decision is canonical. Old drafts can retain a previously
    // recommended detail after the parent is changed to not recommended.
    // Never let that stale detail reverse the final decision in the PDF.
    const details = rejected ? [{
      id: `${text(item.id, `item-${itemIndex + 1}`)}-decision`,
      heading: text(asRecord(item.applicant_original).name, item.parent_item_name, item.nama_barang, item.name),
      status: "not_recommended",
      rejection_reason: text(item.rejection_reason, item.reason, item.alasan),
    }] : explicitDetails.length ? explicitDetails : [item];
    return {
      id: text(item.id, item.item_id, item.parent_item_id, `item-${itemIndex + 1}`),
      order: orderNumber(item.order ?? item.item_order ?? item.parent_item_index, itemIndex + 1),
      applicantName: text(
        asRecord(item.applicant_original).name,
        item.original_applicant_name,
        item.parent_item_name,
        item.applicant_item_name,
        parentItem.nama_barang,
        parentItem.name,
        item.nama_barang,
        item.name,
        `Item ${itemIndex + 1}`,
      ),
      status: rejected ? "not_recommended" : itemStatus,
      location: text(item.location, item.lokasi, item.lokasi_pic, parentItem.location, parentItem.lokasi),
      pic: text(item.pic, item.person_in_charge, parentItem.pic, parentItem.person_in_charge),
      rejectionReason: rejected ? text(item.rejection_reason, item.reason, item.alasan, item.keterangan) : "",
      details: details.map((rawDetail, detailIndex) => {
        const detail = asRecord(rawDetail);
        const status = rejected ? "not_recommended" : text(detail.status, detail.recommendation_status, detail.recommendation_action,
          detail.is_recommended === false ? "not_recommended" : "recommended");
        return {
          id: text(detail.id, detail.detail_id, `${text(item.id, `item-${itemIndex + 1}`)}-detail-${detailIndex + 1}`),
          order: orderNumber(detail.order ?? detail.detail_order, detailIndex + 1),
          heading: text(detail.heading, detail.title, detail.name, detail.nama_detail, detail.nama_barang, detail.uraian, `Detail ${itemIndex + 1}.${detailIndex + 1}`),
          description: text(detail.description, detail.keterangan, detail.notes, detail.catatan, detail.uraian),
          status,
          action: text(detail.action, detail.recommendation_action),
          location: text(detail.location, detail.lokasi, detail.detail_location),
          pic: text(detail.pic, detail.detail_pic, detail.person_in_charge),
          rejectionReason: text(detail.rejection_reason, detail.reason, detail.alasan,
            isNotRecommended(status) ? detail.keterangan : ""),
          attachments: collectAttachments(detail),
        };
      }).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)),
    };
  }).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
};

export const buildRecommendationPagePlan = (items) => asArray(items).flatMap((item, itemIndex) => {
  // The main worksheet already contains the final rejection and its reason.
  // A rejected item has no recommendation attachment to explain, so an extra
  // mostly-empty page adds noise instead of evidence.
  if (isNotRecommended(item.status)) return [];
  return asArray(item.details).flatMap((detail, detailIndex) => {
    const showDetailNumber = asArray(item.details).length > 1;
    const images = detail.attachments.filter((attachment) => attachment.isImage);
    const documents = detail.attachments.filter((attachment) => !attachment.isImage);
    const chunks = images.length
      ? Array.from({ length: Math.ceil(images.length / 6) }, (_, index) => images.slice(index * 6, index * 6 + 6))
      : [[]];
    return chunks.map((pageImages, continuationIndex) => ({
      itemNumber: itemIndex + 1,
      detailNumber: detailIndex + 1,
      showDetailNumber,
      itemId: item.id,
      detailId: detail.id,
      applicantName: item.applicantName,
      status: item.status,
      location: item.location,
      pic: item.pic,
      rejectionReason: item.rejectionReason,
      detailHeading: detail.heading,
      description: detail.description,
      detailStatus: detail.status,
      detailAction: detail.action,
      detailLocation: detail.location,
      detailPic: detail.pic,
      detailRejectionReason: detail.rejectionReason,
      documents,
      images: pageImages,
      continuation: continuationIndex > 0,
      continuationIndex,
    }));
  });
});

export const recommendationVersionPath = (suratId, jobId) => `pdf/recommendations/${suratId}/versions/${jobId}.pdf`;

export const shouldRenderDirectPgd = (recommendation, pgdDocument) => !recommendation && pgdDocument;

const border = { style: "thin", color: { argb: "FFCBD5E1" } };

const prepareImage = async (buffer, maxWidth, maxHeight) => {
  const { default: sharp } = await import("sharp");
  const source = sharp(buffer, { failOn: "error" }).autoOrient();
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height) throw new Error("Dimensi gambar tidak dapat dibaca.");
  const scale = Math.min(maxWidth / metadata.width, maxHeight / metadata.height, 1);
  const width = Math.max(1, Math.round(metadata.width * scale));
  const height = Math.max(1, Math.round(metadata.height * scale));
  const output = await source.resize({ width, height, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  return { buffer: output, width, height };
};

export const appendRecommendationPages = async (workbook, items, downloadImage) => {
  const pages = buildRecommendationPagePlan(items);
  for (const [pageIndex, page] of pages.entries()) {
    const sheet = workbook.addWorksheet(`Rekomendasi ${pageIndex + 1}`, {
      pageSetup: {
        paperSize: 9,
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0, footer: 0 },
      },
    });
    sheet.columns = Array.from({ length: 12 }, () => ({ width: 8.5 }));
    sheet.mergeCells("A1:L1");
    sheet.getCell("A1").value = `ITEM ${page.itemNumber} - ${page.applicantName}`;
    sheet.getCell("A1").font = { name: "Arial", size: 15, bold: true, color: { argb: "FF17324D" } };
    sheet.getCell("A1").alignment = { vertical: "middle", wrapText: true };
    sheet.getRow(1).height = 28;
    sheet.mergeCells("A2:L2");
    const continuationLabel = page.continuation ? " (LANJUTAN)" : "";
    sheet.getCell("A2").value = page.showDetailNumber
      ? `DETAIL ${page.itemNumber}.${page.detailNumber}${continuationLabel} - ${page.detailHeading}`
      : `${page.detailHeading}${continuationLabel}`;
    sheet.getCell("A2").font = { name: "Arial", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF245B78" } };
    sheet.getCell("A2").alignment = { vertical: "middle", wrapText: true };
    sheet.getRow(2).height = 25;
    sheet.mergeCells("A3:L4");
    const documentText = page.documents.map((item) => `${item.name || "Dokumen"}${item.url ? `: ${item.url}` : ""}`).join(" | ");
    const rejected = isNotRecommended(page.status);
    const metadata = [
      `Status: ${recommendationStatusLabel(page.status || page.detailStatus)}`,
      !rejected && recommendationActionLabel(page.detailAction) ? `Tindakan: ${recommendationActionLabel(page.detailAction)}` : "",
      `Lokasi: ${text(page.detailLocation, page.location, "-")}`,
      `PIC: ${text(page.detailPic, page.pic, "-")}`,
      rejected ? `Alasan: ${text(page.rejectionReason, page.detailRejectionReason, "-")}` : "",
    ].filter(Boolean).join(" | ");
    sheet.getCell("A3").value = [metadata, rejected ? "" : page.description, documentText].filter(Boolean).join("\n");
    sheet.getCell("A3").alignment = { vertical: "top", wrapText: true };
    sheet.getCell("A3").font = { name: "Arial", size: 9, color: { argb: "FF334155" } };
    sheet.getRow(3).height = 25;
    sheet.getRow(4).height = 25;

    if (page.images.length === 0) {
      sheet.mergeCells("A5:L6");
      sheet.getCell("A5").value = "Tidak ada lampiran gambar.";
      sheet.getCell("A5").font = { name: "Arial", size: 9, italic: true, color: { argb: "FF64748B" } };
      sheet.getCell("A5").alignment = { horizontal: "center", vertical: "middle" };
      sheet.pageSetup.printArea = "A1:L7";
      continue;
    }

    for (let slot = 0; slot < page.images.length; slot += 1) {
      const singleImage = page.images.length === 1;
      const slotRow = Math.floor(slot / 2);
      const slotCol = slot % 2;
      const startRow = 5 + slotRow * 10;
      const startCol = singleImage ? 1 : slotCol === 0 ? 1 : 7;
      const endCol = singleImage ? 12 : startCol + 5;
      const endRow = singleImage ? 20 : startRow + 8;
      for (let row = startRow; row <= endRow; row += 1) sheet.getRow(row).height = 15;
      sheet.mergeCells(startRow, startCol, endRow, endCol);
      const imageCard = sheet.getCell(startRow, startCol);
      imageCard.border = { top: border, left: border, bottom: border, right: border };
      imageCard.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
      const attachment = page.images[slot];
      if (!attachment.url) throw new Error(`Sumber gambar ${attachment.name || attachment.id} tidak tersedia.`);
      let downloaded;
      try {
        downloaded = await downloadImage(attachment);
      } catch (error) {
        throw new Error(`Gagal mengunduh gambar ${attachment.name || attachment.id}: ${error.message}`);
      }
      let image;
      try {
        image = await prepareImage(downloaded, singleImage ? 620 : 310, singleImage ? 230 : 125);
      } catch (error) {
        throw new Error(`Gagal membaca gambar ${attachment.name || attachment.id}: ${error.message}`);
      }
      const imageId = workbook.addImage({ buffer: image.buffer, extension: "png" });
      const boxWidth = singleImage ? 620 : 310;
      const boxHeight = singleImage ? 230 : 125;
      const left = startCol - 1 + Math.max((boxWidth - image.width) / 64, 0);
      const top = startRow - 1 + Math.max((boxHeight - image.height) / 20, 0);
      sheet.addImage(imageId, { tl: { col: left, row: top }, ext: { width: image.width, height: image.height }, editAs: "oneCell" });
    }
    const usedImageRows = page.images.length === 1 ? 20 : 4 + Math.ceil(page.images.length / 2) * 10;
    sheet.pageSetup.printArea = `A1:L${Math.min(usedImageRows + 2, 33)}`;
  }
  return pages;
};

export const appendRecommendationPagesToFile = async (filePath, items, downloadImage) => {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const pages = await appendRecommendationPages(workbook, items, downloadImage);
  await workbook.xlsx.writeFile(filePath);
  return pages;
};
