import pdfMakeModule from "pdfmake/build/pdfmake.js";
import { itemQuantityTotal, parseItemQuantity } from "@sigap/shared";
import { signerRevisionNotes, revisionHistoryEntries, revisionAppendixBlock } from "./document-revision-notes.mjs";
import pdfFontsModule from "pdfmake/build/vfs_fonts.js";
import { normalizeKeu1DocumentData } from "./keu1-pdf-renderer.mjs";
import {
  buildNativeSignatureBlock,
  isNativeDocumentRejected,
  loadLogoDataUrl,
  nativeDocumentRejectionBlock,
  normalizeNativeSignatures,
} from "./pgd-pdf-renderer.mjs";

const pdfMake = pdfMakeModule?.default || pdfMakeModule;
pdfMake.vfs = pdfFontsModule?.default || pdfFontsModule;

const FORM_NUMBER = "FM-UAI.KEU-10-00";
const FORM_NUMBERS = new Set([FORM_NUMBER, "FM-MBN.KEU-10-00"]);
const TITLE = "FORM BIAYA PENGADAAN TANAH &\nPENGURUSAN IZIN";
const ROLES = ["Membuat", "Memeriksa", "Verifikator", "Menyetujui"];
const BORDER = "#000000";
const PAGE_WIDTH = 595.28;
const MARGIN = 35;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const asObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const formNumber = (value) => text(value).toUpperCase();

const parseQuantity = parseItemQuantity;

const parseUnitPrice = (value) => {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/^Rp\.?\s*/i, "").replace(/\s/g, "");
  if (!/^\d+$/.test(raw) && !/^\d{1,3}(?:\.\d{3})+$/.test(raw) && !/^\d{1,3}(?:,\d{3})+$/.test(raw)) return null;
  const price = Number(raw.replace(/[.,]/g, ""));
  return Number.isSafeInteger(price) && price >= 0 ? price : null;
};

const validateInputItems = (rows) => {
  if (!Array.isArray(rows) || !rows.length) throw new Error("Rincian biaya KEU 10 wajib diisi.");
  if (rows.length > 100) throw new Error("Rincian biaya KEU 10 maksimal 100 item.");
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`Item KEU 10 ${index + 1} tidak valid.`);
    const quantity = parseQuantity(row.jumlah ?? row.quantity ?? row.qty);
    const price = parseUnitPrice(row.estimasi_harga_satuan ?? row.harga_satuan ?? row.unit_price ?? row.nominal);
    if (quantity === null || price === null) throw new Error(`Jumlah atau harga item KEU 10 ${index + 1} tidak valid.`);
    const description = row.keterangan ?? row.nama_barang ?? row.name ?? row.description ?? row.item_name;
    const unit = row.satuan ?? row.sat ?? row.unit;
    if (typeof description !== "string" || !description.trim() || typeof unit !== "string" || !unit.trim()) {
      throw new Error(`Keterangan dan satuan item KEU 10 ${index + 1} wajib diisi.`);
    }
    return { ...row, keterangan: description, satuan: unit, jumlah: quantity, estimasi_harga_satuan: price };
  });
};

const sumItems = (items) => {
  if (!Array.isArray(items) || !items.length) throw new Error("Rincian biaya KEU 10 wajib diisi.");
  if (items.length > 100) throw new Error("Rincian biaya KEU 10 maksimal 100 item.");
  const grandTotal = items.reduce((sum, item) => {
    if (!item || parseQuantity(item.jumlah) === null
      || !Number.isSafeInteger(item.hargaSatuan) || item.hargaSatuan < 0) {
      throw new Error("Jumlah atau harga item KEU 10 tidak valid.");
    }
    const total = itemQuantityTotal(item.jumlah, item.hargaSatuan);
    if (total === null || !Number.isSafeInteger(sum + total)) {
      throw new Error("Total biaya KEU 10 di luar rentang angka aman.");
    }
    return sum + total;
  }, 0);
  if (grandTotal <= 0) throw new Error("Grand Total KEU 10 harus positif.");
  return grandTotal;
};

