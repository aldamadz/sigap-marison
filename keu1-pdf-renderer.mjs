import { readFile } from "node:fs/promises";
import { signerRevisionNotes, revisionNotesBlock } from "./document-revision-notes.mjs";
import pdfMakeModule from "pdfmake/build/pdfmake.js";
import pdfFontsModule from "pdfmake/build/vfs_fonts.js";
import {
  buildNativeSignatureBlock,
  isNativeDocumentRejected,
  loadLogoDataUrl,
  nativeDocumentRejectionBlock,
  normalizeNativeSignatures,
} from "./pgd-pdf-renderer.mjs";

const pdfMake = pdfMakeModule?.default || pdfMakeModule;
pdfMake.vfs = pdfFontsModule?.default || pdfFontsModule;

const GREEN = "#e2f0d9";
const HEADER_TINT = "#f7faf5";
const BORDER = "#111827";
const MUTED = "#475569";

const text = (value, fallback = "-") => {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
};

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

const parseMoney = (value) => {
  const raw = String(value ?? "").replace(/[^\d]/g, "");
  const amount = Number(raw);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : 0;
};

const formatMoneyId = (value) => {
  const amount = parseMoney(value);
  return `Rp ${amount.toLocaleString("id-ID")}`;
};

const asObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

const KEU1_FORM_NUMBER = "FM-UAI.KEU-01-00";

export const isKeu1Document = (source = {}) => {
  const names = [
    source.formName,
    source?.location_snapshot?.form?.nama_form,
    source?.location_snapshot?.form?.nomor_form,
    source?.data_snapshot?.form?.nama_form,
    source?.data_snapshot?.form?.nomor_form,
    source?.resolved_master_form?.nama_form,
    source?.resolved_master_form?.nomor_form,
  ].map((value) => String(value || "").toUpperCase());
  return names.some((name) => [KEU1_FORM_NUMBER, "FORM PENGAJUAN KAS KECIL"].includes(name.trim()));
};

export const resolveKeu1MasterForm = async (client, formUsageId) => {
  if (!formUsageId) return null;
  const { data: usage, error: usageError } = await client
    .from("form_usages")
    .select("id, form_id, master_forms(id, nama_form, nomor_form)")
    .eq("id", formUsageId)
    .maybeSingle();
  if (usageError) throw usageError;
  if (!usage || !usage.form_id || !usage.master_forms) return null;
  return Array.isArray(usage.master_forms) ? usage.master_forms[0] : usage.master_forms;
};

const normalizeKeu1Item = (row, index) => {
  const record = asObject(row);
  const quantity = Number(record.jumlah ?? record.quantity ?? record.qty ?? 1);
  const safeQuantity = Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1;
  const rawUnitPrice = record.estimasi_harga_satuan ?? record.harga_satuan ?? record.unit_price ?? record.nominal;
  const hasUnitPrice = rawUnitPrice != null && String(rawUnitPrice).trim() !== "";
  const unitPrice = parseMoney(rawUnitPrice);
  const total = safeQuantity * unitPrice;
  return {
    no: index + 1,
    keterangan: text(record.keterangan ?? record.nama_barang ?? record.name ?? record.description ?? record.item_name, ""),
    jumlah: safeQuantity,
    satuan: text(record.satuan ?? record.sat ?? record.unit, ""),
    hargaSatuan: unitPrice,
    hasUnitPrice,
    total,
  };
};

const signaturePlaceForOffice = (office, fallbackName) => {
  const name = text(office.name || fallbackName, "");
  if (String(office.kedudukan || "").toLowerCase() === "pusat" || /^kantor pusat\b/i.test(name)) {
    return "Magelang";
  }
  return text(name.replace(/^(?:kantor\s+cabang|kcp\.?|kc\.?|cabang)\s*/i, "").trim(), "-");
};

export const normalizeKeu1DocumentData = (source = {}, options = {}) => {
  const input = source.form_input_data || source?.data_snapshot?.input || {};
  const location = source.location_snapshot || {};
  const items = Array.isArray(input.items)
    ? input.items.filter((row) => row && typeof row === "object" && !Array.isArray(row))
    : [];
  const normalizedItems = items.map(normalizeKeu1Item);
  const grandTotal = normalizedItems.reduce((sum, item) => sum + item.total, 0);
  const rawPreviousFreeCash = input.free_cash_sisa_bulan_lalu ?? input.sisa_bulan_lalu;
  const hasPreviousFreeCash = rawPreviousFreeCash != null && String(rawPreviousFreeCash).trim() !== "";
  const previousFreeCash = parseMoney(rawPreviousFreeCash);
  const kebutuhanDana = Math.max(0, grandTotal - previousFreeCash);
  const targetStep = Number(options.targetStep || 0);
  const signatures = normalizeNativeSignatures(options.signatures, targetStep);
  const office = location.office || {};
  const isPusat = String(office.kedudukan || "").toLowerCase() === "pusat";
  const officeName = text(office.name || source.office_name, "-");
  return {
    formNumber: text(location?.form?.nomor_form || source?.data_snapshot?.form?.nomor_form || source?.resolved_master_form?.nomor_form, "FM-UAI.KEU-01-00"),
    revisionNotes: signerRevisionNotes(source),
    isRejected: isNativeDocumentRejected(source, signatures, targetStep),
    noSurat: text(source.no_surat, "DRAFT/UAI/KEU/VI/2026"),
    branch: officeName,
    signaturePlace: signaturePlaceForOffice(office, source.office_name),
    locationLabel: isPusat ? "Departemen" : "Cabang",
    locationValue: isPusat
      ? text(location?.department?.name || source.department_name, "-")
      : officeName,
    requestDate: formatDateId(source.request_date),
    department: text(location?.department?.name || source.department_name, "-"),
    items: normalizedItems,
    grandTotal,
    previousFreeCash,
    hasPreviousFreeCash,
    kebutuhanDana,
    notes: text(input.catatan || source.notes, ""),
    signatures,
  };
};

