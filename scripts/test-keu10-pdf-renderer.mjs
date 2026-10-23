import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildKeu10DocumentDefinition,
  createKeu10PreviewData,
  isKeu10Document,
  normalizeKeu10DocumentData,
  renderKeu10Pdf,
  resolveKeu10MasterForm,
} from "../keu10-pdf-renderer.mjs";
import { buildKeu1DocumentDefinition, createKeu1PreviewData } from "../keu1-pdf-renderer.mjs";

const FORM_NUMBER = "FM-UAI.KEU-10-00";
const ALIAS = "FM-MBN.KEU-10-00";
const master = { id: "keu10", nama_form: "Form Biaya Pengadaan Tanah & Pengurusan Izin", nomor_form: FORM_NUMBER };
const source = {
  no_surat: "042/UAI/KEU/X/2026",
  request_date: "2026-10-06T00:00:00.000Z",
  location_snapshot: {
    form: master,
    office: { name: "Jepara", kedudukan: "Cabang" },
    project: { name: "Proyek dari snapshot" },
  },
  form_input_data: {
    requested_project: { name: "Untrusted input project" },
    items: [
      { keterangan: "Pengadaan tanah", jumlah: 2, satuan: "Bidang", estimasi_harga_satuan: 100_000_000, total: 1 },
      { name: "Pengurusan izin", quantity: 3, unit: "Paket", unit_price: "Rp 2.500.000", total: 999_999_999 },
    ],
    grand_total: 999,
    free_cash_sisa_bulan_lalu: 50_000,
    kebutuhan_dana: 1,
  },
};
const keu1Before = JSON.stringify(buildKeu1DocumentDefinition(createKeu1PreviewData()));

for (const number of [FORM_NUMBER, ALIAS, ` ${ALIAS.toLowerCase()} `]) {
  for (const input of [
    { location_snapshot: { form: { nomor_form: number } } },
    { data_snapshot: { form: { nomor_form: number } } },
    { resolved_master_form: { ...master, nomor_form: number } },
    { formName: number },
    { formNumber: number },
  ]) assert.equal(isKeu10Document(input), true);
}
for (const input of [
  {}, null,
  { formName: master.nama_form },
  { location_snapshot: { form: { nama_form: master.nama_form } } },
  { resolved_master_form: { ...master, nomor_form: "FM-UAI.KEU-01-00" } },
  { resolved_master_form: { ...master, nomor_form: "FM-UAI.PGD-01-00" } },
  { formNumber: "FM-OTHER.KEU-10-00" },
  { formNumber: `${FORM_NUMBER}-EXTRA` },
  { location_snapshot: { form: master }, resolved_master_form: { ...master, nomor_form: "FM-UAI.KEU-01-00" } },
  { location_snapshot: { form: master }, data_snapshot: { form: { nomor_form: "FM-UAI.PGD-01-00" } } },
]) assert.equal(isKeu10Document(input), false);
assert.throws(() => normalizeKeu10DocumentData({ formName: master.nama_form }), /bukan form KEU 10/);
assert.throws(() => buildKeu10DocumentDefinition({ formNumber: "FM-UAI.KEU-01-00" }), /bukan form KEU 10/);

const mockClient = (data, error = null) => ({ from(table) {
  assert.equal(table, "form_usages");
  return { select(columns) {
    assert.equal(columns, "id, form_id, master_forms(id, nama_form, nomor_form)");
    return { eq(column, id) {
      assert.equal(column, "id");
      assert.equal(id, "usage-10");
      return { async maybeSingle() { return { data, error }; } };
    } };
  } };
} });
assert.equal(await resolveKeu10MasterForm(null, null), null);
for (const number of [FORM_NUMBER, ALIAS]) {
  const form = { ...master, nomor_form: number };
  for (const embedded of [form, [form]]) {
    assert.deepEqual(await resolveKeu10MasterForm(mockClient({ form_id: form.id, master_forms: embedded }), "usage-10"), form);
  }
}
for (const result of [null, {}, { form_id: master.id, master_forms: null },
  { form_id: "other", master_forms: master },
  { form_id: master.id, master_forms: [master, master] },
  { form_id: master.id, master_forms: { ...master, nomor_form: "FM-UAI.PGD-01-00" } },
]) assert.equal(await resolveKeu10MasterForm(mockClient(result), "usage-10"), null);
const databaseError = new Error("Lookup failed");
await assert.rejects(resolveKeu10MasterForm(mockClient(null, databaseError), "usage-10"), databaseError);