export const isKeu10Document = (source = {}) => {
  // A resolved master takes precedence over stale snapshot/title hints.
  const master = asObject(source?.resolved_master_form);
  if (Object.keys(master).length) return FORM_NUMBERS.has(formNumber(master.nomor_form));
  const numbers = [
    source?.location_snapshot?.form?.nomor_form,
    source?.data_snapshot?.form?.nomor_form,
    source?.formNumber,
  ].map(formNumber).filter(Boolean);
  return numbers.length ? numbers.every((number) => FORM_NUMBERS.has(number)) : FORM_NUMBERS.has(formNumber(source?.formName));
};

export const resolveKeu10MasterForm = async (client, formUsageId) => {
  if (!formUsageId) return null;
  const { data: usage, error } = await client
    .from("form_usages")
    .select("id, form_id, master_forms(id, nama_form, nomor_form)")
    .eq("id", formUsageId)
    .maybeSingle();
  if (error) throw error;
  if (!usage?.form_id) return null;
  const forms = Array.isArray(usage.master_forms) ? usage.master_forms : [usage.master_forms];
  if (forms.length !== 1) return null;
  const master = forms[0];
  return master?.id === usage.form_id && isKeu10Document({ resolved_master_form: master }) ? master : null;
};

export const normalizeKeu10DocumentData = (source = {}, options = {}) => {
  if (!isKeu10Document(source)) throw new Error("Dokumen bukan form KEU 10 yang dikenali.");
  const location = asObject(source.location_snapshot);
  const input = asObject(source.form_input_data ?? source?.data_snapshot?.input);
  const normalized = normalizeKeu1DocumentData({
    ...source, form_input_data: { ...input, items: validateInputItems(input.items) },
  }, { signatures: [] });
  const items = normalized.items;
  // Reuse KEU 1 item semantics, but never trust a supplied item/grand total.
  const grandTotal = sumItems(items);
  const targetStep = Number(options.targetStep || 0);
  const signatures = normalizeNativeSignatures(
    (Array.isArray(options.signatures) ? options.signatures : []).filter((value) => Object.keys(asObject(value)).length),
    targetStep,
  );
  const identity = source.resolved_master_form?.nomor_form || location.form?.nomor_form
    || source.data_snapshot?.form?.nomor_form || source.formNumber || source.formName;
  return {
    formNumber: formNumber(identity),
    revisionNotes: signerRevisionNotes(source),
    revisionHistory: revisionHistoryEntries(source),
    isRejected: isNativeDocumentRejected(source, signatures, targetStep),
    noSurat: text(source.no_surat, "DRAFT"),
    branch: text(location.office?.name || source.office_name, "-"),
    project: text(location.project?.name || source.data_snapshot?.location?.project?.name
      || input.requested_project?.name || source.data_snapshot?.requested_project?.name || source.project_name, "-"),
    requestDate: normalized.requestDate,
    effectiveDate: text(source.resolved_master_form?.berlaku_efektif || location.form?.berlaku_efektif, "Selasa, 09 September 2025"),
    items,
    grandTotal,
    signatures,
  };
};

