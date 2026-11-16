import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { normalizeKeu1DocumentData, renderKeu1Pdf } from "../keu1-pdf-renderer.mjs";

// Synthetic data only: regenerate this example without accessing business data.
const output=process.argv[2];
if (!output) throw new Error("Usage: node scripts/preview-readable-revision-history.mjs <output.pdf>");
const initial=[
  {id:"one",keterangan:"Transport petugas",jumlah:1,satuan:"hari",estimasi_harga_satuan:2000,total:2000},
  {id:"two",keterangan:"Konsumsi petugas",jumlah:2,satuan:"hari",estimasi_harga_satuan:3000,total:6000},
  {id:"three",keterangan:"Biaya parkir",jumlah:2,satuan:"hari",estimasi_harga_satuan:4500,total:9000},
];
const revised=[{...initial[1],jumlah:1,total:3000},{...initial[2],jumlah:3,total:13500}];
const snapshot=(items,fund_amount)=>({document:{form_input_data:{items,fund_amount}},attachments:[]});
const first=snapshot(initial,17000), second=snapshot(revised,16500);
const third=snapshot([{...revised[0],keterangan:"Konsumsi petugas lapangan"},revised[1]],16500);
const source={no_surat:"CONTOH/RIWAYAT-PERBAIKAN/2026",request_date:"2026-11-16",request_place:"Magelang",
  resolved_master_form:{nomor_form:"FM-UAI.KEU-01-00",nama_form:"Form Pengajuan Kas Kecil"},
  location_snapshot:{office:{name:"Kantor Cabang Magelang",kedudukan:"KC"}},form_input_data:third.document.form_input_data,
  revision_history:[
    {revision_mode:"requester_edit",submitted_by_name:"Pemohon Contoh",requested_by_name:"Pemeriksa Contoh",
      submitted_at:"2026-11-16T03:00:00Z",reason:"Sesuaikan biaya dengan kebutuhan aktual.",requester_note:"Jumlah hari dan rincian biaya sudah disesuaikan.",before_snapshot:first,after_snapshot:second},
    {revision_mode:"signer_proposal",submitted_by_name:"Pemohon Contoh",requested_by_name:"Penandatangan Contoh",
      submitted_at:"2026-11-16T04:00:00Z",reason:"Perjelas tujuan biaya konsumsi.",requester_note:"Usulan perubahan telah diperiksa dan dikonfirmasi.",before_snapshot:second,after_snapshot:third},
  ]};
const target=resolve(output);
await mkdir(dirname(target),{recursive:true});
await writeFile(target,await renderKeu1Pdf(normalizeKeu1DocumentData(source)));
console.log(target);
