import assert from "node:assert";
import {
  createKeu1PreviewData,
  isKeu1Document,
  normalizeKeu1DocumentData,
  renderKeu1Pdf,
} from "../keu1-pdf-renderer.mjs";

const KEU1_MASTER_FORM = { id: "form-keu1", nama_form: "Form Pengajuan Kas Kecil", nomor_form: "FM-UAI.KEU-01-00" };
const NON_KEU1_MASTER_FORM = { id: "form-pgd", nama_form: "Form Permintaan Barang & Jasa", nomor_form: "FM-UAI.PGD-01-00" };

assert.equal(isKeu1Document({ location_snapshot: { form: { nama_form: "Form Pengajuan Kas Kecil" } } }), true);
assert.equal(isKeu1Document({ location_snapshot: { form: { nama_form: "FORM PENGAJUAN KAS KECIL" } } }), true);
assert.equal(isKeu1Document({ location_snapshot: { form: { nomor_form: "FM-UAI.KEU-01-00" } } }), true);
assert.equal(isKeu1Document({ resolved_master_form: KEU1_MASTER_FORM }), true);
assert.equal(isKeu1Document({ resolved_master_form: NON_KEU1_MASTER_FORM }), false);
assert.equal(isKeu1Document({}), false);

const surat = {
  no_surat: "042/UAI/KEU/VIII/2026",
  request_place: "Jepara",
  request_date: "2024-08-15T00:00:00.000Z",
  location_snapshot: {
    form: { nama_form: "Form Pengajuan Kas Kecil", nomor_form: "FM-UAI.KEU-01-00" },
    office: { name: "Jepara", kedudukan: "Cabang" },
    department: { name: "Keuangan & Akuntansi" },
  },
  form_input_data: {
    request_category: "non_asset",
    items: [
      { keterangan: "Listrik kantor", jumlah: 1, satuan: "Bulan", estimasi_harga_satuan: 1_000_000 },
      { keterangan: "Keamanan", jumlah: 1, satuan: "Bulan", estimasi_harga_satuan: 500_000 },
      { keterangan: "BPJS Kesehatan", jumlah: 1, satuan: "Bulan", estimasi_harga_satuan: 750_000 },
    ],
    free_cash_sisa_bulan_lalu: 250_000,
    catatan: "Contoh pengajuan kas kecil.",
  },
};

const data = normalizeKeu1DocumentData(surat, { signatures: [] });
assert.equal(data.formNumber, "FM-UAI.KEU-01-00");
assert.equal(data.noSurat, "042/UAI/KEU/VIII/2026");
assert.equal(data.branch, "Jepara");
assert.equal(data.department, "Keuangan & Akuntansi");
assert.equal(data.items.length, 3);
assert.strictEqual(data.grandTotal, 2_250_000);
assert.strictEqual(data.previousFreeCash, 250_000);
assert.strictEqual(data.kebutuhanDana, 2_000_000);
assert.strictEqual(data.items[0].total, 1_000_000);
assert.strictEqual(data.items[1].total, 500_000);
assert.strictEqual(data.items[2].total, 750_000);

const previewData = createKeu1PreviewData({ signature_count: 4, signature_roles: [1, 2, 1] });
assert.equal(previewData.items.length >= 3, true);
assert.strictEqual(previewData.grandTotal, 2_250_000);
assert.equal(previewData.signatures.length, 4);
assert.equal(previewData.signatures[0].role, "Membuat");
assert.equal(previewData.signatures[3].role, "Menyetujui");

const pdfBuffer = await renderKeu1Pdf(data, { logoPath: null });
assert.ok(Buffer.isBuffer(pdfBuffer));
assert.ok(pdfBuffer.length > 0);
assert.strictEqual(pdfBuffer.subarray(0, 4).toString("utf8"), "%PDF");

console.log("KEU 1 PDF renderer tests passed");
