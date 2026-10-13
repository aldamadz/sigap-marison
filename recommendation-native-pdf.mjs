import pdfMakeModule from "pdfmake/build/pdfmake.js";
import pdfFontsModule from "pdfmake/build/vfs_fonts.js";
import sharp from "sharp";
import { buildRecommendationPagePlan } from "./recommendation-pdf.mjs";
import { buildNativeSignatureBlock, loadLogoDataUrl, normalizeNativeSignatures } from "./pgd-pdf-renderer.mjs";
import { revisionHistoryEntries, revisionAppendixBlock } from "./document-revision-notes.mjs";

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

const buildMainPage = (data, logoDataUrl, totalPages) => {
  const rows = data.items.map((item, index) => {
    const rejected = isRejected(item.status);
    const markers = recommendationMarkers(item);
    return [
      { text: String(index + 1), alignment: "center" },
      { text: item.applicantName, bold: true, decoration: rejected ? "lineThrough" : undefined, color: rejected ? MUTED : BORDER },
      { text: text(item.registrationNumber, ""), alignment: "center" },
      { text: [item.location, item.pic].filter(Boolean).join(" / ") || "-" },
      { text: text(item.applicantNotes, "") },
      { text: markers.service, bold: true, alignment: "center", color: "#166534" },
      { text: markers.replace, bold: true, alignment: "center", color: "#166534" },
      { text: detailSummary(item), color: rejected ? REJECTED : BORDER },
      { text: itemNotes(item), color: rejected ? REJECTED : BORDER },
    ];
  });
  const minimumRows = 8;
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
        heights: [112],
        body: [[
          { text: [{ text: "Catatan :\n", bold: true }, { text: data.notes || "" }], margin: [4, 2, 4, 2] },
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

const buildImageGrid = (images) => {
  if (!images.length) return { text: "Tidak ada lampiran gambar.", italics: true, color: MUTED, alignment: "center", margin: [0, 30] };
  const rows = [];
  for (let index = 0; index < images.length; index += 2) {
    const pair = images.slice(index, index + 2).map((image) => ({
      stack: [
        { image: image.dataUrl, fit: [350, 180], alignment: "center" },
        { text: text(image.name, "Lampiran"), fontSize: 8, alignment: "center", margin: [0, 4, 0, 0] },
      ],
      margin: [4, 4, 4, 4],
    }));
    if (pair.length === 1) pair.push({ text: "" });
    rows.push(pair);
  }
  return { table: { widths: ["50%", "50%"], body: rows }, layout: borderLayout };
};

export const normalizeRecommendationDocumentData = (source = {}, options = {}) => {
  const location = source.location_snapshot || {};
  const input = source.form_input_data || source?.data_snapshot?.input || {};
  return {
    formNumber: text(location?.form?.nomor_form || source?.data_snapshot?.form?.nomor_form, "FM-UAI.HRD-30-00"),
    noSurat: text(source.no_surat, "DRAFT/UAI/REKOMENDASI"),
    revisionHistory: revisionHistoryEntries(source),
    placeDate: [text(source.request_place, ""), formatDateId(source.request_date)].filter(Boolean).join(", ") || "-",
    notes: text(input.catatan || source.notes, ""),
    items: Array.isArray(options.items) ? options.items : [],
    signatures: normalizeNativeSignatures(options.signatures, Number(options.targetStep || 0)),
  };
};

export const buildRecommendationDocumentDefinition = (data, pages, logoDataUrl = null) => ({
  pageSize: "A4",
  pageOrientation: "landscape",
  pageMargins: [18, 14, 18, 14],
  defaultStyle: { font: "Roboto", fontSize: 8, color: BORDER },
  content: [
    ...buildMainPage(data, logoDataUrl, 1 + pages.length),
    ...pages.flatMap((page) => {
      const rejected = isRejected(page.status || page.detailStatus);
      const detailLabel = page.showDetailNumber
        ? `${page.itemNumber}.${page.detailNumber} ${page.detailHeading}`
        : page.detailHeading;
      return [{
        pageBreak: "before",
        stack: [
          { text: `ITEM ${page.itemNumber} - ${page.applicantName}`, bold: true, fontSize: 15, color: "#17324d" },
          { text: `${detailLabel}${page.continuation ? " (LANJUTAN)" : ""}`, bold: true, fontSize: 12, color: "white", fillColor: "#245b78", margin: [0, 5, 0, 5] },
          {
            text: [
              `Status: ${rejected ? "Tidak direkomendasikan" : "Direkomendasikan"}`,
              rejected ? "" : `Tindakan: ${actionLabel(page.detailAction)}`,
              `Lokasi: ${text(page.detailLocation || page.location)}`,
              `PIC: ${text(page.detailPic || page.pic)}`,
            ].filter(Boolean).join(" | "),
            margin: [0, 0, 0, 4],
          },
          page.description ? { text: page.description, margin: [0, 0, 0, 4] } : { text: "" },
          page.documents.length
            ? { text: `Dokumen: ${page.documents.map((entry) => entry.name || "Lampiran").join(", ")}`, margin: [0, 0, 0, 5] }
            : { text: "" },
          buildImageGrid(page.images),
        ],
      }];
    }),
    ...revisionAppendixBlock(data.revisionHistory,data.noSurat),
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
  const definition = buildRecommendationDocumentDefinition(data, pages, logoDataUrl);
  const buffer = await pdfMake.createPdf(definition).getBuffer();
  return Buffer.from(buffer);
};
