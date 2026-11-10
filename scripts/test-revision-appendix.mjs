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
