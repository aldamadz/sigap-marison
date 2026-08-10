import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPgdDocumentDefinition,
  createPgdPreviewData,
  isPgdDocument,
  normalizePgdDocumentData,
  renderPgdPdf,
} from "../pgd-pdf-renderer.mjs";

test("detects PGD from the persisted form snapshot", () => {
  assert.equal(isPgdDocument({ location_snapshot: { form: { nama_form: "FORM PERMINTAAN BARANG & JASA" } } }), true);
  assert.equal(isPgdDocument({ location_snapshot: { form: { nama_form: "FORM REKOMENDASI" } } }), false);
});

test("normalizes database snapshots without depending on Excel", () => {
  const data = normalizePgdDocumentData({
    no_surat: "001/UAI/PBO.1/VI/2026",
    is_aset: true,
    request_place: "Magelang",
    request_date: "2026-07-01",
    form_input_data: { items: [{ nama_barang: "Laptop", jumlah: 2, sat: "Unit", status: 2 }] },
    location_snapshot: {
      department: { name: "Pengembangan Organisasi" },
      form: { nama_form: "FORM PERMINTAAN BARANG & JASA", nomor_form: "FM-UAI.PGD-01-00" },
    },
  }, {
    targetStep: 1,
    signatures: [
      { step_order: 1, role_name: "membuat", label_jabatan: "Pembuat", is_signed: true, signed_at: "2026-07-01T01:00:00Z", signer_snapshot: { full_name: "A", job_title: "Manager Pengembangan Organisasi", job_title_display: "Mgr. PO" } },
      { step_order: 2, role_name: "menyetujui", is_signed: true, signed_at: "2026-07-01T02:00:00Z", signer_snapshot: { full_name: "B", job_title: "Manager" } },
    ],
  });
  assert.equal(data.items[0].name, "Laptop");
  assert.equal(data.signatures[0].signed, true);
  assert.equal(data.signatures[0].job, "Mgr. PO");
  assert.equal(data.signatures[1].signed, false);
});

test("renders canonical parent rejection status and reason on PGD item", () => {
  const data = normalizePgdDocumentData({
    form_input_data: { items: [{ id: "parent-1", nama_barang: "Laptop", jumlah: 1 }] },
    data_snapshot: { recommendation: { items: [{
      id: "parent-1",
      parent_item_index: 1,
      applicant_original: { name: "Laptop" },
      status: "not_recommended",
      rejection_reason: "Biaya perbaikan terlalu tinggi",
      details: [],
    }] } },
  });
  assert.equal(data.items[0].revisionAction, "reject");
  assert.match(data.items[0].note, /Tidak direkomendasikan: Biaya perbaikan terlalu tinggi/);
});

test("builds and renders every supported dynamic signature formation", async () => {
  for (let count = 3; count <= 8; count += 1) {
    const data = createPgdPreviewData({ signature_count: count });
    const definition = buildPgdDocumentDefinition(data);
    assert.equal(definition.pageSize, "A4");
    assert.equal(definition.pageOrientation, "landscape");
    assert.ok(Array.isArray(definition.content));
    const mainTable = definition.content.find((item) => item?.table?.body);
    assert.ok(mainTable, "PGD document should contain the main table");
    const serializedDefinition = JSON.stringify(definition);
    assert.ok(serializedDefinition.includes("Cabang/Departemen"));
    assert.ok(serializedDefinition.includes("No. Dokumen"));
    assert.ok(serializedDefinition.includes("Membuat"));
    const pdf = await renderPgdPdf(data);
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    assert.ok(pdf.length > 10_000, `PDF ${count} signer terlalu kecil`);
  }
});
