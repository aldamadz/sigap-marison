import { itemQuantityTotal } from "@sigap/shared";

const object = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const rows = value => Array.isArray(value) ? value.map(object) : [];
const valueText = (value, type) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  if (type === "money" && /^\d+$/.test(raw)) return `Rp ${Number(raw).toLocaleString("id-ID")}`;
  if (type === "unit_count") return `${raw} unit`;
  return raw;
};

export function signerRevisionNotes(source = {}) {
  const snapshot = object(source.data_snapshot);
  const revision = Object.keys(object(snapshot.revision)).length ? object(snapshot.revision) : object(snapshot.applied_revision);
  const changes = object(revision.changes);
  const reason = String(revision.reason || "").trim();
  let items = rows(changes.item_revisions);
  if (!items.length && changes.keu10_finance_proposal === true) {
    const original = object(object(changes.keu10_base).document_snapshot);
    const before = rows(object(original.form_input_data).items);
    const after = rows(object(changes.confirmed_input || changes.keu10_proposed_input).items);
    const used = new Set();
    const describe = item => `Jumlah: ${item.jumlah}; Harga satuan: ${valueText(item.estimasi_harga_satuan,"money")}; Total: ${valueText(itemQuantityTotal(item.jumlah,Number(item.estimasi_harga_satuan)),"money")}; Keterangan: ${item.keterangan || "-"}; Satuan: ${item.satuan || "-"}`;
    items = before.flatMap((item, index) => {
      const match = item.id ? after.findIndex(row => row.id === item.id) : index < after.length ? index : -1;
      const next = match >= 0 ? after[match] : undefined;
      if (next) used.add(match);
      if (next && describe(next) === describe(item)) return [];
      return [{ index, nama_barang: item.keterangan, action: next ? "adjust" : "reject",
        value_type: "text", nilai_diajukan: describe(item), nilai_disetujui: next ? describe(next) : null, alasan: reason }];
    });
    after.forEach((item,index) => {
      if (!used.has(index)) items.push({ index:before.length+index, nama_barang:`Ditambahkan: ${item.keterangan || `Item ${index+1}`}`,
        action:"adjust",value_type:"text",nilai_diajukan:"-",nilai_disetujui:describe(item),alasan:reason });
    });
  }
  if (!reason && !items.length) return [];
  const actor = String(revision.actor_name || "").trim();
  const heading = items.length ? "Revisi" : "Permintaan perbaikan";
  return [actor ? `${heading} oleh ${actor}` : heading, reason,
    ...items.map(item => {
      const type = item.value_type || item.revision_value_type;
      const requested = item.unit_diajukan ?? item.jumlah_diajukan ?? item.nominal_diajukan ?? item.nilai_diajukan;
      const approved = item.unit_disetujui ?? item.jumlah_disetujui ?? item.nominal_disetujui ?? item.nilai_disetujui;
      const result = item.action === "reject" ? "Tidak disetujui" : item.action === "keep" ? "Tidak berubah" : valueText(approved,type);
      return `${item.nama_barang || `Item ${Number(item.index) + 1}`} - Diajukan: ${valueText(requested,type)}; Disetujui: ${result}. Alasan: ${item.alasan || item.reason || reason}`;
    }),
  ].filter(Boolean);
}

export function revisionNotesBlock(notes = []) {
  return notes.length ? [{ margin: [0, 6, 0, 6], stack: notes.map((text, index) => ({ text, fontSize: 8, bold: index === 0, margin: [0, 0, 0, 3] })) }] : [];
}

