import { readFile } from "node:fs/promises";
import pdfMakeModule from "pdfmake/build/pdfmake.js";
import pdfFontsModule from "pdfmake/build/vfs_fonts.js";
import { buildPgdSignatureSlotPlan, buildSignatureLayoutPlan } from "./document-layout-rules.mjs";
import { signerRevisionNotes, revisionHistoryEntries, revisionAppendixBlock } from "./document-revision-notes.mjs";

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

const formatDateTimeId = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(date).replace(".", ":");
};

const normalizeRole = (value) => {
  const role = String(value || "").trim().toLowerCase();
  if (role.includes("buat")) return "Membuat";
  if (role.includes("periksa") || role === "memeriksa") return "Memeriksa";
  if (role === "verifikator") return "Verifikator";
  if (role.includes("setuju") || role === "menyetujui") return "Menyetujui";
  return text(value, "Tahap Persetujuan");
};

const asObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

const parseRecommendationItemDecisions = (source = {}) => {
  const snapshot = asObject(source?.data_snapshot);
  const direct = Array.isArray(snapshot.recommendation_decisions) ? snapshot.recommendation_decisions : [];
  const recommendation = asObject(snapshot.recommendation);
  const nested = Array.isArray(recommendation.items) ? recommendation.items : [];
  return (direct.length > 0 ? direct : nested)
    .filter((row) => row && typeof row === "object" && !Array.isArray(row))
    .map((row) => ({
      index: Number(row.parent_item_index || 0) - 1,
      parentName: String(row.parent_item_name || asObject(row.applicant_original).name || "").trim().toLowerCase(),
      action: String(row.recommendation_action || row.action || row.status || "").trim(),
      isRecommended: row.is_recommended !== false && ![
        "not_recommended", "tidak_direkomendasikan", "rejected", "ditolak",
      ].includes(String(row.recommendation_action || row.action || row.status || "").trim().toLowerCase().replace(/[\s-]+/g, "_")),
      reason: String(row.rejection_reason || row.keterangan || row.alasan || row.reason || "").trim(),
    }))
    .filter((row) => Number.isFinite(row.index) || row.parentName);
};

const formatMoneyId = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const normalized = raw.replace(/[^\d-]/g, "");
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return raw;
  return `Rp ${amount.toLocaleString("id-ID")}`;
};

export const isPgdDocument = (source = {}) => {
  const names = [
    source.formName,
    source?.location_snapshot?.form?.nama_form,
    source?.data_snapshot?.form?.nama_form,
    source?.data_snapshot?.form?.name,
    source?.resolved_master_form?.nama_form,
  ].map((value) => String(value || "").toUpperCase());
  return names.some((name) => name.includes("PERMINTAAN BARANG"));
};

// Resolves the canonical master form for a surat through its form usage:
// form_usage_id → form_usages.form_id → master_forms.
// Returns the master form row ({ id, nama_form, nomor_form }) or null when
// the usage is missing, invalid, or unresolvable. Never throws: callers
// treat null as "not PGD" (fail-closed).
export const resolvePgdMasterForm = async (client, formUsageId) => {
  if (!formUsageId) return null;
  const { data: usage, error: usageError } = await client
    .from("form_usages")
    // Unhinted embed: the FK-constraint hint failed on the staging schema
    // (the constraint name is not fk_master_forms). The unhinted relation
    // resolves via the form_usages.form_id -> master_forms(id) join.
    .select("id, form_id, master_forms(id, nama_form, nomor_form)")
    .eq("id", formUsageId)
    .maybeSingle();

  if (usageError) throw usageError;
  if (!usage || !usage.form_id || !usage.master_forms) return null;

  return Array.isArray(usage.master_forms) ? usage.master_forms[0] : usage.master_forms;
};

export const normalizeNativeSignatures = (signatures = [], targetStep = 0) =>
  (Array.isArray(signatures) ? signatures : [])
    .slice()
    .sort((left, right) => Number(left.step_order || 0) - Number(right.step_order || 0))
    .map((signature, index) => {
      const snapshot = signature.signer_snapshot || {};
      const profile = signature.profile || {};
      const withinStep = !targetStep || Number(signature.step_order || index + 1) <= targetStep;
      const signed = signature.is_signed === true && withinStep;
      return {
        stepOrder: Number(signature.step_order || index + 1),
        role: normalizeRole(signature.role_name),
        name: text(snapshot.full_name || profile.full_name || signature.user_name, "Belum ditentukan"),
        job: text(snapshot.job_title_display || snapshot.job_title || profile.job_title_display || profile.job_title || signature.label_jabatan, "-"),
        signed,
        status: withinStep ? String(signature.status || "").trim().toUpperCase() : "PENDING",
        signedAt: signed ? signature.signed_at : null,
      };
    });

