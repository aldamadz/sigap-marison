import test from "node:test";
import assert from "node:assert/strict";
import { normalizePgdDocumentData, buildPgdDocumentDefinition, renderPgdPdf } from "../pgd-pdf-renderer.mjs";

const review = { id: "review", actor_name: "Lili", created_at: "2026-10-15T03:00:00Z",
  requested_count: 30, allocated_count: 3, remaining_count: 27, note: "Hanya 3 unit siap bangun. Sebanyak 27 unit belum dipenuhi." };
const source = () => ({ no_surat: "051/UAI/MKT.1.SGN/X/2026", formName: "PERMINTAAN BARANG & JASA",
  form_input_data: { request_mode: "unit", requested_unit_count: 30, catatan: "Catatan asli pemohon",
    items: [{ nama_barang: "Permohonan SPK 30 Unit", jumlah: 30, sat: "Unit", status: "2" }] },
  unit_allocation_history: [review] });
const visit = (value, predicate) => {
  if (!value || typeof value !== "object") return [];
  return [...(predicate(value) ? [value] : []), ...Object.values(value).flatMap(child => visit(child, predicate))];
};

test("Unit quantity shows original crossed out next to the latest ready count without mutating the request", () => {
  const input = source(), original = structuredClone(input);
  const data = normalizePgdDocumentData(input);
  assert.equal(data.items[0].quantity, "30");
  assert.equal(data.items[0].approvedQuantity, "3");
  const definition = buildPgdDocumentDefinition(data);
  const strikes = visit(definition, node => node.decoration === "lineThrough");
  assert.ok(strikes.some(node => node.text === "30"));
  assert.deepEqual(input, original);
  assert.equal(data.notes, "Catatan asli pemohon");
  assert.equal(data.unitExaminations[0].name, "Lili");
  assert.equal(data.unitExaminations[0].note, review.note);
  assert.equal(data.unitExaminations[0].date, "15/10/2026, 10:00");
  assert.ok(!data.revisionHistory.some(entry => entry.title === "Pemeriksaan kesiapan unit"));
});

test("Equal counts are not crossed out, unchecked Unit and non-Unit forms remain unchanged", () => {
  const equal = source(); equal.unit_allocation_history = [{ ...review, allocated_count: 30, remaining_count: 0 }];
  for (const input of [equal, { ...source(), unit_allocation_history: [] },
    { ...source(), form_input_data: { ...source().form_input_data, request_mode: "non_asset" } }]) {
    const data = normalizePgdDocumentData(input);
    assert.equal(data.items[0].approvedQuantity, undefined);
    assert.ok(!visit(buildPgdDocumentDefinition(data), node => node.decoration === "lineThrough").length);
  }
});

test("Only the unique explicit requested Unit count in the item name is crossed out", () => {
  const input = source();
  input.form_input_data.items[0].nama_barang = "SPK B30 tipe 30/60: Pembangunan Rumah 30 Unit tahap 2";
  const original = structuredClone(input);
  const data = normalizePgdDocumentData(input);
  const definition = buildPgdDocumentDefinition(data);
  const nameCell = definition.content.find(node => node.table?.headerRows === 1).table.body[1][2];
  assert.deepEqual(nameCell.text, [
    { text: "SPK B30 tipe 30/60: Pembangunan Rumah " },
    { text: "30", decoration: "lineThrough", color: "#475569" },
    { text: " 3", bold: true },
    { text: " Unit tahap 2" },
  ]);
  assert.equal(data.items[0].name, original.form_input_data.items[0].nama_barang);
  assert.deepEqual(input, original);
});

test("Unrelated numbers, ambiguous quantities and item rejection formatting are preserved", () => {
  for (const name of ["SPK B30 tipe 30/60", "SPK 130 Unit", "SPK 30.30 Unit", "SPK 30/30 Unit", "SPK B30 Unit", "30 Unit dan 30 Unit"]) {
    const input = source(); input.form_input_data.items[0].nama_barang = name;
    const definition = buildPgdDocumentDefinition(normalizePgdDocumentData(input));
    const cell = definition.content.find(node => node.table?.headerRows === 1).table.body[1][2];
    assert.equal(cell.text, name);
  }
  const data = normalizePgdDocumentData(source()); data.items[0].revisionAction = "reject";
  const cell = buildPgdDocumentDefinition(data).content.find(node => node.table?.headerRows === 1).table.body[1][2];
  assert.equal(cell.decoration, "lineThrough");
  assert.equal(cell.text, "Permohonan SPK 30 Unit");
});

test("Latest matching examination owns the quantity, older dated notes remain attributable", () => {
  const input = source();
  input.unit_allocation_history.push({ ...review, id: "later", actor_name: "Rotsa", created_at: "2026-10-15T04:00:00Z", allocated_count: 5 });
  const data = normalizePgdDocumentData(input);
  assert.equal(data.items[0].approvedQuantity, "5");
  assert.deepEqual(data.unitExaminations.map(entry => entry.name), ["Lili", "Rotsa"]);
  input.form_input_data.requested_unit_count = 20; input.form_input_data.items[0].jumlah = 20;
  assert.equal(normalizePgdDocumentData(input).items[0].approvedQuantity, undefined);
});

test("The form header references actual final page and leaves no Lihat footer placeholder", () => {
  const definition = buildPgdDocumentDefinition(normalizePgdDocumentData(source()));
  assert.ok(!JSON.stringify(definition).includes("Lihat footer"));
  assert.ok(visit(definition, node => node.pageReference === "pgd-document-end").length);
  assert.ok(visit(definition, node => node.id === "pgd-document-end").length);
});

test("Named examiner notes are a separate breakable block beside the intact signature block", () => {
  const definition = buildPgdDocumentDefinition(normalizePgdDocumentData(source()));
  const area = definition.content.find(node => node.columns);
  assert.match(JSON.stringify(area.columns[0]), /Catatan Tim Pemeriksa/);
  assert.match(JSON.stringify(area.columns[0]), /Lili/);
  assert.match(JSON.stringify(area.columns[0]), /27 unit belum dipenuhi/);
  assert.ok(!area.columns[0].unbreakable);
  assert.equal(area.columns[1].unbreakable, true);
  assert.ok(!JSON.stringify(definition).includes("RIWAYAT PERBAIKAN DAN PEMERIKSAAN"));
});

test("Short notes fit one page, long notes flow without losing text or adding a Unit history appendix", async () => {
  const input = source();
  const short = await renderPgdPdf(normalizePgdDocumentData(input));
  const pageCount = buffer => (buffer.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
  assert.equal(pageCount(short), 1);
  input.unit_allocation_history[0] = { ...review, note: "CATATAN PANJANG PEMERIKSA. ".repeat(80) + "AKHIR CATATAN" };
  const longData = normalizePgdDocumentData(input);
  assert.ok(longData.unitExaminations[0].note.endsWith("AKHIR CATATAN"));
  const long = await renderPgdPdf(longData);
  assert.ok(pageCount(long) > 1);
});
