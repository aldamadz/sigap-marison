import pdfMakeModule from "pdfmake/build/pdfmake.js";
import pdfFontsModule from "pdfmake/build/vfs_fonts.js";
import sharp from "sharp";
import { buildRecommendationPagePlan } from "./recommendation-pdf.mjs";
import { buildNativeSignatureBlock, loadLogoDataUrl, normalizeNativeSignatures } from "./pgd-pdf-renderer.mjs";

const pdfMake = pdfMakeModule?.default || pdfMakeModule;
pdfMake.vfs = pdfFontsModule?.default || pdfFontsModule;

const BORDER = "#111827";
const GREEN = "#e2f0d9";
const MUTED = "#475569";
const REJECTED = "#9a3412";

const text = (value, fallback = "-") => {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
};

const isRejected = (value) => /not[\s_-]*recommended|tidak[\s_-]*direkomendasikan|rejected|ditolak/i.test(String(value || ""));

const formatDateId = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text(value, "");
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(date);
};

const actionLabel = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["purchase_new", "beli_baru", "beli baru"].includes(normalized)) return "Pembelian baru";
  if (["replace", "replacement", "ganti"].includes(normalized)) return "Penggantian";
  if (["service", "servis"].includes(normalized)) return "Servis";
  return text(value, "-");
};

const borderLayout = {
  hLineWidth: () => 0.7,
  vLineWidth: () => 0.7,
  hLineColor: () => BORDER,
  vLineColor: () => BORDER,
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 3,
  paddingBottom: () => 3,
};

