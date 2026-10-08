import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPgdDocumentDefinition, normalizePgdDocumentData, renderPgdPdf } from "../pgd-pdf-renderer.mjs";
import { buildKeu1DocumentDefinition, normalizeKeu1DocumentData, renderKeu1Pdf } from "../keu1-pdf-renderer.mjs";
import { buildKeu10DocumentDefinition, normalizeKeu10DocumentData, renderKeu10Pdf } from "../keu10-pdf-renderer.mjs";

const reason = "Kebutuhan aktual hanya tiga unit.";
const options = { signatures: ["membuat","memeriksa","verifikator","menyetujui"].map((role_name,index) => ({
  role_name, step_order:index+1, signer_snapshot:{ full_name:`Pejabat ${index+1}`, job_title:role_name }, is_signed:false,
})) };
const source = {
  no_surat: "001/TEST/X/2026", request_date: "2026-10-08", request_place: "Magelang",
  form_input_data: { request_category: "asset", items: [{ id: "item-1", nama_barang: "Komputer", keterangan: "Komputer", jumlah: 3, satuan: "Unit", estimasi_harga_satuan: 500000 }] },
  data_snapshot: { applied_revision: { reason, changes: { signer_revision_required: true,
    item_revisions: [{ index: 0, nama_barang: "Komputer", action: "adjust", value_type: "quantity", nilai_diajukan: "5", nilai_disetujui: "3", alasan: reason }] } } },
};
for (const [name, normalize, definition, render] of [
  ["PGD",normalizePgdDocumentData,buildPgdDocumentDefinition,renderPgdPdf],
  ["KEU1",normalizeKeu1DocumentData,buildKeu1DocumentDefinition,renderKeu1Pdf],
  ["KEU10",normalizeKeu10DocumentData,buildKeu10DocumentDefinition,renderKeu10Pdf],
]) {
  const data=normalize({ ...source, resolved_master_form: { nomor_form: name === "KEU10" ? "FM-UAI.KEU-10-00" : name === "KEU1" ? "FM-UAI.KEU-01-00" : "FM-UAI.PGD-01-00" } },options);
  const serialized=JSON.stringify(definition(data));
  for (const text of ["Diajukan: 5", "Disetujui: 3", reason]) assert.ok(serialized.includes(text),`${name} missing revision evidence: ${text}`);
  const buffer=await render(data);
  assert.equal(buffer.subarray(0,5).toString(),"%PDF-");
  console.log(`${name}: requested/approved/reason present; real PDF rendered (${buffer.length} bytes)`);
}
const rejected=structuredClone(source);
rejected.data_snapshot.applied_revision.changes.item_revisions[0].action="reject";
assert.ok(JSON.stringify(buildPgdDocumentDefinition(normalizePgdDocumentData(rejected))).includes("Tidak disetujui"));
const keu10=structuredClone(source);
keu10.resolved_master_form={nomor_form:"FM-UAI.KEU-10-00"};
keu10.data_snapshot.applied_revision.changes={keu10_finance_proposal:true,
  keu10_base:{document_snapshot:{form_input_data:{items:[{id:"item-1",keterangan:"Komputer",jumlah:5,estimasi_harga_satuan:500000}]}}},
  confirmed_input:{items:keu10.form_input_data.items}};
const comparison=JSON.stringify(buildKeu10DocumentDefinition(normalizeKeu10DocumentData(keu10,options)));
assert.ok(comparison.includes("Diajukan: Jumlah: 5") && comparison.includes("Disetujui: Jumlah: 3"));
keu10.data_snapshot.applied_revision.changes.confirmed_input.items[0].estimasi_harga_satuan=400000;
keu10.data_snapshot.applied_revision.changes.confirmed_input.items.push({ id:"added",keterangan:"Barang tambahan",jumlah:1,satuan:"Unit",estimasi_harga_satuan:50000 });
const multiple=JSON.stringify(buildKeu10DocumentDefinition(normalizeKeu10DocumentData(keu10,options)));
assert.ok(multiple.includes("Rp 400.000") && multiple.includes("Ditambahkan: Barang tambahan") && multiple.includes("Total: Rp 1.200.000"));
assert.ok(readFileSync("dockerfile","utf8").includes("COPY document-revision-notes.mjs ./document-revision-notes.mjs"));
console.log("Requester revision PDF: all assertions passed");
