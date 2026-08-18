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

const buildHeader = (data, logoDataUrl) => ({
  table: {
    widths: ["18%", "60%", "22%"],
    body: [[
      logoDataUrl
        ? { image: logoDataUrl, fit: [82, 30], alignment: "center", margin: [0, 6, 0, 0] }
        : { text: "MARISON\nREGENCY GROUP", bold: true, color: "#087b9c", alignment: "center", margin: [0, 8, 0, 0] },
      { text: "REKOMENDASI PEREMAJAAN BARANG / ALAT KERJA", bold: true, fontSize: 13, alignment: "center", margin: [0, 10, 0, 0] },
      {
        table: {
          widths: ["48%", "52%"],
          body: [
            [{ text: "No. Form", bold: true }, { text: data.formNumber, bold: true, alignment: "center" }],
            [{ text: "Berlaku", bold: true }, { text: "1 Januari 2024", alignment: "center" }],
            [{ text: "Halaman", bold: true }, { text: "Dinamis", alignment: "center" }],
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
    const prefix = item.details.length > 1 ? `${index + 1}. ` : "";
    return `${prefix}${text(detail.heading)} - ${actionLabel(detail.action)}${detail.description ? `: ${detail.description}` : ""}`;
  }).join("\n");
};

const buildMainPage = (data, logoDataUrl) => {
  const rows = data.items.map((item, index) => {
    const rejected = isRejected(item.status);
    return [
      { text: String(index + 1), alignment: "center" },
      { text: item.applicantName, bold: true, decoration: rejected ? "lineThrough" : undefined, color: rejected ? MUTED : BORDER },
      { text: [item.location, item.pic].filter(Boolean).join(" / ") || "-" },
      { text: rejected ? "Tidak direkomendasikan" : "Direkomendasikan", bold: true, color: rejected ? REJECTED : "#166534" },
      { text: detailSummary(item), color: rejected ? REJECTED : BORDER },
    ];
  });

  return [
    buildHeader(data, logoDataUrl),
    {
      table: {
        widths: ["22%", "78%"],
        body: [
          [{ text: "Nomor Dokumen", bold: true }, { text: data.noSurat, bold: true }],
          [{ text: "Tempat, tanggal", bold: true }, { text: data.placeDate }],
        ],
      },
      layout: borderLayout,
      margin: [0, 4, 0, 4],
    },
    {
      text: "Menindaklanjuti hasil pemeriksaan, berikut rekomendasi peremajaan barang / alat kerja:",
      margin: [0, 0, 0, 4],
    },
    {
      table: {
        headerRows: 1,
        widths: ["4%", "22%", "18%", "16%", "40%"],
        body: [
          ["No.", "Barang / alat kerja", "Lokasi / PIC", "Status", "Hasil rekomendasi"].map((label) => ({
            text: label,
            bold: true,
            alignment: "center",
            fillColor: GREEN,
          })),
          ...rows,
        ],
      },
      layout: borderLayout,
    },
    { text: "", margin: [0, 4] },
    buildNativeSignatureBlock(data.signatures),
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
  return {
    formNumber: text(location?.form?.nomor_form || source?.data_snapshot?.form?.nomor_form, "FM-UAI.HRD-30-00"),
    noSurat: text(source.no_surat, "DRAFT/UAI/REKOMENDASI"),
    placeDate: [text(source.request_place, ""), formatDateId(source.request_date)].filter(Boolean).join(", ") || "-",
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
    ...buildMainPage(data, logoDataUrl),
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