const record = (step, role, name, job, signed = true) => ({
  id: `signature-${step}`, step_order: step, role_name: role,
  signer_snapshot: { full_name: name, job_title_display: job },
  status: signed ? "APPROVED" : "PENDING",
  is_signed: signed, signed_at: signed ? `2026-10-06T0${step}:00:00.000Z` : null,
});
const baseSignatures = [
  record(1, "Membuat", "Requester Asli", "Branch Manager"),
  record(2, "Memeriksa", "Pemeriksa Asli", "Manager Pengembangan Bisnis"),
  record(3, "Verifikator", "Finance Asli", "Mgr. Keu & Akt"),
  record(4, "Menyetujui", "Direktur Satu Asli", "Direktur I"),
];
const fiveSignatures = [
  baseSignatures[0],
  record(2, "Memeriksa", "Legal Asli", "Manager Legal"),
  record(3, "Memeriksa", "Direktur Satu Asli", "Direktur I"),
  record(4, "Verifikator", "Finance Asli", "Mgr. Keu & Akt"),
  record(5, "Menyetujui", "Direktur Utama Asli", "Direktur Utama"),
];
const president = record(6, "Menyetujui", "Direktur Utama Asli", "Direktur Utama", false);
const sixSignatures = [
  baseSignatures[0],
  record(2, "Memeriksa", "Legal Asli", "Manager Legal"),
  record(3, "Memeriksa", "Pemeriksa Asli", "Manager Pengembangan Bisnis"),
  record(4, "Memeriksa", "Direktur Satu Asli", "Direktur I"),
  record(5, "Verifikator", "Finance Asli", "Mgr. Keu & Akt"),
  president,
];
const before = JSON.stringify({ source, sixSignatures });
const data = normalizeKeu10DocumentData(source, { signatures: sixSignatures.slice().reverse() });
assert.equal(JSON.stringify({ source, sixSignatures }), before);
assert.equal(data.formNumber, FORM_NUMBER);
assert.equal(data.noSurat, source.no_surat);
assert.equal(data.branch, "Jepara");
assert.equal(data.project, "Proyek dari snapshot");
assert.equal(data.requestDate, "6 Oktober 2026");
assert.equal(data.grandTotal, 207_500_000);
assert.deepEqual(data.items.map((item) => item.total), [200_000_000, 7_500_000]);
assert.deepEqual(data.items.map((item) => item.no), [1, 2]);
for (const key of ["previousFreeCash", "hasPreviousFreeCash", "kebutuhanDana", "isAsset", "status"]) assert.equal(key in data, false);
assert.equal(data.signatures[4].name, "Finance Asli");
assert.equal(data.signatures[4].signed, true);
assert.equal(data.signatures[4].signedAt, sixSignatures[4].signed_at);
assert.equal(data.signatures[5].signed, false);
assert.equal(data.signatures[5].signedAt, null);
const targeted = normalizeKeu10DocumentData(source, { signatures: sixSignatures, targetStep: 2 });
assert.equal(targeted.signatures[4].signed, false);
assert.equal(targeted.signatures[4].signedAt, null);
assert.equal(normalizeKeu10DocumentData({ ...source, status: "completed" }).signatures.length, 0);
assert.equal(normalizeKeu10DocumentData(source, { signatures: baseSignatures.slice(0, 2) }).signatures.some((item) => item.name === "Finance Asli"), false);
assert.equal(normalizeKeu10DocumentData(source, { signatures: [record(1, "verifikator", "A", "Finance")] }).signatures[0].role, "Verifikator");
const financeChecker = normalizeKeu10DocumentData(source, { signatures: [
  record(1, "Membuat", "Requester", "Staff"), record(2, "Memeriksa", "Finance Checker", "Mgr. Keu & Akt"),
] });
assert.equal(financeChecker.signatures[1].role, "Memeriksa");
assert.equal(financeChecker.signatures.length, 2);
const pendingVerifier = normalizeKeu10DocumentData(source, { signatures: [
  ...baseSignatures.slice(0, 2), record(3, "Verifikator", "Finance Asli", "Mgr. Keu & Akt", false), baseSignatures[3],
] });
assert.equal(pendingVerifier.signatures[2].signed, false);
assert.equal(pendingVerifier.signatures[2].signedAt, null);