export const createKeu1PreviewData = (options = {}) => {
  const total = Math.min(Math.max(Number(options.signature_count || 4), 2), 8);
  const roles = Array.isArray(options.signature_roles) ? options.signature_roles : [1, 2, 1];
  const roleNames = ["Membuat", "Memeriksa", "Menyetujui"];
  const jobs = {
    Membuat: ["Staff Departemen"],
    Memeriksa: ["BM Cabang", "Manager HRD & GA"],
    Menyetujui: ["Manager Keuangan"],
  };
  const signatures = roleNames.flatMap((role, roleIndex) =>
    Array.from({ length: Number(roles[roleIndex] || 0) }, (_item, index) => ({
      stepOrder: 1,
      role,
      name: `${role.toUpperCase()} ${index + 1}`,
      job: jobs[role][index] || role,
      signed: false,
      signedAt: null,
    }))
  ).slice(0, total).map((signature, index) => ({ ...signature, stepOrder: index + 1 }));
  return {
    formNumber: "FM-UAI.KEU-01-00",
    noSurat: "001/UAI/KEU/VI/2026",
    branch: "Cabang Jepara",
    signaturePlace: "Jepara",
    locationLabel: "Cabang",
    locationValue: "Cabang Jepara",
    requestDate: "1 Juli 2026",
    department: "Keuangan & Akuntansi",
    items: [
      { no: 1, keterangan: "Listrik kantor", jumlah: 1, satuan: "Bulan", hargaSatuan: 1_000_000, total: 1_000_000 },
      { no: 2, keterangan: "Keamanan", jumlah: 1, satuan: "Bulan", hargaSatuan: 500_000, total: 500_000 },
      { no: 3, keterangan: "BPJS Kesehatan", jumlah: 1, satuan: "Bulan", hargaSatuan: 750_000, total: 750_000 },
    ],
    grandTotal: 2_250_000,
    previousFreeCash: 0,
    hasPreviousFreeCash: false,
    kebutuhanDana: 2_250_000,
    notes: "Contoh pratinjau template KEU 1.",
    signatures,
  };
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

const compactBorderLayout = {
  ...borderLayout,
  paddingLeft: () => 3,
  paddingRight: () => 3,
  paddingTop: () => 1,
  paddingBottom: () => 1,
};

const metadataLayout = {
  ...compactBorderLayout,
  hLineWidth: (index) => index === 1 ? 0 : 0.7,
  vLineWidth: (index) => index === 0 || index === 4 ? 0.7 : 0,
};

const summaryLayout = {
  ...compactBorderLayout,
  hLineWidth: (index, node) => index === 0 || index === node.table.body.length ? 0.7 : 0,
  vLineWidth: () => 0.7,
};

const headerCell = (value) => ({ text: value, bold: true, alignment: "center", fillColor: GREEN, margin: [0, 2, 0, 2] });
const itemCell = (value, alignment = "center", extra = {}) => ({ text: text(value, ""), alignment, fontSize: 8, margin: [0, 0, 0, 0], ...extra });
const moneyCell = (value, visible = true) => itemCell(visible ? formatMoneyId(value) : "", "right");

export const buildKeu1DocumentDefinition = (data, logoDataUrl = null) => {
  const items = Array.from({ length: 12 }, (_item, index) => ({
    no: "",
    keterangan: "",
    jumlah: "",
    satuan: "",
    hargaSatuan: null,
    total: null,
    ...(data.items[index] || {}),
  }));
  const summaryRows = [[
    { text: "GRAND TOTAL", bold: true, alignment: "left", margin: [0, 2, 0, 2] },
    { text: formatMoneyId(data.grandTotal), bold: true, alignment: "right" },
  ]];
  if (data.hasPreviousFreeCash ?? (data.previousFreeCash != null && data.previousFreeCash !== 0)) {
    summaryRows.push([
      { text: "Free Cash Sisa Bulan Lalu", alignment: "left", margin: [0, 2, 0, 2], color: MUTED },
      { text: formatMoneyId(data.previousFreeCash), alignment: "right", color: MUTED },
    ]);
  }
  summaryRows.push([
    { text: "KEBUTUHAN DANA", bold: true, alignment: "left", margin: [0, 2, 0, 2], fillColor: GREEN },
    { text: formatMoneyId(data.kebutuhanDana), bold: true, alignment: "right", fillColor: GREEN },
  ]);
  return {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [18, 12, 18, 12],
    defaultStyle: { font: "Roboto", fontSize: 9, color: BORDER },
    content: [
      {
        table: {
          widths: ["18%", "52%", "30%"],
          body: [[
            logoDataUrl ? { image: logoDataUrl, fit: [82, 30], alignment: "center", margin: [0, 6, 0, 0], fillColor: HEADER_TINT } : { text: "MARISON\nREGENCY GROUP", bold: true, color: "#087b9c", alignment: "center", margin: [0, 8, 0, 0], fillColor: HEADER_TINT },
            { text: "FORM PENGAJUAN KAS KECIL", bold: true, fontSize: 12, alignment: "center", margin: [0, 10, 0, 0], fillColor: HEADER_TINT },
            {
              table: {
                widths: ["42%", "58%"],
                body: [
                  [{ text: "No. Formulir", bold: true, fontSize: 8, fillColor: HEADER_TINT }, { text: data.formNumber, bold: true, fontSize: 8, alignment: "center", fillColor: HEADER_TINT }],
                  [{ text: "Halaman", bold: true, fillColor: HEADER_TINT }, { text: "1 Dari 1", bold: true, alignment: "center", fillColor: HEADER_TINT }],
                  [{ text: "Berlaku Efektif", bold: true, fillColor: HEADER_TINT }, { text: "1 Januari 2024", bold: true, alignment: "center", fillColor: HEADER_TINT }],
                ],
              },
              layout: borderLayout,
            },
          ]],
        },
        layout: compactBorderLayout,
      },
      {
        table: {
          widths: ["25%", "35%", "15%", "25%"],
          body: [
            [
              { text: data.locationLabel, bold: true },
              { text: `: ${data.locationValue}` },
              { text: "Tanggal", bold: true, alignment: "right" },
              { text: `: ${data.requestDate}` },
            ],
            [
              { text: "No. Dokumen", bold: true },
              { text: `: ${data.noSurat}`, bold: true },
              { text: "", colSpan: 2 },
              {},
            ],
          ],
        },
        layout: metadataLayout,
      },
      {
        table: {
          widths: ["*"],
          body: [[{
            text: "Mohon pengajuan kas kecil dengan rincian sebagai berikut :",
            margin: [4, 2, 4, 2],
          }]],
        },
        layout: compactBorderLayout,
      },
      {
        table: {
          headerRows: 1,
          widths: ["6%", "38%", "10%", "10%", "18%", "18%"],
          heights: (row) => row === 0 ? 12 : 9,
          body: [
            ["No", "Keterangan", "Jumlah", "Satuan", "Estimasi Harga Satuan", "Total"].map(headerCell),
            ...items.map((item) => [
              itemCell(item.keterangan || item.satuan || Number(item.jumlah) > 1 || item.hasUnitPrice ? item.no : ""),
              itemCell(item.keterangan, "left"),
              itemCell(typeof item.jumlah === "number" ? item.jumlah.toLocaleString("id-ID") : item.jumlah),
              itemCell(item.satuan),
              moneyCell(item.hargaSatuan, item.hasUnitPrice ?? item.hargaSatuan != null),
              moneyCell(item.total, item.hasUnitPrice ?? item.total != null),
            ]),
          ],
        },
        layout: compactBorderLayout,
      },
      {
        table: {
          widths: ["82%", "18%"],
          body: summaryRows,
        },
        layout: summaryLayout,
      },
      {
        table: {
          widths: ["*"],
          heights: [30],
          body: [[{
            text: [{ text: "Catatan :\n", bold: true }, { text: data.notes || "-" }],
            alignment: "left",
            margin: [4, 2, 4, 2],
          }]],
        },
        layout: compactBorderLayout,
        margin: [0, 3, 0, 3],
      },
      ...nativeDocumentRejectionBlock(data.isRejected),
      ...revisionNotesBlock(data.revisionNotes),
      {
        columns: [
          { width: "55%", text: "" },
          {
            width: "45%",
            stack: [
              {
                table: {
                  widths: ["*"],
                  body: [[{ text: data.requestDate ? `${data.signaturePlace || data.branch}, ${data.requestDate}` : data.signaturePlace || data.branch, alignment: "center" }]],
                },
                layout: compactBorderLayout,
              },
              buildNativeSignatureBlock(data.signatures),
            ],
          },
        ],
      },
    ],
  };
};

export const renderKeu1Pdf = async (data, options = {}) => {
  const logoDataUrl = options.logoDataUrl || await loadLogoDataUrl(options.logoPath);
  const definition = buildKeu1DocumentDefinition(data, logoDataUrl);
  const buffer = await pdfMake.createPdf(definition).getBuffer();
  return Buffer.from(buffer);
};