export const createKeu10PreviewData = (options = {}) => {
  const count = Number(options.signature_count ?? 5);
  if (![4, 5, 6].includes(count)) throw new Error("Pratinjau KEU 10 mendukung 4, 5, atau 6 penandatangan.");
  let counts = options.signature_roles ?? [1, count - 3, 1, 1];
  // Generic previews have no verifier slot. Reserve one examiner for Finance,
  // and derive the KEU 10 groups from signature_count, not generic cardinalities.
  if (Array.isArray(counts) && counts.length === 3 && counts[0] === 1 && counts[2] === 1
    && Number.isSafeInteger(counts[1]) && counts[1] >= 0) counts = [1, count - 3, 1, 1];
  if (!Array.isArray(counts) || counts.length !== 4 || counts.some((value) => !Number.isInteger(value) || value < 0)
    || counts[0] !== 1 || counts[1] !== count - 3 || counts[2] !== 1 || counts[3] !== 1) {
    throw new Error("Pembagian grup tanda tangan KEU 10 tidak valid.");
  }
  const examiners = count === 4 ? ["Manager Pengembangan Bisnis"]
    : count === 5 ? ["Manager Legal", "Direktur I"]
      : ["Manager Legal", "Manager Pengembangan Bisnis", "Direktur I"];
  const jobs = [["Branch Manager"], examiners, ["Mgr. Keu & Akt"], [count === 4 ? "Direktur I" : "Direktur Utama"]];
  const signatures = ROLES.flatMap((role, roleIndex) => Array.from({ length: counts[roleIndex] }, (_, index) => ({
    role_name: role,
    signer_snapshot: { full_name: `${role} ${index + 1}`, job_title: jobs[roleIndex][index] || role },
    is_signed: false,
  }))).map((signature, index) => ({ ...signature, step_order: index + 1 }));
  return normalizeKeu10DocumentData({
    no_surat: "001/UAI/KEU/X/2026",
    request_date: "2026-10-06",
    location_snapshot: {
      form: { nomor_form: FORM_NUMBER },
      office: { name: "Cabang Jepara" },
      project: { name: "Marison Regency Jepara" },
    },
    form_input_data: { items: [
      { keterangan: "Pengadaan tanah", jumlah: 1, satuan: "Bidang", estimasi_harga_satuan: count === 4 ? 1_000_000 : 100_000_000 },
      { keterangan: "Pengurusan izin", jumlah: 1, satuan: "Paket", estimasi_harga_satuan: count === 4 ? 500_000 : 25_000_000 },
    ] },
  }, { signatures });
};

const borderLayout = {
  hLineWidth: () => 0.6,
  vLineWidth: () => 0.6,
  hLineColor: () => BORDER,
  vLineColor: () => BORDER,
  paddingLeft: () => 3,
  paddingRight: () => 3,
  paddingTop: () => 2,
  paddingBottom: () => 2,
};

const widthsFor = (ratios, padding = 6) => ratios.map((ratio) => (CONTENT_WIDTH - (ratios.length * padding + (ratios.length + 1) * 0.6)) * ratio);
const cell = (value, alignment = "left", extra = {}) => ({ text: text(value), alignment, ...extra });
const money = (value) => `Rp ${Number(value).toLocaleString("id-ID")}`;

const buildSignatureBlock = (signatures) => {
  if (!Array.isArray(signatures) || ![4, 5, 6].includes(signatures.length)) {
    throw new Error("Grup tanda tangan KEU 10 harus memuat satu Membuat, satu Verifikator, dan satu Menyetujui.");
  }
  const expectedRoles = ["Membuat", ...Array(signatures.length - 3).fill("Memeriksa"), "Verifikator", "Menyetujui"];
  if (signatures.some((signature, index) => signature?.role !== expectedRoles[index])) {
    throw new Error("Grup tanda tangan KEU 10 harus memuat satu Membuat, satu Verifikator, dan satu Menyetujui dalam urutan workflow.");
  }
  // Keep native approval stamps/identity cells; only rearrange their geometry locally.
  const native = buildNativeSignatureBlock(signatures);
  const rows = [[], [], []];
  let cursor = 0;
  for (const group of native.stack) {
    const table = group.stack[0].table;
    const size = Math.min(table.widths.length, signatures.length - cursor);
    for (let row = 0; row < rows.length; row += 1) rows[row].push(...table.body[row + 1].slice(-size));
    cursor += size;
  }
  const headers = [];
  for (let index = 0; index < signatures.length;) {
    const role = signatures[index].role;
    let span = 1;
    while (signatures[index + span]?.role === role) span += 1;
    headers.push(cell(role, "center", { colSpan: span }));
    for (let offset = 1; offset < span; offset += 1) headers.push({});
    index += span;
  }
  return {
    table: { widths: signatures.map(() => "*"), heights: [12, 52, 12, 12], body: [headers, ...rows] },
    layout: borderLayout,
  };
};

