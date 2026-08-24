import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import {
  buildRecommendationPagePlan,
  parseStorageRef,
  recommendationVersionPath,
  resolveRecommendationSource,
  shouldRenderDirectPgd,
} from "../recommendation-pdf.mjs";
import {
  buildRecommendationDocumentDefinition,
  normalizeRecommendationDocumentData,
  renderRecommendationPdf,
} from "../recommendation-native-pdf.mjs";
import { buildNativeSignatureBlock } from "../pgd-pdf-renderer.mjs";

const image = async (width, height) => sharp({
  create: { width, height, channels: 3, background: "#245b78" },
}).png().toBuffer();

const attachment = (id, order = id) => ({ id: `image-${id}`, order, file_url: `fixtures/${id}.png`, file_name: `${id}.png`, file_type: "image/png" });
const canonical = (count) => resolveRecommendationSource({ recommendation_items: [{
  id: "item-b",
  order: 2,
  parent_item_index: 1,
  details: [{ id: "detail-b", order: 1, title: "Kondisi alat", description: "Perlu penggantian", attachments: Array.from({ length: count }, (_, index) => attachment(index + 1)) }],
}, {
  id: "item-a",
  order: 1,
  parent_item_index: 2,
  details: [{ id: "detail-a", order: 1, title: "Pemeriksaan", attachments: [attachment("b", 2), attachment("a", 1)] }],
}] }, { items: [{ nama_barang: "Printer Pemohon" }, { nama_barang: "Laptop Pemohon" }] });

const canonicalMultiDetail = () => resolveRecommendationSource({ recommendation_multi_detail: {
  version: 1,
  items: [{
    id: "item-computer",
    order: 0,
    applicant_original: { name: "Komputer SPV" },
    details: [{
      id: "detail-cpu",
      order: 0,
      name: "CPU Intel Core i9",
      attachments: [attachment("cpu")],
    }, {
      id: "detail-memory",
      order: 1,
      name: "RAM 32 GB",
      attachments: [attachment("memory")],
    }],
  }],
} });

test("resolves canonical nested attachments with stable item, detail, and attachment ordering", () => {
  const items = canonical(3);
  assert.deepEqual(items.map((item) => item.id), ["item-a", "item-b"]);
  assert.equal(items[0].applicantName, "Laptop Pemohon");
  assert.deepEqual(items[0].details[0].attachments.map((item) => item.id), ["image-a", "image-b"]);
});

test("resolves legacy flat, nested singular, and multiple attachment shapes", () => {
  const [item] = resolveRecommendationSource({ recommendation_items: [{
    nama_barang: "Legacy Scanner",
    recommendation_attachment_url: "legacy/flat.jpg",
    recommendation_attachment_file_name: "flat.jpg",
    recommendation_attachment: {
      file_url: "legacy/singular.png",
      file_name: "singular.png",
      attachments: [{ id: "nested-2", order: 2, file_url: "legacy/2.png" }],
    },
    attachments: [{ id: "nested-1", order: 1, file_url: "legacy/1.png" }],
  }] });
  assert.equal(item.applicantName, "Legacy Scanner");
  assert.equal(item.details[0].attachments.length, 4);
  assert.ok(item.details[0].attachments.every((value) => value.isImage));
});

test("reads canonical multi-detail shape and groups flat legacy rows by stable parent ID", () => {
  const canonicalItems = resolveRecommendationSource({ recommendation_multi_detail: { version: 1, items: [{
    id: "parent-canonical",
    applicant_original: { name: "Original Canonical" },
    details: [{ id: "detail-canonical", name: "Pengganti", attachments: [{ id: "canonical-image", storage_path: "canonical/image.png" }] }],
  }] } });
  assert.equal(canonicalItems[0].applicantName, "Original Canonical");
  assert.equal(canonicalItems[0].details[0].attachments[0].url, "canonical/image.png");

  const legacyItems = resolveRecommendationSource({ recommendation_items: [
    { parent_item_id: "same-parent", parent_item_name: "Original Legacy", detail_id: "detail-1", nama_barang: "A" },
    { parent_item_id: "same-parent", parent_item_name: "Original Legacy", detail_id: "detail-2", nama_barang: "B" },
  ] });
  assert.equal(legacyItems.length, 1);
  assert.deepEqual(legacyItems[0].details.map((detail) => detail.id), ["detail-1", "detail-2"]);
});

