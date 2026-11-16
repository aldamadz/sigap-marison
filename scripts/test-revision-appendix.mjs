import assert from 'node:assert/strict';
import test from 'node:test';
import {revisionHistoryEntries,revisionAppendixBlock} from '../document-revision-notes.mjs';
import {normalizePgdDocumentData,buildPgdDocumentDefinition,renderPgdPdf} from '../pgd-pdf-renderer.mjs';

const before={document:{form_input_data:{catatan:'Redaksi lama',items:[{id:'a',nama_barang:'Komputer',jumlah:5},{id:'b',nama_barang:'Printer',jumlah:1}]}},
 attachments:[{id:'file-old',file_name:'RAB lama.pdf',file_url:'private://old',stage:'initial'}]};
const after={document:{form_input_data:{catatan:'Redaksi baru',items:[{id:'a',nama_barang:'Komputer',jumlah:3},{id:'c',nama_barang:'AC',jumlah:1}]}},
 attachments:[{id:'file-new',file_name:'RAB baru.pdf',file_url:'private://new',stage:'initial'}]};
const source={no_surat:'UJI-STAGING-REVISION',form_input_data:after.document.form_input_data,
 revision_history:[{revision_event_id:'event',reason:'Sesuaikan jumlah dan RAB',before_snapshot:before,after_snapshot:after}]};
test('appendix lists before/after, item additions/removals and attachment replacements',()=>{
 const entries=revisionHistoryEntries(source),text=JSON.stringify(entries);
 for(const expected of ['Redaksi lama','Redaksi baru','Komputer','Printer','AC','RAB lama.pdf','RAB baru.pdf','Ditambahkan','Dihapus'])assert.ok(text.includes(expected),expected);
 assert.ok(!text.includes('private://'));
 const quantity=entries[0].changes.find(row=>row.field==='Item 1 (Komputer) - Jumlah');
 assert.equal(quantity.before,'5');assert.equal(quantity.after,'3');
});
test('revision quantity/reason/attachment changes never resize the main form',async()=>{
 const data=normalizePgdDocumentData(source);
 const def=buildPgdDocumentDefinition(data),plain=buildPgdDocumentDefinition(normalizePgdDocumentData({...source,revision_history:[]}));
 const index=def.content.findIndex(node=>node.pageBreak==='before');
 assert.ok(index>def.content.findIndex(node=>node.columns));
 assert.equal(JSON.stringify(def.content.slice(0,index)),JSON.stringify(plain.content.filter(node=>node.id!=='pgd-document-end')));
 assert.equal(def.content[index].text,'RIWAYAT PERBAIKAN PENGAJUAN');
 assert.equal((await renderPgdPdf(data)).subarray(0,5).toString(),'%PDF-');
});
test('missing old attachment history is not invented as mass removals',()=>{
 const legacy={...source,revision_history:[],data_snapshot:{applied_revision:{reason:'Perbaiki data',changes:{requester_revision_base:before}}}};
 assert.ok(!revisionHistoryEntries(legacy)[0].changes.some(row=>row.field==='Lampiran'));
 assert.deepEqual(revisionAppendixBlock([]),[]);
});

test('full signer proposal keeps signer, confirmer and all edited fields in PDF evidence',async()=>{
 const old=structuredClone(before),next=structuredClone(after);
 old.document.judul_surat='Perangkat awal';next.document.judul_surat='Perangkat direvisi';
 Object.assign(old.document.form_input_data.items[0],{spesifikasi:'RAM 8GB',sat:'Unit',status:'2'});
 Object.assign(next.document.form_input_data.items[0],{nama_barang:'Komputer desain',jumlah:2.5,spesifikasi:'RAM 32GB',sat:'Paket',status:'3'});
 const doc={...source,form_input_data:next.document.form_input_data,
   revision_history:[{revision_event_id:'full-event',reason:'Sesuaikan kebutuhan aktual',requested_by_name:'Penandatangan Contoh',
     submitted_by_name:'Pemohon Contoh',before_snapshot:old,after_snapshot:next}]};
 const entries=revisionHistoryEntries(doc),serialized=JSON.stringify(entries);
 for(const expected of ['RAM 8GB','RAM 32GB','Komputer desain','2.5','Paket','Dihapus','Ditambahkan','Perangkat direvisi'])
   assert.ok(serialized.includes(expected),expected);
 assert.equal(entries[0].requestedBy,'Penandatangan Contoh');
 assert.equal(entries[0].actor,'Pemohon Contoh');
 const data=normalizePgdDocumentData(doc);
 const rendered=JSON.stringify(buildPgdDocumentDefinition(data));
 assert.ok(rendered.includes('Penandatangan Contoh')&&rendered.includes('Pemohon Contoh'));
 assert.equal((await renderPgdPdf(data)).subarray(0,5).toString(),'%PDF-');
});