const fallback = normalizeKeu10DocumentData({
  data_snapshot: { form: { nomor_form: ALIAS }, input: source.form_input_data, location: { project: { name: "Snapshot fallback" } } },
});
assert.equal(fallback.formNumber, ALIAS);
assert.equal(fallback.project, "Snapshot fallback");
assert.equal(fallback.grandTotal, data.grandTotal);
const blankRows = buildKeu10DocumentDefinition(data).content[1].table.body;
assert.equal(blankRows[1][0].text, "1");
assert.equal(blankRows.length, 13);
for (const row of blankRows.slice(3)) assert.ok(row.every((item) => item.text === ""));
const validItem = source.form_input_data.items[0];
const withItems = (items) => ({ ...source, form_input_data: { items } });
assert.throws(() => normalizeKeu10DocumentData(withItems(Array.from({ length: 101 }, () => validItem))), /maksimal 100/);
assert.throws(() => buildKeu10DocumentDefinition({ ...data, items: Array.from({ length: 101 }, () => data.items[0]) }), /maksimal 100/);
await assert.rejects(renderKeu10Pdf({ ...data, items: Array.from({ length: 101 }, () => data.items[0]) }), /maksimal 100/);
for (const items of [undefined, null, {}, [], [{}], [null], ["not a row"], [[]], [validItem, null]]) {
  assert.throws(() => normalizeKeu10DocumentData(withItems(items)), /KEU 10/);
}
for (const qty of [undefined, null, "", " ", 0, -1, 0.0000001, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1,
  "1.0000001", "-2", "1e2", "abc2", true, false, [], {}, "9007199254740992"]) {
  assert.throws(() => normalizeKeu10DocumentData(withItems([{ ...validItem, jumlah: qty }])), /Jumlah atau harga/);
}
for (const price of [undefined, null, "", " ", -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1,
  "Rp -1.000", "-1000", "1e3", "abc1000", "1000abc", "1.50", "1,25", "1.000,000", "9007199254740992", true, false, [], {}]) {
  assert.throws(() => normalizeKeu10DocumentData(withItems([{ ...validItem, estimasi_harga_satuan: price }])), /Jumlah atau harga/);
}
assert.throws(() => normalizeKeu10DocumentData(withItems([{ ...validItem, estimasi_harga_satuan: 0 }])), /harus positif/);
assert.throws(() => normalizeKeu10DocumentData(withItems([{ ...validItem, keterangan: "" }])), /wajib diisi/);
assert.throws(() => normalizeKeu10DocumentData(withItems([{ ...validItem, satuan: "" }])), /wajib diisi/);
for (const price of [1000, "1000", "1.000", "1,000", "Rp 1.000", "Rp. 1.000", "1 000"]) {
  const normalized = normalizeKeu10DocumentData(withItems([{ ...validItem, jumlah: "2", estimasi_harga_satuan: price }]));
  assert.equal(normalized.items[0].hargaSatuan, 1000);
  assert.equal(normalized.grandTotal, 2000);
}
const zeroPrice = normalizeKeu10DocumentData(withItems([validItem, { ...validItem, estimasi_harga_satuan: 0 }]));
assert.equal(zeroPrice.items[1].total, 0);
assert.equal(buildKeu10DocumentDefinition({ ...zeroPrice, signatures: data.signatures }).content[1].table.body[2][5].text, "Rp 0");
assert.throws(() => normalizeKeu10DocumentData({ ...source, form_input_data: { items: [
  { ...validItem, jumlah: Number.MAX_SAFE_INTEGER, estimasi_harga_satuan: 2 },
] } }), /rentang angka aman/);
assert.throws(() => normalizeKeu10DocumentData({ ...source, form_input_data: { items: [
  { ...validItem, jumlah: 1, estimasi_harga_satuan: Number.MAX_SAFE_INTEGER }, { ...validItem, jumlah: 1, estimasi_harga_satuan: 1 },
] } }), /rentang angka aman/);
for (const item of [{ ...data.items[0], jumlah: 0 }, { ...data.items[0], jumlah: 0.0000001 },
  { ...data.items[0], hargaSatuan: -1 }, { ...data.items[0], hargaSatuan: NaN }]) {
  assert.throws(() => buildKeu10DocumentDefinition({ ...data, items: [item] }), /Jumlah atau harga/);
  await assert.rejects(renderKeu10Pdf({ ...data, items: [item] }), /Jumlah atau harga/);
}
await assert.rejects(renderKeu10Pdf({ ...data, items: [] }), /wajib diisi/);
await assert.rejects(renderKeu10Pdf({ ...data, items: [{ ...data.items[0], hargaSatuan: 0 }], grandTotal: 999 }), /harus positif/);
const forgedDefinition = buildKeu10DocumentDefinition({ ...data, grandTotal: 1, items: data.items.map((item) => ({ ...item, total: 999 })) });
assert.equal(forgedDefinition.content[2].stack[0].table.body[0][5].text, "Rp 207.500.000");
assert.equal(forgedDefinition.content[1].table.body[1][5].text, "Rp 200.000.000");