export const isNativeDocumentRejected = (source, signatures, targetStep = 0) =>
  (!targetStep && ["REJECTED", "DITOLAK"].includes(String(source.status || "").trim().toUpperCase()))
  || signatures.some((signature) => ["REJECTED", "DITOLAK"].includes(signature.status));

export const nativeDocumentRejectionBlock = (isRejected) => isRejected ? [{
  text: "STATUS DOKUMEN: DITOLAK",
  bold: true,
  color: "#991b1b",
  margin: [0, 4, 0, 4],
}] : [];

export const normalizePgdDocumentData = (source = {}, options = {}) => {
  const input = source.form_input_data || source?.data_snapshot?.input || {};
  const location = source.location_snapshot || {};
  const items = Array.isArray(input.items) ? input.items : [];
  const recommendationDecisions = parseRecommendationItemDecisions(source);
  const isFund = input.request_category === "non_asset";
  const targetStep = Number(options.targetStep || 0);
  const signatures = normalizeNativeSignatures(options.signatures, targetStep);
  return {
    formNumber: text(location?.form?.nomor_form || source?.data_snapshot?.form?.nomor_form || source?.resolved_master_form?.nomor_form, "FM-UAI.PGD-01-00"),
    revisionNotes: signerRevisionNotes(source),
    revisionHistory: revisionHistoryEntries(source),
    isRejected: isNativeDocumentRejected(source, signatures, targetStep),
    noSurat: text(source.no_surat, "DRAFT/UAI/PGD/VI/2026"),
    isAsset: source.is_aset === true || input.request_category === "asset",
    department: text(location?.department?.name || source.department_name, "-"),
    project: text(input?.requested_project?.name || location?.project?.name || source.project_name, "-"),
    placeDate: [text(source.request_place, ""), formatDateId(source.request_date)].filter(Boolean).join(", ") || "Magelang, 1 Juli 2026",
    items: items.map((item, index) => {
      const itemName = String(item.nama_barang || item.name || "").trim().toLowerCase();
      const recommendationDecision = recommendationDecisions.find((entry) =>
        entry.index === index || (entry.parentName && entry.parentName === itemName)
      );
      const recommendationNote = recommendationDecision && !recommendationDecision.isRecommended
        ? `Tidak direkomendasikan: ${recommendationDecision.reason || "Tidak direkomendasikan oleh tim rekomendasi."}`
        : "";
      const baseNote = text(item.keterangan || item.note, "");
      const nominalNote = isFund && item.nominal != null
        ? `Nominal: ${formatMoneyId(item.nominal)}`
        : "";
      return {
        no: index + 1,
        code: text(item.kode || item.code, ""),
        name: text(item.nama_barang || item.name, ""),
        unit: text(item.sat || item.unit || item.satuan, ""),
        quantity: text(item.jumlah || item.quantity, ""),
        status: text(item.status, ""),
        note: [baseNote, nominalNote, recommendationNote].filter(Boolean).join("\n"),
        revisionAction: recommendationNote ? "reject" : "",
      };
    }),
    notes: [
      isFund ? `Jenis dana: ${input.fund_type === "production_cost" ? "Biaya Produksi" : "Biaya Operasional"}` : "",
      isFund ? `Total pengajuan: ${formatMoneyId(input.fund_amount) || "Rp 0"}` : "",
      text(input.catatan || source.notes, ""),
    ].filter(Boolean).join("\n"),
    signatures,
  };
};