test('cash revision uses readable rupiah, grouped item names and explicit deletion details',()=>{
 const items=[
  {id:'one',keterangan:'Transport petugas',jumlah:1,satuan:'hari',estimasi_harga_satuan:2000,total:2000},
  {id:'two',keterangan:'Konsumsi petugas',jumlah:2,satuan:'hari',estimasi_harga_satuan:3000,total:6000},
  {id:'three',keterangan:'Biaya parkir',jumlah:2,satuan:'hari',estimasi_harga_satuan:4500,total:9000},
 ];
 const history={submitted_by_name:'Pemohon Contoh',requested_by_name:'Pemeriksa Contoh',revision_mode:'requester_edit',
  submitted_at:'2026-11-16T03:00:00Z',reason:'Sesuaikan kebutuhan',requester_note:'Sudah diperbaiki',
  before_snapshot:{document:{form_input_data:{fund_amount:17000,items}}},
  after_snapshot:{document:{form_input_data:{fund_amount:16500,items:[{...items[1],jumlah:1,total:3000},{...items[2],jumlah:3,total:13500}]}}}};
 const original=structuredClone(history);
 const entries=revisionHistoryEntries({revision_history:[history]});
 const report=JSON.stringify(revisionAppendixBlock(entries,'001/UJI'));
 for(const expected of ['Rp 17.000','Rp 16.500','Rp 2.000','Rp 3.000','Rp 13.500',
  '1 hari','2 hari','3 hari','Transport petugas','Konsumsi petugas','Biaya parkir',
  'Total item','Perubahan oleh pemohon: Pemohon Contoh','Diminta oleh: Pemeriksa Contoh',
  '1 item dihapus','2 item diubah','Item dihapus dari pengajuan','WIB']) assert.ok(report.includes(expected),expected);
 assert.ok(!report.includes(' - total'));
 assert.deepEqual(history,original);
});

test('signer proposals distinguish the author from the requester who confirms',()=>{
 const history={revision_mode:'signer_proposal',requested_by_name:'Penandatangan Contoh',submitted_by_name:'Pemohon Contoh',
  before_snapshot:before,after_snapshot:after};
 const report=JSON.stringify(revisionAppendixBlock(revisionHistoryEntries({revision_history:[history]})));
 assert.ok(report.includes('Usulan perubahan oleh penandatangan: Penandatangan Contoh'));
 assert.ok(report.includes('Dikonfirmasi oleh pemohon: Pemohon Contoh'));
 assert.ok(!report.includes('Perubahan oleh pemohon: Pemohon Contoh'));
});

test('missing provenance never attributes a signer proposal to the requester',()=>{
 const history={submitted_by_name:'Pemohon Contoh',requested_by_name:'Penandatangan Contoh',before_snapshot:before,after_snapshot:after};
 const report=JSON.stringify(revisionAppendixBlock(revisionHistoryEntries({revision_history:[history]})));
 assert.ok(report.includes('Dikirim oleh: Pemohon Contoh'));
 assert.ok(!report.includes('Perubahan oleh pemohon:'));
 assert.ok(!report.includes('Usulan perubahan oleh penandatangan:'));
});

test('removing one item field is not reported as deleting the entire item',()=>{
 const old={id:'a',nama_barang:'Komputer',jumlah:1,spesifikasi:'RAM 8GB'};
 const entries=revisionHistoryEntries({revision_history:[{before_snapshot:{document:{form_input_data:{items:[old]}}},
  after_snapshot:{document:{form_input_data:{items:[{id:'a',nama_barang:'Komputer',jumlah:1}]}}}}]});
 const report=JSON.stringify(revisionAppendixBlock(entries));
 assert.ok(report.includes('Spesifikasi'));
 assert.ok(report.includes('1 item diubah'));
 assert.ok(!report.includes('Item dihapus dari pengajuan'));
});

test('long named items keep complete evidence outside repeated table headers',async()=>{
 const name='Rincian komputer dengan spesifikasi panjang '.repeat(30)+'AKHIR NAMA ITEM';
 const input=items=>({document:{form_input_data:{items}}});
 const histories=Array.from({length:4},(_,index)=>({before_snapshot:input([{id:'a',nama_barang:name,jumlah:index+1}]),
  after_snapshot:input([{id:'a',nama_barang:name,jumlah:index+2}])}));
 const definition=revisionAppendixBlock(revisionHistoryEntries({revision_history:histories}));
 const tables=definition.filter(node=>node.table);
 assert.equal(tables.length,4);
 for(const node of tables) {
  assert.ok(node.table.body[0][0].text.length<220);
  assert.ok(node.table.body[2][0].text.endsWith('AKHIR NAMA ITEM'));
 }
 assert.equal((await renderPgdPdf(normalizePgdDocumentData({...source,revision_history:histories}))).subarray(0,5).toString(),'%PDF-');
});