const definition = buildKeu10DocumentDefinition(data);
for (const jumlah of [0.5, 1.5, "1,5"]) {
  const decimal = normalizeKeu10DocumentData(withItems([{ ...validItem, jumlah, estimasi_harga_satuan: 1001 }]));
  const quantity = Number(String(jumlah).replace(",", "."));
  assert.equal(decimal.items[0].jumlah, quantity);
  assert.equal(decimal.grandTotal, Math.round(quantity * 1001));
  assert.equal(buildKeu10DocumentDefinition({ ...decimal, signatures: data.signatures }).content[1].table.body[1][2].text, quantity.toLocaleString("id-ID"));
}
const header = definition.header(2, 3).table.body[0];
assert.deepEqual(header[1].stack.map((line) => line.text), ["FORM BIAYA PENGADAAN TANAH &", "PENGURUSAN IZIN"]);
assert.ok(header[1].stack.every((line) => line.noWrap === true));
assert.equal(header[2].table.body[1][1].text, "2 Dari 3");
assert.equal(header[2].table.body[0][1].text, FORM_NUMBER);
assert.deepEqual(definition.content[0].table.body.map((row) => [row[0].text, row[2].text]), [
  ["Cabang", "Tanggal"], ["Proyek", "No. Dokumen"],
]);
assert.equal(definition.content[1].table.headerRows, 1);
assert.equal(definition.content[1].table.dontBreakRows, true);
assert.equal(definition.content[2].unbreakable, true);
assert.equal(definition.content[2].stack[0].table.body[0][0].text, "GRAND TOTAL");
assert.equal(definition.content[2].stack[0].table.body[0][5].text, "Rp 207.500.000");
assert.doesNotMatch(JSON.stringify(definition), /Free Cash|KEBUTUHAN DANA|Kas Kecil|Status/);
const signatureTable = (value) => buildKeu10DocumentDefinition(value).content[2].stack[1].table;
assert.equal(signatureTable(pendingVerifier).body[1][2].text, "");
assert.equal(signatureTable(pendingVerifier).body[2][2].text, "FINANCE ASLI");
const canonicalFive = normalizeKeu10DocumentData(source, { signatures: fiveSignatures });
assert.deepEqual(canonicalFive.signatures.map((signature) => [signature.role, signature.job]), [
  ["Membuat", "Branch Manager"], ["Memeriksa", "Manager Legal"], ["Memeriksa", "Direktur I"],
  ["Verifikator", "Mgr. Keu & Akt"], ["Menyetujui", "Direktur Utama"],
]);
assert.equal(canonicalFive.signatures.filter((signature) => signature.role === "Verifikator").length, 1);
assert.equal(canonicalFive.signatures[3].signedAt, fiveSignatures[3].signed_at);
for (const signatures of [
  [], undefined, data.signatures.slice(0, 2),
  canonicalFive.signatures.map((signature, index) => index === 1 ? { ...signature, role: "Verifikator" } : signature),
  canonicalFive.signatures.map((signature, index) => index === 3 ? { ...signature, role: "Memeriksa" } : signature),
  canonicalFive.signatures.map((signature, index) => index === 4 ? { ...signature, role: "Verifikator" } : signature),
  [...canonicalFive.signatures.slice(0, 3), canonicalFive.signatures[4], canonicalFive.signatures[3]],
]) {
  assert.throws(() => buildKeu10DocumentDefinition({ ...data, signatures }), /Grup tanda tangan KEU 10/);
  await assert.rejects(renderKeu10Pdf({ ...data, signatures }), /Grup tanda tangan KEU 10/);
}
for (const signatures of [baseSignatures, fiveSignatures, sixSignatures]) {
  const normalized = normalizeKeu10DocumentData(source, { signatures });
  const table = signatureTable(normalized);
  assert.equal(table.widths.length, signatures.length);
  assert.equal(table.body.length, 4);
  assert.ok(table.body.every((row) => row.length === signatures.length));
  const verifierIndex = signatures.length - 2;
  assert.equal(table.body[0][1].text, "Memeriksa");
  assert.equal(table.body[0][1].colSpan, signatures.length - 3);
  assert.equal(table.body[0][verifierIndex].text, "Verifikator");
  assert.equal(table.body[0][verifierIndex].colSpan, 1);
  assert.equal(table.body[0].at(-1).text, "Menyetujui");
  assert.equal(table.body[0].at(-1).colSpan, 1);
  assert.equal(table.body[2][verifierIndex].text, "FINANCE ASLI");
  assert.match(table.body[1][verifierIndex].text, /DISETUJUI SISTEM/);
  assert.equal(table.body[3].at(-1).text, signatures.length === 4 ? "Direktur I" : "Direktur Utama");
  if (signatures.length === 6) assert.equal(table.body[1][5].text, "");
}
const previewCounts = (preview) => ["Membuat", "Memeriksa", "Verifikator", "Menyetujui"].map((role) => preview.signatures.filter((signature) => signature.role === role).length);
for (const count of [4, 5, 6]) {
  const preview = createKeu10PreviewData({ signature_count: count });
  assert.equal(preview.formNumber, FORM_NUMBER);
  assert.equal(preview.signatures.length, count);
  assert.deepEqual(previewCounts(preview), [1, count - 3, 1, 1]);
  assert.equal(preview.signatures[0].job, "Branch Manager");
  assert.equal(preview.signatures.at(-2).job, "Mgr. Keu & Akt");
  assert.equal(preview.signatures.at(-1).job, count === 4 ? "Direktur I" : "Direktur Utama");
  assert.ok(preview.signatures.every((signature) => signature.signed === false));
  for (const roles of [[1, count - 2, 1], [1, 2, 1], [1, count - 3, 1, 1]]) {
    const options = { signature_count: count, signature_roles: roles };
    const beforeOptions = JSON.stringify(options);
    assert.deepEqual(createKeu10PreviewData(options), preview);
    assert.equal(JSON.stringify(options), beforeOptions);
  }
}
assert.equal(createKeu10PreviewData().formNumber, FORM_NUMBER);
assert.deepEqual(previewCounts(createKeu10PreviewData()), [1, 2, 1, 1]);
assert.deepEqual(createKeu10PreviewData({ signature_count: 4 }).signatures.map((signature) => signature.job), [
  "Branch Manager", "Manager Pengembangan Bisnis", "Mgr. Keu & Akt", "Direktur I",
]);
assert.deepEqual(createKeu10PreviewData({ signature_count: 5 }).signatures.map((signature) => signature.job), [
  "Branch Manager", "Manager Legal", "Direktur I", "Mgr. Keu & Akt", "Direktur Utama",
]);
assert.ok(createKeu10PreviewData({ signature_count: 4 }).grandTotal <= 2_000_000);
assert.ok(createKeu10PreviewData({ signature_count: 5 }).grandTotal > 2_000_000);
assert.throws(() => createKeu10PreviewData({ signature_count: 3 }), /4, 5, atau 6/);
for (const roles of [[1, 1, 2, 1], [2, 1, 1, 1], [1, 2, 2, 0], [1, 1, 1, 2], [1, -1, 1], [2, 1, 1], [], "invalid"]) {
  assert.throws(() => createKeu10PreviewData({ signature_count: 5, signature_roles: roles }), /grup/);
}