const imageDataUrl = async (buffer) => {
  const png = await sharp(buffer, { failOn: "error" })
    .autoOrient()
    .resize({ width: 1000, height: 720, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
};

const buildHeader = (data, logoDataUrl, totalPages) => ({
  table: {
    widths: ["13%", "59%", "28%"],
    body: [[
      logoDataUrl
        ? { image: logoDataUrl, fit: [82, 30], alignment: "center", margin: [0, 6, 0, 0] }
        : { text: "MARISON\nREGENCY GROUP", bold: true, color: "#087b9c", alignment: "center", margin: [0, 8, 0, 0] },
      { text: "REKOMENDASI PEREMAJAAN BARANG / ALAT KERJA", bold: true, fontSize: 13, alignment: "center", margin: [0, 10, 0, 0] },
      {
        table: {
          widths: ["48%", "52%"],
          body: [
            [{ text: "No form", bold: true }, { text: data.formNumber, bold: true, alignment: "center" }],
            [{ text: "Berlaku tanggal", bold: true }, { text: "01 Januari 2024", alignment: "center" }],
            [{ text: "Halaman", bold: true }, { text: `1 dari ${totalPages}`, alignment: "center" }],
          ],
        },
        layout: borderLayout,
      },
    ]],
  },
  layout: borderLayout,
});

const detailSummary = (item) => {
  if (isRejected(item.status)) return `Tidak direkomendasikan: ${text(item.rejectionReason, "Tanpa alasan")}`;
  return item.details.map((detail, index) => {
    const action = actionLabel(detail.action);
    const heading = text(detail.heading, "");
    const description = text(detail.description, "");
    const prefix = item.details.length > 1 ? `${index + 1}. ` : "";
    const sameAsParent = heading.localeCompare(text(item.applicantName, ""), "id", { sensitivity: "base" }) === 0;
    const repeatedDefault = description.localeCompare(action, "id", { sensitivity: "base" }) === 0;
    const subject = sameAsParent ? "" : `${heading}${heading && action ? " - " : ""}`;
    return `${prefix}${subject}${action}${description && !repeatedDefault ? `${action ? ": " : ""}${description}` : ""}`;
  }).join("\n");
};

const recommendationMarkers = (item) => {
  if (isRejected(item.status)) return { service: "", replace: "" };
  const actions = new Set(item.details.map((detail) => String(detail.action || "").trim().toLowerCase()));
  return {
    service: actions.has("service") || actions.has("servis") ? "V" : "",
    replace: actions.has("replace") || actions.has("replacement") || actions.has("ganti") ? "V" : "",
  };
};

const itemNotes = (item) => {
  if (isRejected(item.status)) return text(item.rejectionReason, "Tanpa alasan");
  return item.details.map((detail) => text(detail.notes, "")).filter(Boolean).join("\n");
};

const compactText = (value, limit = 160) => {
  const valueText = text(value, "").replace(/\s+/g, " ");
  return valueText.length > limit ? `${valueText.slice(0, limit).trimEnd()}... (lihat rincian)` : valueText;
};

const needsItemDetails = (item) => [
  [item.applicantName, 100], [item.registrationNumber, 60], [item.location, 80],
  [item.pic, 80], [item.applicantNotes, 160], [detailSummary(item), 220], [itemNotes(item), 160],
].some(([value, limit]) => text(value, "").length > limit || text(value, "").split(/\r?\n/).length > 4);

const compactRecommendation = (item, index) => {
  const summary = detailSummary(item);
  if (summary.length <= 220) return compactText(summary, 220);
  const actions = new Map();
  for (const detail of item.details) {
    const label = actionLabel(detail.action);
    actions.set(label, (actions.get(label) || 0) + 1);
  }
  return `${item.details.length} rincian (${[...actions].map(([label, count]) => `${label}: ${count}`).join(", ")}).\nLihat rincian item ${index + 1} pada halaman lanjutan.`;
};

const expandedItemBlocks = (data) => data.items.flatMap((item, index) => needsItemDetails(item) ? [{
  pageBreak: "before",
  stack: [
    { text: "RINCIAN REKOMENDASI", bold: true, fontSize: 14, color: "#17324d", margin: [0, 0, 0, 8] },
    { text: `ITEM ${index + 1} - ${item.applicantName}`, bold: true, fontSize: 11 },
    { text: `No. registrasi: ${text(item.registrationNumber)} | Lokasi: ${text(item.location)} | PIC: ${text(item.pic)}`, margin: [0, 5, 0, 5] },
    { text: [{ text: "Kerusakan / catatan pemohon: ", bold: true }, { text: text(item.applicantNotes) }], margin: [0, 0, 0, 8] },
    ...(isRejected(item.status)
      ? [{ text: `Tidak direkomendasikan: ${text(item.rejectionReason)}`, color: REJECTED }]
      : item.details.map((detail, detailIndex) => ({
        unbreakable: [detail.heading, detail.description, detail.notes].join(" ").length < 800,
        stack: [
          { text: `${index + 1}.${detailIndex + 1} ${text(detail.heading)}`, bold: true, color: "#17324d", margin: [0, 5, 0, 2] },
          { text: `Tindakan: ${actionLabel(detail.action)}` },
          ...(text(detail.description, "").localeCompare(actionLabel(detail.action), "id", { sensitivity: "base" }) === 0
            ? [] : [{ text: text(detail.description, ""), margin: [0, 2, 0, 0] }]),
          { text: [{ text: "Catatan pemeriksa: ", bold: true }, { text: text(detail.notes) }], margin: [0, 2, 0, 2] },
        ],
      }))),
  ],
  fontSize: 9,
}] : []);

const buildMainPage = (data, logoDataUrl, totalPages) => {
  const rows = data.items.map((item, index) => {
    const rejected = isRejected(item.status);
    const markers = recommendationMarkers(item);
    return [
      { text: String(index + 1), alignment: "center" },
      { text: compactText(item.applicantName, 100), bold: true, decoration: rejected ? "lineThrough" : undefined, color: rejected ? MUTED : BORDER },
      { text: compactText(item.registrationNumber, 60), alignment: "center" },
      { text: [compactText(item.location, 80), compactText(item.pic, 80)].filter(Boolean).join(" / ") || "-" },
      { text: compactText(item.applicantNotes) },
      { text: markers.service, bold: true, alignment: "center", color: "#166534" },
      { text: markers.replace, bold: true, alignment: "center", color: "#166534" },
      { text: rejected ? compactText(detailSummary(item), 220) : compactRecommendation(item, index), color: rejected ? REJECTED : BORDER },
      { text: itemNotes(item).length > 160 ? `Catatan per rincian item ${index + 1} pada halaman lanjutan.` : compactText(itemNotes(item)), color: rejected ? REJECTED : BORDER },
    ];
  });
  const minimumRows = data.items.some(needsItemDetails) ? rows.length :
    data.signatures.length >= 7 ? Math.max(rows.length, 4) : 8;
  while (rows.length < minimumRows) {
    rows.push([
      { text: String(rows.length + 1), alignment: "center" },
      ...Array.from({ length: 8 }, () => ({ text: "" })),
    ]);
  }

  return [
    buildHeader(data, logoDataUrl, totalPages),
    {
      table: {
        widths: ["20%", "80%"],
        body: [[{ text: "Nomor Dokumen :", bold: true }, { text: data.noSurat, bold: true }]],
      },
      layout: borderLayout,
      margin: [0, 4, 0, 0],
    },
    {
      table: {
        widths: ["*"],
        body: [[{ text: "Menindaklanjuti hasil perbaikan kami rekomendasikan dilakukan peremajaan barang / alat kerja sebagai berikut :" }]],
      },
      layout: borderLayout,
    },
    {
      table: {
        headerRows: 2,
        dontBreakRows: true,
        widths: ["3%", "23%", "8%", "16%", "13%", "5%", "5%", "14%", "13%"],
        heights: (row) => row < 2 ? 15 : 22,
        body: [
          [
            { text: "NO.", rowSpan: 2, bold: true, alignment: "center", fillColor: GREEN, margin: [0, 8, 0, 0] },
            { text: "NAMA BARANG / ALAT KERJA", rowSpan: 2, bold: true, alignment: "center", fillColor: GREEN, margin: [0, 8, 0, 0] },
            { text: "NO\nREGISTRASI", rowSpan: 2, bold: true, alignment: "center", fillColor: GREEN },
            { text: "LOKASI / PIC", rowSpan: 2, bold: true, alignment: "center", fillColor: GREEN, margin: [0, 8, 0, 0] },
            { text: "KERUSAKAN", rowSpan: 2, bold: true, alignment: "center", fillColor: GREEN, margin: [0, 8, 0, 0] },
            { text: "HASIL REKOMENDASI", colSpan: 3, bold: true, alignment: "center", fillColor: GREEN }, {}, {},
            { text: "KETERANGAN", rowSpan: 2, bold: true, alignment: "center", fillColor: GREEN, margin: [0, 8, 0, 0] },
          ],
          [{}, {}, {}, {}, {}, "SERVICE", "GANTI", "URAIAN", {}].map((cell) => typeof cell === "string"
            ? { text: cell, bold: true, alignment: "center", fillColor: GREEN }
            : cell),
          ...rows,
        ],
      },
      layout: borderLayout,
    },
    {
      table: {
        widths: ["72%", "28%"],
        dontBreakRows: true,
        heights: [112],
        body: [[
          { text: [{ text: "Catatan :\n", bold: true }, { text: compactText(data.notes) }], margin: [4, 2, 4, 2] },
          {
            stack: [
              { text: data.placeDate, alignment: "center", margin: [0, 0, 0, 2] },
              buildNativeSignatureBlock(data.signatures),
            ],
          },
        ]],
      },
      layout: borderLayout,
    },
  ];
};

const attachmentField = (label, value) => ({
  stack: [
    { text: label, color: MUTED, fontSize: 8, margin: [0, 0, 0, 2] },
    { text: text(value), fontSize: 9 },
  ],
  margin: [0, 0, 0, 8],
});

const buildAttachmentCards = (data, pages) => pages.flatMap((page) => {
  const item = data.items.find((entry) => entry.id === page.itemId);
  const detail = item?.details.find((entry) => entry.id === page.detailId);
  const pairs = page.images.length
    ? Array.from({ length: Math.ceil(page.images.length / 2) }, (_, index) => page.images.slice(index * 2, index * 2 + 2))
    : [[]];
  return pairs.map((images, pairIndex) => {
    const continuation = page.continuation || pairIndex > 0;
    const label = page.showDetailNumber ? `${page.itemNumber}.${page.detailNumber}` : String(page.itemNumber);
    const notes = detail?.notes || page.detailRejectionReason;
    const parentValue = (value, limit) => item && needsItemDetails(item)
      && (text(value, "").length > limit || text(value, "").split(/\r?\n/).length > 4)
      ? `${compactText(value, limit).replace(/\.\.\. \(lihat rincian\)$/, "...")} (Rincian Rekomendasi, item ${page.itemNumber})` : text(value);
    const location = [parentValue(page.detailLocation || page.location, 80), parentValue(page.detailPic || page.pic, 80)].join(" / ");
    const applicantName = parentValue(page.applicantName, 100);
    const registrationNumber = parentValue(item?.registrationNumber, 60);
    const applicantNotes = parentValue(item?.applicantNotes, 160);
    const action = isRejected(page.status || page.detailStatus) ? "Tidak direkomendasikan" : actionLabel(page.detailAction);
    const values = [applicantName, page.detailHeading, location, registrationNumber,
      applicantNotes, page.description, notes, ...page.documents.map(entry => entry.name), ...images.map(entry => entry.name)];
    // Oversized narrative must flow; an unbreakable row taller than a page loses text.
    const compact = values.join(" ").length < 1600 && values.join("\n").split(/\r?\n/).length < 24;
    return {
      id: `recommendation-attachment-${page.itemNumber}-${page.detailNumber}-${page.continuationIndex}-${pairIndex}`,
      unbreakable: compact,
      margin: [0, 0, 0, 10],
      table: {
        widths: [126, "*"],
        dontBreakRows: compact,
        body: [[
          {
            stack: images.length ? images.map(image => ({
              unbreakable: text(image.name, "").length < 200,
              stack: [
                ...(image.dataUrl ? [{ image: image.dataUrl, fit: [114, 100], alignment: "center" }] : []),
                { text: text(image.name, "Lampiran"), fontSize: 7, color: MUTED, margin: [0, 4, 0, 0] },
              ],
              margin: [0, 0, 0, 8],
            })) : [{ text: "Lampiran dokumen", fontSize: 8, color: MUTED }],
          },
          { stack: [
            { text: `Item ${label}  |  ${action}${continuation ? "  |  LANJUTAN" : ""}`, color: MUTED, fontSize: 8, margin: [0, 0, 0, 6] },
            { text: applicantName, bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
            { text: text(page.detailHeading), bold: true, fontSize: 11, margin: [0, 0, 0, 10] },
            { columns: [attachmentField("Lokasi / PIC", location), attachmentField("No. registrasi", registrationNumber)], columnGap: 18 },
            { columns: [attachmentField("Kerusakan / catatan pemohon", applicantNotes), attachmentField("Rekomendasi", action)], columnGap: 18 },
            { columns: [attachmentField("Uraian", page.description), attachmentField("Keterangan", notes)], columnGap: 18 },
            ...(page.documents.length && !continuation ? [attachmentField("Dokumen pendukung", page.documents.map(entry => text(entry.name, "Lampiran")).join("\n"))] : []),
          ] },
        ]],
      },
      layout: {
        ...borderLayout,
        hLineColor: () => "#cbd5e1",
        vLineWidth: (index) => index === 1 ? 0 : 0.6,
        vLineColor: () => "#cbd5e1",
        fillColor: () => "#f8fafc",
        paddingLeft: () => 10, paddingRight: () => 10,
        paddingTop: () => 10, paddingBottom: () => 10,
      },
    };
  });
});

export const normalizeRecommendationDocumentData = (source = {}, options = {}) => {
  const location = source.location_snapshot || {};
  const input = source.form_input_data || source?.data_snapshot?.input || {};
  return {
    formNumber: text(location?.form?.nomor_form || source?.data_snapshot?.form?.nomor_form, "FM-UAI.HRD-30-00"),
    noSurat: text(source.no_surat, "DRAFT/UAI/REKOMENDASI"),
    placeDate: [text(source.request_place, ""), formatDateId(source.request_date)].filter(Boolean).join(", ") || "-",
    notes: text(input.catatan || source.notes, ""),
    items: Array.isArray(options.items) ? options.items : [],
    signatures: normalizeNativeSignatures(options.signatures, Number(options.targetStep || 0)),
  };
};

export const buildRecommendationDocumentDefinition = (data, pages, logoDataUrl = null, totalPages = 1 + pages.length) => ({
  pageSize: "A4",
  pageOrientation: "landscape",
  pageMargins: [18, 14, 18, 14],
  defaultStyle: { font: "Roboto", fontSize: 8, color: BORDER },
  footer: (page, total) => ({ text: `Halaman ${page} dari ${total}`, fontSize: 7, alignment: "right", margin: [18, 0, 18, 0] }),
  content: [
    ...buildMainPage(data, logoDataUrl, totalPages),
    ...(data.notes?.length > 160 || String(data.notes || "").split(/\r?\n/).length > 4 ? [{ pageBreak: "before", stack: [
      { text: "CATATAN PENGAJUAN", bold: true, fontSize: 14, margin: [0, 0, 0, 8] },
      { text: data.notes, fontSize: 9 },
    ] }] : []),
    ...expandedItemBlocks(data),
    ...(pages.length ? [{
      id: "recommendation-attachments", pageBreak: "before",
      stack: [
        { text: "LAMPIRAN REKOMENDASI", bold: true, fontSize: 13, margin: [0, 0, 0, 4] },
        { text: data.noSurat, fontSize: 8, color: MUTED, margin: [0, 0, 0, 12] },
        ...buildAttachmentCards(data, pages),
      ],
    }] : []),
  ],
});

export const renderRecommendationPdf = async (data, options = {}) => {
  const plans = buildRecommendationPagePlan(data.items);
  const pages = [];
  for (const plan of plans) {
    const images = [];
    for (const attachment of plan.images) {
      if (!attachment.url) throw new Error(`Sumber gambar ${attachment.name || attachment.id} tidak tersedia.`);
      const buffer = await options.downloadImage(attachment);
      images.push({ ...attachment, dataUrl: await imageDataUrl(buffer) });
    }
    pages.push({ ...plan, images });
  }
  const logoDataUrl = options.logoDataUrl || await loadLogoDataUrl(options.logoPath);
  let expectedPages = 1 + pages.length;
  // Layout may add pages for long text or photos. Rebuild from fresh
  // nodes with the actual total; pdfmake mutates the first definition during layout.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const definition = buildRecommendationDocumentDefinition(data, pages, logoDataUrl, expectedPages);
    const footer = definition.footer;
    let actualPages = expectedPages;
    definition.footer = (page, total) => { actualPages = total; return footer(page, total); };
    const buffer = await pdfMake.createPdf(definition).getBuffer();
    if (actualPages === expectedPages) return Buffer.from(buffer);
    expectedPages = actualPages;
  }
  throw new Error("Penomoran halaman rekomendasi belum stabil.");
};
