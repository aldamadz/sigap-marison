import assert from "node:assert/strict";
import { test } from "node:test";
import { enrichRevisionActors } from "./revision-actor-evidence.mjs";
import { revisionHistoryEntries, signerRevisionNotes, revisionAppendixBlock } from "../document-revision-notes.mjs";
import { readFileSync } from "node:fs";

const eventId = "00000000-0000-4000-8000-000000000001";
const actorId = "00000000-0000-4000-8000-000000000002";
const ownerId = "00000000-0000-4000-8000-000000000003";
const client = (events, profiles, error = null) => ({ from(table) {
  const result = Promise.resolve({ data: table === "surat_revision_events" ? events : profiles, error });
  const chain = { select: () => chain, eq: () => chain, in: () => chain, then: (resolve,reject) => result.then(resolve,reject) };
  return chain;
} });
const source = () => ({ id: "document", data_snapshot: { applied_revision: { event_id: eventId, reason: "Spesifikasi diperbaiki",
  changes: { item_revisions: [{ index: 0, nama_barang: "Komputer", action: "adjust", jumlah_diajukan: 5, jumlah_disetujui: 3 }] } } } });

test("uses the actual revision actor and never infers a manager from step order", async () => {
  const original = source(), before = structuredClone(original);
  const result = await enrichRevisionActors(client([{ id:eventId, surat_id:"document", actor_id:actorId }], [{id:actorId,full_name:"Pemeriksa Contoh"}]), original);
  assert.match(signerRevisionNotes(result)[0], /Revisi oleh Pemeriksa Contoh/);
  assert.deepEqual(original, before);
  const foreign = await enrichRevisionActors(client([{id:eventId,surat_id:"other",actor_id:actorId}],[{id:actorId,full_name:"Tidak boleh tampil"}]), original);
  assert.doesNotMatch(JSON.stringify(foreign), /Tidak boleh tampil/);
});
test("prefers recorded participant names and attributes requester edits separately", async () => {
  const history={revision_event_id:eventId,requested_by:actorId,submitted_by:ownerId,reason:"Lengkapi data",
    before_snapshot:{signatures:[{user_id:actorId,signer_snapshot:{full_name:"Nama Saat Revisi"}}],document:{form_input_data:{items:[{id:"a",nama_barang:"Komputer",jumlah:5,status:1}]},created_by:ownerId,requester_snapshot:{full_name:"Pemohon Contoh"}}},
    after_snapshot:{document:{form_input_data:{items:[{id:"a",nama_barang:"Komputer Baru",jumlah:3,status:2}]},created_by:ownerId,requester_snapshot:{full_name:"Pemohon Contoh"}},attachments:[{file_url:"new",file_name:"RAB.pdf",requirement_key:"rab"}]}};
  history.before_snapshot.attachments=[];
  const enriched=await enrichRevisionActors(client([{id:eventId,surat_id:"document",actor_id:actorId}],[{id:actorId,full_name:"Nama Direktori Terbaru"}]),source(),[history]);
  const entries=revisionHistoryEntries(enriched);
  assert.equal(entries[0].requestedBy,"Nama Saat Revisi");
  assert.equal(entries[0].actor,"Pemohon Contoh");
  for(const field of ["Nama barang / pekerjaan","Jumlah","Status","Lampiran"]) assert.ok(entries[0].changes.some(row=>row.field.includes(field)));
  const report=JSON.stringify(revisionAppendixBlock(entries,"001/UJI"));
  assert.match(report,/Diminta oleh: Nama Saat Revisi/);
  assert.match(report,/RAB.pdf/);
});
test("unrevised immutable snapshot is returned unchanged without new lookups",async()=>{
  const original={id:"document",form_input_data:{items:[]}};
  assert.equal(await enrichRevisionActors({from(){throw Error("Unexpected query");}},original),original);
});
test("lookup errors cannot manufacture an attribution",async()=>{
  await assert.rejects(enrichRevisionActors(client([],[],new Error("Metadata unavailable")),source()),/Metadata unavailable/);
});
test("the worker's attribution helper is packaged in the runtime image",()=>{
  assert.match(readFileSync(new URL("../dockerfile",import.meta.url),"utf8"),/COPY server\/revision-actor-evidence\.mjs \.\/server\/revision-actor-evidence\.mjs/);
});
test("shared image and revision helpers require coordinated worker rollout",()=>{
  const deploy=readFileSync(new URL("../scripts/deploy-app.sh",import.meta.url),"utf8");
  assert.match(deploy,/worker_changes=[\s\S]*dockerfile document-revision-notes\.mjs server\/revision-actor-evidence\.mjs/);
});