const labels = {
  nama_barang: "Nama barang / pekerjaan", keterangan: "Keterangan", jumlah: "Jumlah",
  satuan: "Satuan", sat: "Satuan", nominal: "Nominal", estimasi_harga_satuan: "Harga satuan",
  catatan: "Catatan", status: "Status", fund_amount: "Total dana", free_cash: "Free Cash",
  keu1_free_cash: "Free Cash", rab_not_required: "Tidak memerlukan RAB", request_date: "Tanggal",
  request_place: "Tempat", judul_surat: "Judul pengajuan", fund_type: "Jenis dana",
  total: "Total item", subtotal: "Subtotal", amount: "Total dana", harga_satuan: "Harga satuan",
  quantity: "Jumlah", spesifikasi: "Spesifikasi", item_name: "Nama pekerjaan",
  free_cash_sisa_bulan_lalu: "Sisa kas bulan lalu", kebutuhan_dana: "Kebutuhan dana",
};
const ignored = /(^id$|_id$|file_url|storage_|file_path|pdf_path|token|secret|password|revision|generation|^linked_|^request_category$)/i;
const label = key => labels[key] || key.replaceAll("_", " ");
const plain = value => {
  if (value == null || value === "") return "-";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (Array.isArray(value)) return value.map(plain).join("; ") || "-";
  if (typeof value === "object") return Object.entries(value).filter(([key]) => !ignored.test(key))
    .map(([key,entry]) => `${label(key)}: ${plain(entry)}`).join("; ") || "-";
  // A file-view bearer is not revision evidence and must not leak into a report.
  return String(value).replace(/https?:\/\/\S*\/api\/files\/view\/\S+/g, "[Tautan file privat]");
};
const moneyField = /(^|_)(nominal|harga|biaya|amount|price|subtotal|total)(_|$)|^(free_cash|keu1_free_cash|free_cash_sisa_bulan_lalu|kebutuhan_dana)$/;
const displayValue = (value, key, item = {}) => {
  if (value == null || value === "") return "-";
  const raw = String(value).trim();
  if (moneyField.test(key) && /^-?\d+(?:\.\d+)?$/.test(raw) && Number.isFinite(Number(raw)))
    return `Rp ${Number(raw).toLocaleString("id-ID")}`;
  if (["jumlah","quantity"].includes(key) && (item.satuan || item.sat))
    return `${plain(value)} ${plain(item.satuan || item.sat)}`;
  return plain(value);
};
const describeItem = item => Object.entries(item).filter(([key]) => !ignored.test(key))
  .map(([key,value]) => `${label(key)}: ${displayValue(value,key,item)}`).join("\n") || "-";
