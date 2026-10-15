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