export const createPgdPreviewData = (options = {}) => {
  const total = Math.min(Math.max(Number(options.signature_count || 5), 2), 8);
  const roles = Array.isArray(options.signature_roles) ? options.signature_roles : [1, Math.max(total - 2, 1), 1];
  const roleNames = ["Membuat", "Memeriksa", "Menyetujui"];
  const jobs = {
    Membuat: ["Staff Departemen", "Supervisor", "Asisten Manager"],
    Memeriksa: ["Manager Departemen", "Manager Terkait", "Direktur I"],
    Menyetujui: ["Direktur Utama", "Direktur I", "Manager Keuangan"],
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
    formNumber: "FM-UAI.PGD-01-00",
    noSurat: "001/UAI/PBO.1/VI/2026",
    isAsset: true,
    department: "Pengembangan Organisasi",
    project: "-",
    placeDate: "Magelang, 1 Juli 2026",
    items: [
      { no: 1, code: "IT-001", name: "Laptop kerja", unit: "Unit", quantity: "1", status: "2", note: "Uji template PDF" },
      { no: 2, code: "IT-002", name: "Monitor kerja", unit: "Unit", quantity: "2", status: "3", note: "Contoh item kedua" },
      { no: 3, code: "IT-003", name: "Keyboard dan mouse", unit: "Set", quantity: "3", status: "4", note: "Contoh item ketiga" },
    ],
    notes: "Catatan pengujian template. Data ini tidak disimpan sebagai surat.",
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

const signatureRow = (signers, topCount) => {
  const offset = topCount - signers.length;
  const blank = () => ({ text: "", border: [false, false, false, false] });
  const roleCells = Array.from({ length: offset }, blank);
  for (let index = 0; index < signers.length;) {
    const role = signers[index].role;
    let span = 1;
    while (index + span < signers.length && signers[index + span].role === role) span += 1;
    roleCells.push({ text: role, colSpan: span, bold: true, alignment: "center", fillColor: GREEN });
    for (let filler = 1; filler < span; filler += 1) roleCells.push({});
    index += span;
  }
  const makeRow = (mapper) => [
    ...Array.from({ length: offset }, blank),
    ...signers.map(mapper),
  ];
  return {
    table: {
      dontBreakRows: true,
      widths: Array.from({ length: topCount }, () => "*"),
      heights: [12, 42, 11, 11],
      body: [
        roleCells,
        makeRow((signer) => {
          const rejected = ["REJECTED", "DITOLAK"].includes(signer.status);
          // is_signed records a completed action, including rejection, not approval.
          const stamped = signer.signed && (rejected || signer.status === "APPROVED");
          const date = formatDateTimeId(signer.signedAt);
          return {
            text: stamped ? `${rejected ? "DITOLAK" : "DISETUJUI"} SISTEM${date ? `\n${date} WIB` : ""}` : "",
            alignment: "center",
            fontSize: 6.5,
            color: stamped ? (rejected ? "#991b1b" : "#166534") : BORDER,
            bold: Boolean(stamped),
            margin: [0, 5, 0, 0],
          };
        }),
        makeRow((signer) => ({ text: signer.name.toUpperCase(), alignment: "center", fontSize: 7 })),
        makeRow((signer) => ({ text: signer.job, alignment: "center", fontSize: 7 })),
      ],
    },
    layout: compactBorderLayout,
  };
};

export const buildNativeSignatureBlock = (signatures) => {
  const providedSignatures = Array.isArray(signatures) ? signatures.slice(0, 8) : [];
  const safeSignatures = providedSignatures.length > 0
    ? providedSignatures
    : createPgdPreviewData({ signature_count: 3, signature_roles: [1, 1, 1] }).signatures;
  const plan = buildSignatureLayoutPlan(safeSignatures.length);
  let cursor = 0;
  const groups = plan.groupSizes.map((size) => {
    const group = safeSignatures.slice(cursor, cursor + size);
    cursor += size;
    return group;
  });
  return {
    unbreakable: true,
    stack: [
      ...groups.map((group, index) => ({
        stack: [signatureRow(group, groups[0].length)],
        margin: [0, 0, 0, 0],
      })),
    ],
  };
};

const selectionMarker = (checked) => ({
  text: checked ? "V" : "",
  bold: true,
  alignment: "center",
});

export const buildPgdDocumentDefinition = (data, logoDataUrl = null) => {
  const items = Array.from({ length: Math.max(15, data.items.length) }, (_item, index) => ({
    no: index + 1,
    code: "",
    name: "",
    unit: "",
    quantity: "",
    status: "",
    note: "",
    ...(data.items[index] || {}),
    no: index + 1,
  }));
  const headerCell = (value) => ({ text: value, bold: true, alignment: "center", fillColor: GREEN, margin: [0, 2, 0, 2] });
  const itemCell = (value, alignment = "center", extra = {}) => ({ text: text(value, ""), alignment, fontSize: 7.5, margin: [0, 0, 0, 0], ...extra });
  return {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [16, 12, 16, 12],
    defaultStyle: { font: "Roboto", fontSize: 8, color: BORDER },
    footer: (page, total) => ({ text: `${data.noSurat} | Halaman ${page} dari ${total}`, fontSize: 7, color: MUTED, alignment: "right", margin: [16, 0, 16, 0] }),
    content: [
      {
        table: {
          widths: ["18%", "60%", "22%"],
          body: [[
            logoDataUrl ? { image: logoDataUrl, fit: [82, 30], alignment: "center", margin: [0, 6, 0, 0], fillColor: HEADER_TINT } : { text: "MARISON\nREGENCY GROUP", bold: true, color: "#087b9c", alignment: "center", margin: [0, 8, 0, 0], fillColor: HEADER_TINT },
            { text: "PERMINTAAN BARANG & JASA", bold: true, fontSize: 14, alignment: "center", margin: [0, 10, 0, 0], fillColor: HEADER_TINT },
            {
              table: {
                widths: ["48%", "52%"],
                body: [
                  [{ text: "No. Formulir", bold: true, fillColor: HEADER_TINT }, { text: data.formNumber, bold: true, alignment: "center", fillColor: HEADER_TINT }],
                  [{ text: "Halaman", bold: true, fillColor: HEADER_TINT }, { text: "Lihat footer", alignment: "center", fillColor: HEADER_TINT }],
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
          widths: ["3%", "4%", "20%", "4%", "21%", "22%", "4%", "22%"],
          body: [
            [
              { text: "" },
              selectionMarker(data.isAsset),
              { text: "ASET", bold: true, alignment: "left" },
              selectionMarker(!data.isAsset),
              { text: "NON ASET", bold: true, alignment: "left" },
              { text: "Cabang/Departemen", bold: true, alignment: "right", border: [true, true, false, true] },
              { text: "", border: [false, true, false, true] },
              { text: `: ${data.department}`, border: [false, true, true, true] },
            ],
            [
              {
                colSpan: 5,
                columns: [
                  { width: "28%", text: "No. Dokumen", bold: true, margin: [8, 0, 0, 0] },
                  { width: "72%", text: `: ${data.noSurat}`, bold: true, margin: [4, 0, 0, 0] },
                ],
              }, {}, {}, {}, {},
              { text: "Proyek", bold: true, italics: true, alignment: "right", border: [true, true, false, true] },
              { text: "", border: [false, true, false, true] },
              { text: `: ${data.project}`, border: [false, true, true, true] },
            ],
          ],
        },
        layout: compactBorderLayout,
      },
      {
        table: {
          widths: ["*"],
          body: [[{
            text: "Kepada Yth. Bagian Pengadaan\nMohon Pengadaan Barang / Jasa dengan data sebagai berikut :",
            margin: [4, 2, 4, 2],
          }]],
        },
        layout: compactBorderLayout,
      },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: ["3%", "8%", "57%", "5%", "7%", "7%", "13%"],
          heights: (row) => row === 0 ? 12 : 9,
          body: [
            ["No", "KODE", "NAMA BARANG", "SAT", "JUMLAH", "STATUS", "KETERANGAN"].map(headerCell),
            ...items.map((item) => [
              itemCell(item.no), itemCell(item.code), itemCell(item.name, "left", item.revisionAction === "reject" ? { decoration: "lineThrough", color: MUTED } : {}), itemCell(item.unit),
              itemCell(item.quantity), itemCell(item.status), itemCell(item.note, "left"),
            ]),
          ],
        },
        layout: compactBorderLayout,
      },
      {
        table: {
          widths: ["*"],
          heights: [34],
          body: [[{
            text: [{ text: "Catatan :\n", bold: true }, { text: data.notes || "" }],
            alignment: "left",
            margin: [4, 2, 4, 2],
          }]],
        },
        layout: compactBorderLayout,
        margin: [0, 3, 0, 3],
      },
      ...nativeDocumentRejectionBlock(data.isRejected),
      {
        columns: [
          { width: "60%", text: "" },
          {
            width: "40%",
            unbreakable: true,
            stack: [
              {
                table: { widths: ["*"], body: [[{ text: data.placeDate, alignment: "center" }]] },
                layout: compactBorderLayout,
              },
              buildNativeSignatureBlock(data.signatures),
            ],
          },
        ],
      },
      ...revisionAppendixBlock(data.revisionHistory || (data.revisionNotes?.length ? [{title:data.revisionNotes[0],reason:data.revisionNotes[1],changes:[],legacyNotes:data.revisionNotes.slice(2)}] : []),data.noSurat),
    ],
  };
};

export const loadLogoDataUrl = async (logoPath) => {
  if (!logoPath) return null;
  try {
    const buffer = await readFile(logoPath);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
};

export const renderPgdPdf = async (data, options = {}) => {
  const logoDataUrl = options.logoDataUrl || await loadLogoDataUrl(options.logoPath);
  const definition = buildPgdDocumentDefinition(data, logoDataUrl);
  const buffer = await pdfMake.createPdf(definition).getBuffer();
  return Buffer.from(buffer);
};