const equivalent = (a,b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const inputOf = snapshot => object(object(snapshot).document).form_input_data || object(snapshot).form_input_data || {};
const describeFile = file => [file.file_name || file.name || "Lampiran",file.file_type || "",
  Number.isFinite(Number(file.file_size)) ? `${Math.round(Number(file.file_size)/1024)} KB` : "",
  file.requirement_label || file.requirement_key || file.stage || ""].filter(Boolean).join(" | ");
const diffRecord = (before,after,prefix,result,group) => {
  for (const key of new Set([...Object.keys(before),...Object.keys(after)])) {
    if (ignored.test(key) || key === "items" || equivalent(before[key],after[key])) continue;
    result.push({ field: `${prefix}${label(key)}`, label: label(key), group,
      before: displayValue(before[key],key,before), after: displayValue(after[key],key,after),
      action: before[key] == null ? "Ditambahkan" : after[key] == null ? "Dihapus" : "Diubah" });
  }
};

export function revisionHistoryEntries(source = {}) {
  const canonical = rows(source.revision_history);
  const history = (canonical.length ? canonical : rows(object(source.data_snapshot).revision_history))
    .filter(entry => entry.before_snapshot && entry.after_snapshot);
  const current = object(object(source.data_snapshot).revision);
  const applied = Object.keys(current).length ? current : object(object(source.data_snapshot).applied_revision);
  const baseline = object(object(applied.changes).requester_revision_base);
  const eventId = applied.event_id || applied.revision_event_id || applied.id;
  if (object(applied.changes).signer_direct_approval===true
    && !history.some(entry=>entry.revision_event_id===eventId)
    && object(applied.changes).signer_proposal_before && object(applied.changes).signer_proposal_after) {
    history.push({revision_event_id:eventId,reason:applied.reason,submitted_at:applied.submitted_at,
      submitted_by_name:applied.actor_name,revision_mode:"signer_direct",
      before_snapshot:applied.changes.signer_proposal_before,after_snapshot:applied.changes.signer_proposal_after});
  }
  if (!history.some(entry => entry.revision_event_id && entry.revision_event_id === eventId)
      && Object.keys(baseline).length) {
    history.push({ revision_event_id: eventId, reason: applied.reason,
      before_snapshot: baseline, after_snapshot: {document:source,
        ...(Array.isArray(source.revision_attachments) ? {attachments:source.revision_attachments} : {})} });
  }
  const entries = history.map((entry,index) => {
    const before = object(inputOf(entry.before_snapshot));
    const after = object(inputOf(entry.after_snapshot));
    const changes = [];
    diffRecord(before,after,"",changes);
    const beforeItems = rows(before.items), afterItems = rows(after.items);
    const matched = new Set();
    beforeItems.forEach((item,itemIndex) => {
      const nextIndex = item.id ? afterItems.findIndex(next => next.id === item.id)
        : afterItems[itemIndex] && !afterItems[itemIndex].id ? itemIndex : -1;
      const next = nextIndex >= 0 ? afterItems[nextIndex] : null;
      const name=plain(item.nama_barang || item.keterangan || next?.nama_barang || next?.keterangan || "Rincian");
      const group={key:`item-before-${itemIndex}`,title:`Item ${itemIndex+1}: ${name}`,action:next ? "Diubah" : "Dihapus"};
      if (!next) changes.push({field:`Item ${itemIndex+1}`,label:"Rincian item",group,before:describeItem(item),after:"-",action:"Dihapus"});
      else { matched.add(nextIndex);diffRecord(item,next,`Item ${itemIndex+1} (${name}) - `,changes,group); }
    });
    afterItems.forEach((item,itemIndex) => {
      if (!matched.has(itemIndex)) changes.push({field:`Item ${itemIndex+1}`,label:"Rincian item",
        group:{key:`item-after-${itemIndex}`,title:`Item ${itemIndex+1}: ${plain(item.nama_barang || item.keterangan || "Rincian")}`,action:"Ditambahkan"},
        before:"-",after:describeItem(item),action:"Ditambahkan"});
    });
    const oldFiles = rows(object(entry.before_snapshot).attachments);
    const newFiles = rows(object(entry.after_snapshot).attachments);
    const fileKey = file => `${file.file_url || file.storage_path || file.id}|${file.requirement_key || ""}`;
    const completeFiles = Array.isArray(object(entry.before_snapshot).attachments) && Array.isArray(object(entry.after_snapshot).attachments);
    for (const file of completeFiles ? oldFiles : []) if (!newFiles.some(next => fileKey(next) === fileKey(file)))
      changes.push({field:"Lampiran",before:describeFile(file),after:"-",action:"Dihapus"});
    for (const file of completeFiles ? newFiles : []) {
      const previous = oldFiles.find(old => fileKey(old) === fileKey(file));
      if (!previous) changes.push({field:"Lampiran",before:"-",after:describeFile(file),action:"Ditambahkan"});
      else if (describeFile(previous)!==describeFile(file)) changes.push({field:"Lampiran",before:describeFile(previous),after:describeFile(file),action:"Diubah"});
    }
    // Form labels/date/title can change independently of form_input_data.
    const documentBefore = object(object(entry.before_snapshot).document);
    const documentAfter = object(object(entry.after_snapshot).document);
    for (const key of ["judul_surat","request_date","request_place"]) if (key in documentBefore && !equivalent(documentBefore[key],documentAfter[key]))
      changes.push({field:label(key),before:plain(documentBefore[key]),after:plain(documentAfter[key]),action:"Diubah"});
    return { title:`Perbaikan ${index+1}`,reason:plain(entry.reason),note:plain(entry.requester_note),
      at:entry.submitted_at || "",actor:entry.submitted_by_name || "",requestedBy:entry.requested_by_name || "",
      mode:entry.revision_mode,changes };
  });
  if (!entries.length) {
    const notes = signerRevisionNotes(source);
    if (notes.length) entries.push({title:notes[0],reason:notes[1] || "-",note:"-",at:"",actor:"",changes:[],legacyNotes:notes.slice(2)});
  }
  for (const review of rows(source.unit_allocation_history)) {
    entries.push({title:"Pemeriksaan kesiapan unit",actor:plain(review.actor_name),at:review.created_at || "",
      reason:plain(review.note || "Seluruh unit yang diminta siap bangun."),note:"-",changes:[
        {field:"Unit siap bangun / diteruskan",action:"Diperiksa",before:`${review.requested_count} unit diajukan`,after:`${review.allocated_count} unit siap bangun`},
        {field:"Belum dipenuhi",action:"Dicatat",before:"-",after:`${review.remaining_count} unit`},
      ]});
  }
  return entries;
}

export function revisionAppendixBlock(entries = [], noSurat = "") {
  if (!entries.length) return [];
  const cell = text => ({text,fontSize:8,margin:[0,3,0,3]});
  const tables = changes => {
    const groups=new Map();
    for (const change of changes) {
      const group=change.group || {key:"document",title:changes.some(row=>!row.group && row.field==="Lampiran") ? "Data pengajuan dan lampiran" : "Data pengajuan"};
      if (!groups.has(group.key)) groups.set(group.key,{...group,changes:[]});
      groups.get(group.key).changes.push(change);
    }
    return [...groups.values()].map(group=>({table:{headerRows:2,keepWithHeaderRows:1,widths:["30%","35%","35%"],body:[
      [{...cell(`${group.title.length>180 ? `${group.title.slice(0,177)}...` : group.title}${group.action ? ` - ${group.action}` : ""}`),bold:true,fillColor:"#e2f0d9",colSpan:3},{},{}],
      ["Bagian yang diubah","Sebelum perbaikan","Sesudah perbaikan"].map(text=>({...cell(text),bold:true,fillColor:"#f1f5f9"})),
      ...(group.title.length>180 ? [[{...cell(group.title),colSpan:3},{},{}]] : []),
      ...group.changes.map(change=>[
        change.label || change.field,
        change.action==="Ditambahkan" && change.label==="Rincian item" ? "Item belum ada" : change.before,
        change.action==="Dihapus" ? (change.label==="Rincian item" ? "Item dihapus dari pengajuan" : "Dihapus") : change.after,
      ].map(cell)),
    ]},layout:{hLineWidth:()=>0.4,vLineWidth:()=>0.4,hLineColor:()=>"#94a3b8",vLineColor:()=>"#94a3b8"},margin:[0,2,0,10]}));
  };
  const summary = changes => {
    const items=new Map(changes.filter(change=>change.group).map(change=>[change.group.key,change.group.action]));
    return [
      ...[["Ditambahkan","ditambahkan"],["Diubah","diubah"],["Dihapus","dihapus"]].map(([action,word])=>{
        const count=[...items.values()].filter(value=>value===action).length;
        return count ? `${count} item ${word}` : "";
      }),
      changes.some(change=>!change.group && change.field!=="Lampiran") ? "data pengajuan diperbarui" : "",
      changes.some(change=>change.field==="Lampiran") ? "lampiran diperbarui" : "",
    ].filter(Boolean).join("; ");
  };
  return [
    {text:entries.some(entry=>entry.title==="Pemeriksaan kesiapan unit") ? "RIWAYAT PERBAIKAN DAN PEMERIKSAAN" : "RIWAYAT PERBAIKAN PENGAJUAN",pageBreak:"before",bold:true,fontSize:14,margin:[0,0,0,4]},
    {text:noSurat,fontSize:9,margin:[0,0,0,12]},
    ...entries.flatMap(entry => [
      {text:[entry.title,entry.at && Number.isFinite(Date.parse(entry.at)) ? `${new Date(entry.at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})} WIB` : ""].filter(Boolean).join(" | "),bold:true,fontSize:10,margin:[0,5,0,4]},
      ...(entry.mode==="signer_direct" ? [
        {text:`Perubahan dan persetujuan oleh penandatangan: ${entry.actor || entry.requestedBy || "Nama tidak tercatat"}`,fontSize:8,margin:[0,0,0,4]},
        {text:"Pemohon diberi tahu; konfirmasi tidak diperlukan.",fontSize:8,margin:[0,0,0,4]},
      ] : entry.mode==="signer_proposal" ? [
        {text:`Usulan perubahan oleh penandatangan: ${entry.requestedBy || "Nama tidak tercatat"}`,fontSize:8,margin:[0,0,0,4]},
        {text:`Dikonfirmasi oleh pemohon: ${entry.actor || "Nama tidak tercatat"}`,fontSize:8,margin:[0,0,0,4]},
      ] : [
        ...(entry.actor ? [{text:`${entry.title==="Pemeriksaan kesiapan unit" ? "Diperiksa oleh" : entry.mode==="requester_edit" ? "Perubahan oleh pemohon" : "Dikirim oleh"}: ${entry.actor}`,fontSize:8,margin:[0,0,0,4]}] : []),
        ...(entry.requestedBy ? [{text:`Diminta oleh: ${entry.requestedBy}`,fontSize:8,margin:[0,0,0,4]}] : []),
      ]),
      {text:`Alasan: ${entry.reason}`,fontSize:8,margin:[0,0,0,4]},
      ...(entry.note && entry.note!=="-" ? [{text:`Catatan pemohon: ${entry.note}`,fontSize:8,margin:[0,0,0,4]}] : []),
      ...(entry.changes.length ? [{text:`Ringkasan: ${summary(entry.changes)}.`,fontSize:8,margin:[0,2,0,5]},...tables(entry.changes)]
        : (entry.legacyNotes || ["Rincian sebelum/sesudah tidak tersedia pada riwayat lama."]).map(text=>({text,fontSize:8,margin:[0,0,0,4]}))),
    ]),
  ];
}