const longSource = { ...source, form_input_data: { items: Array.from({ length: 100 }, (_, index) => ({
  keterangan: `Biaya item ${String(index + 1).padStart(3, "0")} - pengadaan tanah dan pengurusan izin proyek`,
  jumlah: 2, satuan: "Paket", estimasi_harga_satuan: 1_000 + index, total: 0,
})) } };
const longData = normalizeKeu10DocumentData(longSource, { signatures: sixSignatures });
assert.equal(longData.items.length, 100);
assert.equal(longData.grandTotal, 209_900);
assert.equal(buildKeu10DocumentDefinition(longData).content[1].table.body.length, 101);

// Keep actual-byte checks dependency-free; Poppler adds content/layout checks when available.
const outputIndex = process.argv.indexOf("--output-dir");
if (outputIndex >= 0 && !process.argv[outputIndex + 1]) throw new Error("--output-dir requires a path");
const keepOutputs = outputIndex >= 0;
const outputDir = keepOutputs ? resolve(process.argv[outputIndex + 1]) : await mkdtemp(join(tmpdir(), "keu10-pdf-tests-"));
await mkdir(outputDir, { recursive: true });
let popplerAvailable = true;
try { execFileSync("pdftotext", ["-v"], { stdio: "pipe" }); } catch (error) {
  // Xpdf's Windows pdftotext prints its version but exits with status 1.
  popplerAvailable = /pdftotext version/i.test(`${error.stdout || ""}${error.stderr || ""}`);
}
const pageCount = (buffer) => (buffer.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
const logoPath = fileURLToPath(new URL("../public/logo-marison-regency-group.png", import.meta.url));
let renderScreenshots = keepOutputs;
if (renderScreenshots) {
  try { execFileSync("pdftoppm", ["-v"], { stdio: "pipe" }); } catch (error) {
    renderScreenshots = /pdftoppm version/i.test(`${error.stdout || ""}${error.stderr || ""}`);
  }
}
try {
  for (const [name, value] of [
    ["keu10-four", normalizeKeu10DocumentData(source, { signatures: baseSignatures })],
    ["keu10-five", canonicalFive],
    ["keu10-six", data],
    ["keu10-alias", normalizeKeu10DocumentData({ ...source, location_snapshot: { ...source.location_snapshot, form: { ...master, nomor_form: ALIAS } } }, { signatures: sixSignatures })],
    ["keu10-multipage", longData],
    ["keu10-preview-four", createKeu10PreviewData({ signature_count: 4, signature_roles: [1, 2, 1] })],
    ["keu10-preview-five", createKeu10PreviewData({ signature_count: 5, signature_roles: [1, 3, 1] })],
    ["keu10-preview-six", createKeu10PreviewData({ signature_count: 6, signature_roles: [1, 4, 1] })],
  ]) {
    assert.equal(value.signatures.filter((signature) => signature.role === "Verifikator").length, 1);
    const buffer = await renderKeu10Pdf(value, { logoPath });
    assert.ok(Buffer.isBuffer(buffer));
    assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
    assert.ok(buffer.length > 10_000);
    assert.match(buffer.toString("latin1"), /%%EOF/);
    const pages = pageCount(buffer);
    assert.ok(name === "keu10-multipage" ? pages > 1 : pages === 1, `${name}: unexpected ${pages} pages`);
    const path = join(outputDir, `${name}.pdf`);
    await writeFile(path, buffer);
    if (renderScreenshots) {
      execFileSync("pdftoppm", ["-f", "1", "-singlefile", "-scale-to", "1400", "-png", path, join(outputDir, name)], { stdio: "pipe" });
      if (pages > 1) execFileSync("pdftoppm", ["-f", String(pages), "-singlefile", "-scale-to", "1400", "-png", path, join(outputDir, `${name}-last`)], { stdio: "pipe" });
    }
    if (popplerAvailable) {
      const pdfText = execFileSync("pdftotext", ["-layout", path, "-"], { encoding: "utf8" });
      assert.ok(pdfText.includes("FORM BIAYA PENGADAAN TANAH &"));
      assert.ok(pdfText.includes("PENGURUSAN IZIN"));
      assert.ok(pdfText.includes(value.formNumber));
      assert.ok(pdfText.includes(value.project));
      assert.ok(pdfText.includes(`Rp ${value.grandTotal.toLocaleString("id-ID")}`));
      const verifierName = value.signatures.find((signature) => signature.role === "Verifikator").name.toUpperCase();
      assert.equal(pdfText.split(verifierName).length - 1, 1);
      assert.equal((pdfText.match(/Verifikator/g) || []).length, 1);
      assert.doesNotMatch(pdfText, /Free Cash|KEBUTUHAN DANA|Kas Kecil/);
      assert.equal(pdfText.includes("Direktur I"), value.signatures.some((signature) => signature.job === "Direktur I"));
      assert.equal(pdfText.includes("Direktur Utama"), value.signatures.some((signature) => signature.job === "Direktur Utama"));
      if (name === "keu10-five") {
        assert.doesNotMatch(pdfText, /Staff Cabang|Manager Pengembangan Bisnis/);
        const jobs = [...pdfText.matchAll(/Branch Manager|Manager Legal|Direktur I\b|Mgr\. Keu & Akt|Direktur Utama/g)].map((match) => match[0]);
        assert.deepEqual(jobs, ["Branch Manager", "Manager Legal", "Direktur I", "Mgr. Keu & Akt", "Direktur Utama"]);
        assert.equal(value.signatures[3].signed, true);
      }
      const pageTexts = pdfText.split("\f").filter((page) => page.trim());
      assert.equal(pageTexts.length, pages);
      for (let index = 0; index < pages; index += 1) assert.ok(pageTexts[index].includes(`${index + 1} Dari ${pages}`));
      if (pages > 1) {
        for (let index = 1; index <= 100; index += 1) assert.ok(pdfText.includes(`Biaya item ${String(index).padStart(3, "0")}`));
        for (const page of pageTexts) {
          assert.equal((page.match(/Biaya item \d{3}/g) || []).length,
            (page.match(/pengurusan izin proyek/g) || []).length, "Item descriptions must not split between pages");
        }
        assert.ok(pageTexts.at(-1).includes("GRAND TOTAL"));
        assert.ok(pageTexts.at(-1).includes("FINANCE ASLI"));
        assert.equal((pdfText.match(/GRAND TOTAL/g) || []).length, 1);
        assert.equal((pdfText.match(/FINANCE ASLI/g) || []).length, 1);
      }
    }
    console.log(`${name}: valid PDF, ${pages} page(s), ${buffer.length} bytes`);
  }
} finally {
  if (!keepOutputs) await rm(outputDir, { recursive: true, force: true });
}
assert.equal(JSON.stringify(buildKeu1DocumentDefinition(createKeu1PreviewData())), keu1Before);
console.log(`KEU 10 PDF renderer tests passed; Poppler text checks ${popplerAvailable ? "passed" : "unavailable (byte/page checks passed)"}`);
if (keepOutputs) console.log(`PDF inspection fixtures: ${outputDir}`);
if (keepOutputs) console.log(`Fresh PDF screenshots: ${renderScreenshots ? "rendered" : "pdftoppm unavailable"}`);
