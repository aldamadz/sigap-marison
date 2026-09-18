import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPgdDocumentDefinition,
  createPgdPreviewData,
  isPgdDocument,
  normalizePgdDocumentData,
  renderPgdPdf,
  resolvePgdMasterForm,
} from "../pgd-pdf-renderer.mjs";

const PGD_MASTER_FORM = { id: "form-pgd", nama_form: "FORM PERMINTAAN BARANG & JASA", nomor_form: "FM-UAI.PGD-01-00" };
const NON_PGD_MASTER_FORM = { id: "form-rec", nama_form: "FORM REKOMENDASI", nomor_form: "FM-UAI.HRD-30-00" };

const stubClient = ({ usage = null, usageError = null } = {}) => ({
  from: (table) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => {
          return { data: usage, error: usageError };
        },
      }),
    }),
  }),
});

test("detects PGD from the persisted form snapshot", () => {
  assert.equal(isPgdDocument({ location_snapshot: { form: { nama_form: "FORM PERMINTAAN BARANG & JASA" } } }), true);
  assert.equal(isPgdDocument({ location_snapshot: { form: { nama_form: "FORM REKOMENDASI" } } }), false);
});

test("detects PGD from resolved canonical master form when snapshot form is empty", async () => {
  const surat = {
    id: "surat-baru",
    form_usage_id: "usage-pgd",
    form_input_data: { request_category: "asset", items: [{ nama_barang: "Laptop", jumlah: 1 }] },
    location_snapshot: { form: {} },
    data_snapshot: {},
  };
  assert.equal(isPgdDocument(surat), false);
  const masterForm = await resolvePgdMasterForm(
    stubClient({ usage: { id: "usage-pgd", form_id: "form-pgd", master_forms: PGD_MASTER_FORM } }),
    surat.form_usage_id,
  );
  assert.deepEqual(masterForm, PGD_MASTER_FORM);
  assert.equal(isPgdDocument({ ...surat, resolved_master_form: masterForm }), true);
  const pdf = await renderPgdPdf(normalizePgdDocumentData({ ...surat, resolved_master_form: masterForm }));
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
});

test("rejects non-PGD forms even with a PGD-like category", () => {
  const surat = {
    form_usage_id: "usage-rec",
    form_input_data: { request_category: "asset" },
    location_snapshot: { form: {} },
    data_snapshot: {},
  };
  assert.equal(isPgdDocument({ ...surat, resolved_master_form: NON_PGD_MASTER_FORM }), false);
  assert.equal(isPgdDocument({ form_input_data: { request_category: "asset" } }), false);
});

test("fails closed on missing or invalid form usage", async () => {
  const client = (overrides) => stubClient(overrides);
  assert.equal(await resolvePgdMasterForm(client({}), null), null);
  assert.equal(await resolvePgdMasterForm(client({}), undefined), null);
  assert.equal(await resolvePgdMasterForm(client({ usage: null }), "usage-hilang"), null);
  assert.equal(await resolvePgdMasterForm(client({ usage: { id: "usage-tanpa-form" } }), "usage-tanpa-form"), null);
  assert.equal(await resolvePgdMasterForm(client({ usage: { id: "u", form_id: "f" } }), "u"), null);

  const errorObj = new Error("db down");
  await assert.rejects(resolvePgdMasterForm(client({ usage: null, usageError: errorObj }), "u"), (err) => {
    assert.strictEqual(err, errorObj);
    return true;
  });

  assert.equal(isPgdDocument({}), false);
  assert.equal(isPgdDocument({ location_snapshot: { form: {} }, data_snapshot: {} }), false);
});

test("covers all four PGD request categories with resolved canonical form", () => {
  for (const request_category of ["asset", "unit", "non_unit", "non_asset"]) {
    const surat = {
      form_usage_id: `usage-${request_category}`,
      form_input_data: { request_category },
      location_snapshot: { form: {} },
      data_snapshot: {},
    };
    assert.equal(isPgdDocument(surat), false);
    assert.equal(isPgdDocument({ ...surat, resolved_master_form: PGD_MASTER_FORM }), true);
    assert.equal(isPgdDocument({ ...surat, resolved_master_form: NON_PGD_MASTER_FORM }), false);
  }
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

test("renders the latest Fund user inputs in the native document", () => {
  const data = normalizePgdDocumentData({
    form_input_data: {
      request_category: "non_asset",
      fund_type: "production_cost",
      fund_amount: 1500000,
      items: [{ nama_barang: "Semen", jumlah: 10, satuan: "sak", nominal: 1500000 }],
    },
  });
  assert.equal(data.items[0].unit, "sak");
  assert.match(data.items[0].note, /Nominal: Rp 1\.500\.000/);
  assert.match(data.notes, /Jenis dana: Biaya Produksi/);
  assert.match(data.notes, /Total pengajuan: Rp 1\.500\.000/);
});

test("builds and renders every supported dynamic signature formation", async () => {
  for (let count = 2; count <= 8; count += 1) {
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
