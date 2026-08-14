import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import sharp from "sharp";
import {
  appendRecommendationPages,
  buildRecommendationPagePlan,
  parseStorageRef,
  recommendationVersionPath,
  resolveRecommendationSource,
  shouldRenderDirectPgd,
} from "../recommendation-pdf.mjs";

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

test("worker enforces source buckets and immutable RPC publication", async () => {
  const worker = await readFile(new URL("../pdf-worker.mjs", import.meta.url), "utf8");
  assert.match(worker, /const workbookSource = recommendation \? job\.render_payload\.workbook_source : job\.source_file_path/);
  assert.match(worker, /downloadStorageFile\(attachment\.url, `Gambar \$\{attachment\.name \|\| attachment\.id\}`, "lampiran_surat"\)/);
  assert.match(worker, /\.upload\(pdfPath, pdfBuffer, \{ contentType: "application\/pdf", upsert: false \}\)/);
  assert.match(worker, /supabase\.rpc\("publish_document_pdf_job"/);
  assert.match(worker, /supabase\.rpc\("complete_document_pdf_job"/);
  assert.match(worker, /p_lease_token: job\.lease_token/);
  assert.match(worker, /supabase\.rpc\("fail_document_pdf_job"/);
  assert.match(worker, /recommendationFromSnapshot/);
  assert.doesNotMatch(worker, /parent_snapshot_input/);
  assert.doesNotMatch(worker, /workbook_source\?\.path \|\| job\.source_file_path/);
  assert.doesNotMatch(worker, /loadRecommendationContext/);
  assert.doesNotMatch(worker, /PDF final rekomendasi hanya dapat dibuat setelah surat selesai/);
  assert.doesNotMatch(worker, /final\.pdf/);
  assert.doesNotMatch(worker, /\.from\("document_pdf_jobs"\)\s*\.update/);
  assert.doesNotMatch(worker, /\.from\("surat_registrasi"\)\s*\.update/);
  assert.doesNotMatch(worker, /\.from\("surat_signatures"\)\s*\.update/);
});

test("PGD-looking recommendation still uses workbook pages instead of direct PGD rendering", async () => {
  const fixture = JSON.parse(await readFile(new URL("../fixtures/recommendation-multi-detail-v1.json", import.meta.url), "utf8"));
  const items = resolveRecommendationSource({
    recommendation_multi_detail: fixture,
    form_name: "FORM PERMINTAAN BARANG & JASA",
  });
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("PGD");
  const pages = await appendRecommendationPages(workbook, items, async () => image(100, 100));
  assert.equal(shouldRenderDirectPgd(items, true), false);
  assert.equal(pages.length, 1);
  assert.equal(workbook.worksheets[1].name, "Rekomendasi 1");
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

test("omits detail numbering when an applicant item only has one detail", async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Dokumen").getCell("A1").value = "Dokumen utama";
  const wide = await image(400, 100);
  const tall = await image(100, 400);
  const pages = await appendRecommendationPages(workbook, canonical(8), async (source) => source.id.endsWith("1") ? wide : tall);
  assert.equal(workbook.worksheets.length, pages.length + 1);
  const firstItemSheet = workbook.worksheets[1];
  assert.match(String(firstItemSheet.getCell("A1").value), /^ITEM 1 - Laptop Pemohon$/);
  assert.equal(String(firstItemSheet.getCell("A2").value), "Pemeriksaan");
  assert.doesNotMatch(String(firstItemSheet.getCell("A2").value), /DETAIL|1\.1/);
  const continuationSheet = workbook.worksheets.at(-1);
  assert.equal(String(continuationSheet.getCell("A2").value), "Kondisi alat (LANJUTAN)");
  assert.equal(continuationSheet.pageSetup.printArea, "A1:L33");
  const ranges = workbook.worksheets.flatMap((sheet) => sheet.getImages().map((entry) => entry.range));
  assert.ok(ranges.some((range) => Math.abs(range.ext.width / range.ext.height - 4) < 0.05));
  assert.ok(ranges.some((range) => Math.abs(range.ext.width / range.ext.height - 0.25) < 0.05));
});

test("uses hierarchical numbering only when one applicant item has multiple details", async () => {
  const workbook = new ExcelJS.Workbook();
  const pages = await appendRecommendationPages(workbook, canonicalMultiDetail(), async () => image(100, 100));

  assert.equal(pages.length, 2);
  assert.equal(pages[0].showDetailNumber, true);
  assert.equal(pages[1].showDetailNumber, true);
  assert.equal(String(workbook.worksheets[0].getCell("A2").value), "DETAIL 1.1 - CPU Intel Core i9");
  assert.equal(String(workbook.worksheets[1].getCell("A2").value), "DETAIL 1.2 - RAM 32 GB");
});

test("fails rendering when required image download or decoding fails", async () => {
  const workbook = new ExcelJS.Workbook();
  await assert.rejects(
    appendRecommendationPages(workbook, canonical(1), async () => { throw new Error("offline"); }),
    /Gagal mengunduh gambar/,
  );
  await assert.rejects(
    appendRecommendationPages(new ExcelJS.Workbook(), canonical(1), async () => Buffer.from("not-image")),
    /Gagal membaca gambar/,
  );
});

test("uses stable canonical path and isolated regeneration version path", () => {
  assert.equal(recommendationVersionPath("surat-1", "job-2"), "pdf/recommendations/surat-1/versions/job-2.pdf");
  assert.notEqual(recommendationVersionPath("surat-1", "stale-job"), recommendationVersionPath("surat-1", "fresh-job"));
});

test("keeps not-recommended parent with no explicit details in combined PDF", () => {
  const items = resolveRecommendationSource({ recommendation_multi_detail: { items: [{
    id: "rejected-parent", applicant_original: { name: "Server lama" }, status: "not_recommended",
    location: "Ruang IT", pic: "Sari", rejection_reason: "Tidak ekonomis", details: [],
  }] } });
  const pages = buildRecommendationPagePlan(items);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].detailStatus, "not_recommended");
  assert.equal(pages[0].rejectionReason, "Tidak ekonomis");
  assert.equal(pages[0].showDetailNumber, false);
});
