import test from "node:test";
import assert from "node:assert/strict";
import { revisionHistoryEntries, revisionAppendixBlock } from "../document-revision-notes.mjs";
import { loadUnitAllocationHistory } from "./pdf-worker-job.mjs";

const review = { id: "review", actor_name: "Lili", created_at: "2026-10-15T03:00:00Z", requested_count: 30,
  allocated_count: 3, remaining_count: 27, note: "Hanya 3 unit siap bangun; sisanya belum siap." };
const surat = { id: "surat", file_path: "native://unit/v2", form_input_data: { request_mode: "unit", requested_unit_count: 30 } };
test("partial readiness has a named dated appendix without rewriting the original request", () => {
  const source = { ...surat, unit_allocation_history: [review] };
  const original = structuredClone(source);
  const entries = revisionHistoryEntries(source);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].actor, "Lili");
  assert.equal(entries[0].reason, review.note);
  assert.match(JSON.stringify(entries), /30 unit diajukan/);
  assert.match(JSON.stringify(entries), /3 unit siap bangun/);
  assert.match(JSON.stringify(entries), /27 unit/);
  assert.equal(revisionAppendixBlock(entries)[0].pageBreak, "before");
  assert.deepEqual(source, original);
});
const client = (rows, error = null) => ({ from(name) {
  assert.equal(name, "surat_unit_allocation_history");
  return { select() { return this; }, eq(key, value) { assert.equal(key, "surat_id"); assert.equal(value, "surat"); return this; },
    order() { return this; }, range() { return Promise.resolve({ data: rows, error }); } };
} });
test("old signer PDF never includes a later Unit examination", async () => {
  const result = await loadUnitAllocationHistory(client([review, { ...review, id: "future", created_at: "2026-10-16T03:00:00Z" }]),
    { surat_id: "surat", source_file_path: surat.file_path }, surat,
    { file_path_snap: surat.file_path, signed_at: "2026-10-15T04:00:00Z" });
  assert.deepEqual(result, [review]);
});
test("wrong source, invalid cutoff and unrelated forms do not load later live history", async () => {
  const forbidden = { from() { throw new Error("Unexpected history read"); } };
  assert.deepEqual(await loadUnitAllocationHistory(forbidden, { source_file_path: "different" }, surat), []);
  assert.deepEqual(await loadUnitAllocationHistory(forbidden, { source_file_path: surat.file_path }, surat,
    { file_path_snap: surat.file_path, signed_at: "invalid" }), []);
  assert.deepEqual(await loadUnitAllocationHistory(forbidden, {}, { form_input_data: { request_category: "non_asset" } }), []);
});
test("history read failures fail closed instead of silently omitting the examiner note", async () => {
  await assert.rejects(loadUnitAllocationHistory(client([], new Error("Unavailable")),
    { surat_id: "surat", source_file_path: surat.file_path }, surat), /Unavailable/);
});