export const buildKeu10DocumentDefinition = (data, logoDataUrl = null) => {
  if (!FORM_NUMBERS.has(formNumber(data?.formNumber))) throw new Error("Dokumen bukan form KEU 10 yang dikenali.");
  const grandTotal = sumItems(data.items);
  const itemRows = data.items.map((item, index) => [
    cell(index + 1, "center"), cell(item.keterangan), cell(item.jumlah.toLocaleString("id-ID", { maximumFractionDigits: 6 }), "center"),
    cell(item.satuan, "center"), cell(money(item.hargaSatuan), "right"),
    cell(money(itemQuantityTotal(item.jumlah, item.hargaSatuan)), "right"),
  ]);
  while (itemRows.length < 12) itemRows.push(Array.from({ length: 6 }, () => cell("")));
  const itemWidths = widthsFor([0.053, 0.315, 0.16, 0.102, 0.158, 0.212]);
  const header = (page, total) => ({
    margin: [MARGIN, 56, MARGIN, 0],
    table: {
      widths: widthsFor([0.21, 0.42, 0.37], 0),
      heights: [39],
      body: [[
        logoDataUrl ? { image: logoDataUrl, fit: [90, 34], alignment: "center", margin: [0, 4, 0, 0] }
          : cell("MARISON\nREGENCY GROUP", "center", { bold: true, color: "#087b9c", fontSize: 9, margin: [0, 7, 0, 0] }),
        { stack: TITLE.split("\n").map((line) => cell(line, "center", { noWrap: true })), bold: true, fontSize: 10, margin: [0, 7, 0, 0] },
        {
          table: { widths: [68, "*"], body: [
            [cell("No. Formulir"), cell(data.formNumber, "center")],
            [cell("Halaman"), cell(`${page} Dari ${total}`, "center")],
            [cell("Berlaku Efektif"), cell(data.effectiveDate, "center")],
          ] },
          fontSize: 6.5,
          layout: { ...borderLayout, paddingLeft: () => 2, paddingRight: () => 2, paddingTop: () => 1, paddingBottom: () => 1 },
        },
      ]],
    },
    layout: { ...borderLayout, paddingTop: () => 0, paddingBottom: () => 0, paddingLeft: () => 0, paddingRight: () => 0 },
  });
  return {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [MARGIN, 96.2, MARGIN, 35],
    defaultStyle: { font: "Roboto", fontSize: 8, color: BORDER },
    header,
    content: [
      {
        table: { widths: [64, "*", 68, 139], body: [
          [cell("Cabang"), cell(`: ${data.branch}`), cell("Tanggal"), cell(`: ${data.requestDate}`)],
          [cell("Proyek"), cell(`: ${data.project}`), cell("No. Dokumen"), cell(`: ${data.noSurat}`)],
        ] },
        layout: { ...borderLayout, hLineWidth: (index) => index === 1 ? 0 : 0.6, vLineWidth: (index) => index === 0 || index === 4 ? 0.6 : 0 },
        margin: [0, 0, 0, 4],
      },
      {
        table: { headerRows: 1, keepWithHeaderRows: 1, dontBreakRows: true, widths: itemWidths, heights: (row) => row === 0 ? 24 : 10, body: [
          ["No.", "Keterangan", "Jumlah", "Satuan", "Estimasi\nHarga Satuan", "Total"].map((label) => cell(label, "center", { bold: true })),
          ...itemRows,
        ] },
        layout: borderLayout,
      },
      {
        unbreakable: true,
        stack: [
          {
            table: { widths: itemWidths, body: [[
              cell("GRAND TOTAL", "left", { colSpan: 5, bold: true }), {}, {}, {}, {},
              cell(money(grandTotal), "right", { bold: true }),
            ]] },
            layout: borderLayout,
          },
          ...nativeDocumentRejectionBlock(data.isRejected),
          { ...buildSignatureBlock(data.signatures), margin: [82, 4, 0, 0] },
        ],
      },
      ...revisionAppendixBlock(data.revisionHistory,data.noSurat),
    ],
  };
};

export const renderKeu10Pdf = async (data, options = {}) => {
  const logoDataUrl = options.logoDataUrl || await loadLogoDataUrl(options.logoPath);
  const buffer = await pdfMake.createPdf(buildKeu10DocumentDefinition(data, logoDataUrl)).getBuffer();
  return Buffer.from(buffer);
};