test("prefers canonical model and fills missing details from snapshot", () => {
  const [item] = resolveRecommendationSource(
    { recommendation_multi_detail: { items: [{ id: "parent-1", applicant_original: { name: "Canonical" }, status: "recommended" }] } },
    {},
    { recommendation_items: [{ id: "parent-1", parent_item_name: "Stale", location: "Gudang", pic: "Budi", details: [{ id: "detail-1", status: "not_recommended", rejection_reason: "Rusak berat" }] }] },
  );
  assert.equal(item.applicantName, "Canonical");
  assert.equal(item.location, "Gudang");
  assert.equal(item.pic, "Budi");
  assert.equal(item.details[0].status, "not_recommended");
  assert.equal(item.details[0].rejectionReason, "Rusak berat");
});

test("preserves bucket and origin for real attachment storage refs", () => {
  assert.deepEqual(parseStorageRef(
    "https://storage.example.test/storage/v1/object/public/lampiran_surat/staging/recommendations/photo%201.png?token=ignored",
    { externalBases: ["https://storage.example.test"] },
  ), { bucket: "lampiran_surat", path: "staging/recommendations/photo 1.png", origin: "external" });
  assert.deepEqual(parseStorageRef("dokumen_surat/staging/source.xlsx"), {
    bucket: "dokumen_surat", path: "staging/source.xlsx", origin: "primary",
  });
  assert.deepEqual(parseStorageRef({
    bucket: "dokumen_surat",
    path: "staging/rec03-accept/source.xlsx",
  }, { defaultOrigin: "external" }), {
    bucket: "dokumen_surat", path: "staging/rec03-accept/source.xlsx", origin: "external",
  });
  assert.equal(parseStorageRef({ bucket: "lampiran_surat" }), null);
});

