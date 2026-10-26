import assert from "node:assert";
import {
  buildKeu1DocumentDefinition,
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
assert.equal(data.locationLabel, "Cabang");
assert.equal(data.locationValue, "Jepara");
assert.equal(data.items.length, 3);
assert.strictEqual(data.grandTotal, 2_250_000);
assert.strictEqual(data.previousFreeCash, 250_000);
assert.equal(data.hasPreviousFreeCash, true);
assert.strictEqual(data.kebutuhanDana, 2_000_000);
assert.equal(data.signaturePlace, "Jepara");
assert.strictEqual(data.items[0].total, 1_000_000);
assert.strictEqual(data.items[1].total, 500_000);
assert.strictEqual(data.items[2].total, 750_000);

const branchHeader = buildKeu1DocumentDefinition(data).content[1].table.body;
assert.equal(branchHeader[0][0].text, "Cabang");
assert.equal(branchHeader[0][2].text, "Tanggal");
assert.equal(branchHeader[1][0].text, "No. Dokumen");
assert.equal(branchHeader.flat().some((cell) => cell.text === "Proyek" || cell.text === "Departemen"), false);
const branchDefinition = buildKeu1DocumentDefinition(data);
assert.deepEqual(branchDefinition.content[0].table.widths, ["18%", "52%", "30%"]);
assert.equal(branchDefinition.content[0].table.body[0][2].table.body[0][1].text, "FM-UAI.KEU-01-00");
assert.equal(branchDefinition.content[1].layout.vLineWidth(1), 0);
assert.equal(branchDefinition.content[1].layout.vLineWidth(2), 0);
assert.equal(branchDefinition.content[1].layout.vLineWidth(3), 0);
assert.equal(branchDefinition.content[1].layout.hLineWidth(1), 0);
assert.equal(branchDefinition.content[3].table.body[4][0].text, "");
assert.equal(branchDefinition.content[3].table.body[4][4].text, "");
assert.equal(branchDefinition.content[3].table.body[4][5].text, "");
assert.equal(branchDefinition.content[4].table.body.length, 3);
assert.equal(branchDefinition.content[4].table.body[0][0].alignment, "left");
assert.equal(branchDefinition.content[4].table.body[1][0].text, "Free Cash Sisa Bulan Lalu");
assert.equal(branchDefinition.content[4].layout.vLineWidth(1), 0.7);
assert.equal(branchDefinition.content[4].layout.vLineWidth(0), 0.7);
assert.equal(branchDefinition.content[4].layout.vLineWidth(2), 0.7);
assert.equal(branchDefinition.content[4].layout.hLineWidth(1, branchDefinition.content[4]), 0);
assert.equal(branchDefinition.content[4].layout.hLineWidth(0, branchDefinition.content[4]), 0.7);
assert.equal(branchDefinition.content[4].layout.hLineWidth(3, branchDefinition.content[4]), 0.7);
assert.equal(branchDefinition.content[6].columns[1].stack[0].table.body[0][0].text, "Jepara, 15 Agustus 2024");
assert.equal(branchDefinition.content[6].columns[1].stack[0].layout.vLineWidth(0), 0.7);

const pusatData = normalizeKeu1DocumentData({
  ...surat,
  location_snapshot: {
    ...surat.location_snapshot,
    office: { name: "Kantor Pusat", kedudukan: "Pusat" },
  },
});
const pusatHeader = buildKeu1DocumentDefinition(pusatData).content[1].table.body;
assert.equal(pusatHeader[0][0].text, "Departemen");
assert.equal(pusatHeader[0][1].text, ": Keuangan & Akuntansi");
assert.equal(pusatHeader.flat().some((cell) => cell.text === "Cabang" || cell.text === "Proyek"), false);
assert.equal(pusatData.signaturePlace, "Magelang");

const emptyCashData = normalizeKeu1DocumentData({
  ...surat,
  form_input_data: { ...surat.form_input_data, free_cash_sisa_bulan_lalu: "" },
});
assert.equal(emptyCashData.hasPreviousFreeCash, false);
assert.equal(buildKeu1DocumentDefinition(emptyCashData).content[4].table.body.length, 2);
const explicitZeroCashData = normalizeKeu1DocumentData({
  ...surat,
  form_input_data: { ...surat.form_input_data, free_cash_sisa_bulan_lalu: 0 },
});
assert.equal(explicitZeroCashData.hasPreviousFreeCash, true);
assert.equal(buildKeu1DocumentDefinition(explicitZeroCashData).content[4].table.body.length, 3);

const soloData = normalizeKeu1DocumentData({
  ...surat,
  location_snapshot: { ...surat.location_snapshot, office: { name: "KC. Solo", kedudukan: "KC" } },
});
assert.equal(soloData.signaturePlace, "Solo");
const magelangData = normalizeKeu1DocumentData({
  ...surat,
  location_snapshot: { ...surat.location_snapshot, office: { name: "Kantor Cabang Magelang", kedudukan: "KC" } },
});
assert.equal(magelangData.signaturePlace, "Magelang");
const kcpData = normalizeKeu1DocumentData({
  ...surat,
  location_snapshot: { ...surat.location_snapshot, office: { name: "KCP. Sragen", kedudukan: "KCP" } },
});
assert.equal(kcpData.signaturePlace, "Sragen");

const blankItemData = normalizeKeu1DocumentData({
  ...surat,
  form_input_data: { ...surat.form_input_data, items: [{ keterangan: "Jasa tanpa harga", jumlah: 1 }, {}] },
});
const blankItemRows = buildKeu1DocumentDefinition(blankItemData).content[3].table.body;
assert.equal(blankItemRows[1][0].text, "1");
assert.equal(blankItemRows[1][4].text, "");
assert.equal(blankItemRows[1][5].text, "");
assert.equal(blankItemRows[2][0].text, "");

const previewData = createKeu1PreviewData({ signature_count: 4, signature_roles: [1, 2, 1] });
assert.equal(previewData.items.length >= 3, true);
assert.strictEqual(previewData.grandTotal, 2_250_000);
assert.equal(previewData.signatures.length, 4);
assert.equal(previewData.signatures[0].role, "Membuat");
assert.equal(previewData.signatures[3].role, "Menyetujui");
assert.equal(previewData.signaturePlace, "Jepara");

const pdfBuffer = await renderKeu1Pdf(data, { logoPath: null });
assert.ok(Buffer.isBuffer(pdfBuffer));
assert.ok(pdfBuffer.length > 0);
assert.strictEqual(pdfBuffer.subarray(0, 4).toString("utf8"), "%PDF");

const eightSignerPdf = await renderKeu1Pdf(createKeu1PreviewData({ signature_count: 8, signature_roles: [1, 6, 1] }));
assert.strictEqual((eightSignerPdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length, 1);

console.log("KEU 1 PDF renderer tests passed");