test("worker renders every document natively and keeps immutable RPC publication", async () => {
  const worker = await readFile(new URL("../pdf-worker.mjs", import.meta.url), "utf8");
  assert.match(worker, /renderDirectRecommendationJob/);
  assert.match(worker, /renderRecommendationPdf/);
  assert.match(worker, /renderDirectPgdJob/);
  assert.match(worker, /\.upload\(pdfPath, pdfBuffer, \{ contentType: "application\/pdf", upsert: false \}\)/);
  assert.match(worker, /supabase\.rpc\("publish_document_pdf_job"/);
  assert.match(worker, /supabase\.rpc\("complete_document_pdf_job"/);
  assert.match(worker, /p_lease_token: job\.lease_token/);
  assert.match(worker, /supabase\.rpc\("fail_document_pdf_job"/);
  assert.match(worker, /recommendationFromSnapshot/);
  assert.doesNotMatch(worker, /parent_snapshot_input/);
  assert.doesNotMatch(worker, /workbook_source\?\.path \|\| job\.source_file_path/);
  assert.doesNotMatch(worker, /loadRecommendationContext/);
  assert.doesNotMatch(worker, /soffice/);
  assert.doesNotMatch(worker, /source\.xlsx/);
  assert.doesNotMatch(worker, /appendRecommendationPagesToFile/);
  assert.doesNotMatch(worker, /normalizeWorkbookForPdf/);
  assert.doesNotMatch(worker, /PDF final rekomendasi hanya dapat dibuat setelah surat selesai/);
  assert.doesNotMatch(worker, /final\.pdf/);
  assert.doesNotMatch(worker, /\.from\("document_pdf_jobs"\)\s*\.update/);
  assert.doesNotMatch(worker, /\.from\("surat_registrasi"\)\s*\.update/);
  assert.doesNotMatch(worker, /\.from\("surat_signatures"\)\s*\.update/);
});

test("PGD-looking recommendation is still identified as recommendation without an Excel source", async () => {
  const fixture = JSON.parse(await readFile(new URL("../fixtures/recommendation-multi-detail-v1.json", import.meta.url), "utf8"));
  const items = resolveRecommendationSource({
    recommendation_multi_detail: fixture,
    form_name: "FORM PERMINTAAN BARANG & JASA",
  });
  assert.equal(shouldRenderDirectPgd(items, true), false);
  const pages = buildRecommendationPagePlan(items);
  assert.equal(pages.length, 1);
});

test("renders the recommendation main form, details, images, and 3-8 signatures as native PDF", async () => {
  for (const count of [3, 5, 8]) {
    const data = normalizeRecommendationDocumentData({
      no_surat: "010/UAI/PBO.4/VIII/2026",
      request_place: "Magelang",
      request_date: "2026-08-18",
      location_snapshot: { form: { nomor_form: "FM-UAI.HRD-30-00" } },
    }, {
      items: canonical(2),
      signatures: Array.from({ length: count }, (_, index) => ({
        id: `signature-${index + 1}`,
        step_order: index + 1,
        role_name: index === 0 ? "Membuat" : index === count - 1 ? "Menyetujui" : "Memeriksa",
        is_signed: index < 2,
        signed_at: index < 2 ? "2026-08-18T10:00:00+07:00" : null,
        signer_snapshot: { full_name: `Signer ${index + 1}`, job_title: `Jabatan ${index + 1}` },
      })),
    });
    const pdf = await renderRecommendationPdf(data, { downloadImage: () => image(320, 180) });
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    assert.ok(pdf.length > 2_000);
  }
});

test("keeps the FM-UAI.HRD-30-00 first-page table, reserved rows, notes, and lower-right signatures", () => {
  const items = resolveRecommendationSource({ recommendation_multi_detail: {
    version: 1,
    items: [{
      id: "speaker",
      order: 0,
      status: "recommended",
      applicant_original: { name: "Speaker", quantity: 1, notes: "Suara pecah" },
      location: "Marketing",
      pic: "Andreas",
      rejection_reason: "",
      details: [{
        id: "speaker-new",
        order: 0,
        name: "Speaker",
        quantity: 1,
        action: "purchase_new",
        description: "Pembelian baru",
        notes: "Sesuaikan kebutuhan ruang",
        attachments: [],
      }],
    }],
  } });
  const data = normalizeRecommendationDocumentData({
    no_surat: "001/UAI/PBO.4/VIII/2026",
    request_place: "Magelang",
    request_date: "2026-08-18",
    location_snapshot: { form: { nomor_form: "FM-UAI.HRD-30-00" } },
  }, {
    items,
    signatures: [
      { step_order: 1, role_name: "Membuat", signer_snapshot: { full_name: "Aldama", job_title: "Staff IT" } },
      { step_order: 2, role_name: "Memeriksa", signer_snapshot: { full_name: "Igi", job_title: "Mgr. PO" } },
    ],
  });
  const definition = buildRecommendationDocumentDefinition(data, [], null);
  const serialized = JSON.stringify(definition);
  const mainTable = definition.content[3].table;
  const footer = definition.content[4].table;

  assert.match(serialized, /NAMA BARANG \/ ALAT KERJA/);
  assert.match(serialized, /NO\\nREGISTRASI/);
  assert.match(serialized, /KERUSAKAN/);
  assert.match(serialized, /HASIL REKOMENDASI/);
  assert.match(serialized, /SERVICE/);
  assert.match(serialized, /GANTI/);
  assert.match(serialized, /URAIAN/);
  assert.match(serialized, /KETERANGAN/);
  assert.match(serialized, /Suara pecah/);
  assert.match(serialized, /Pembelian baru/);
  assert.match(serialized, /Sesuaikan kebutuhan ruang/);
  assert.equal(mainTable.body.length, 10);
  assert.deepEqual(footer.widths, ["72%", "28%"]);
  assert.match(serialized, /Catatan :/);
  assert.match(serialized, /1 dari 1/);
  assert.doesNotMatch(serialized, /Dinamis/);
});

test("preserves actual legacy two-signer identities instead of rendering placeholders", () => {
  const signatures = [
    { role: "Membuat", name: "Signer Legacy 1", job: "Staff", signed: true },
    { role: "Menyetujui", name: "Signer Legacy 2", job: "Manager", signed: false },
  ];
  const block = buildNativeSignatureBlock(signatures);
  const serialized = JSON.stringify(block);

  assert.match(serialized, /SIGNER LEGACY 1/);
  assert.match(serialized, /SIGNER LEGACY 2/);
  assert.doesNotMatch(serialized, /Belum ditentukan/);
});

test("plans one page for 1 through 6 images and continuation pages above 6", () => {
  for (let count = 1; count <= 6; count += 1) {
    const pages = buildRecommendationPagePlan(canonical(count));
    assert.equal(pages.filter((page) => page.itemId === "item-b").length, 1);
    assert.equal(pages.at(-1).images.length, count);
  }
  const pages = buildRecommendationPagePlan(canonical(8));
  const itemPages = pages.filter((page) => page.itemId === "item-b");
  assert.deepEqual(itemPages.map((page) => page.images.length), [6, 2]);
  assert.equal(itemPages[1].continuation, true);
});

test("does not add an empty attachment page when a detail has no files", () => {
  const items = resolveRecommendationSource({ recommendation_multi_detail: {
    version: 1,
    items: [{
      id: "speaker",
      applicant_original: { name: "Speaker" },
      status: "recommended",
      location: "Marketing",
      pic: "Andreas",
      details: [{ id: "speaker-new", name: "Speaker", action: "purchase_new", description: "Pembelian baru", attachments: [] }],
    }],
  } });
  assert.equal(buildRecommendationPagePlan(items).length, 0);
});

test("uses stable canonical path and isolated regeneration version path", () => {
  assert.equal(recommendationVersionPath("surat-1", "job-2"), "pdf/recommendations/surat-1/versions/job-2.pdf");
  assert.notEqual(recommendationVersionPath("surat-1", "stale-job"), recommendationVersionPath("surat-1", "fresh-job"));
});

test("keeps a rejected decision in normalized data without creating an empty attachment page", () => {
  const items = resolveRecommendationSource({ recommendation_multi_detail: { items: [{
    id: "rejected-parent", applicant_original: { name: "Server lama" }, status: "not_recommended",
    location: "Ruang IT", pic: "Sari", rejection_reason: "Tidak ekonomis", details: [],
  }] } });
  const pages = buildRecommendationPagePlan(items);
  assert.equal(items[0].status, "not_recommended");
  assert.equal(items[0].rejectionReason, "Tidak ekonomis");
  assert.equal(pages.length, 0);
});

test("treats a rejected parent as authoritative over stale recommended details", async () => {
  const items = resolveRecommendationSource({ recommendation_multi_detail: { items: [{
    id: "rejected-parent",
    applicant_original: { name: "Headset lama" },
    status: "not_recommended",
    location: "Marketing",
    pic: "Andreas",
    rejection_reason: "Kondisi masih layak",
    details: [{
      id: "stale-detail",
      name: "Headset baru",
      action: "purchase_new",
      description: "Pembelian baru",
      status: "recommended",
      attachments: [],
    }],
  }] } });

  assert.equal(items[0].details.length, 1);
  assert.equal(items[0].details[0].heading, "Headset lama");
  assert.equal(items[0].details[0].status, "not_recommended");
  assert.equal(items[0].details[0].description, "");

  const pages = buildRecommendationPagePlan(items);
  assert.equal(pages.length, 0);
});
