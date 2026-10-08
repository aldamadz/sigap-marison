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
    const describe = item => `Jumlah: ${item.jumlah}; Harga satuan: ${valueText(item.estimasi_harga_satuan,"money")}; Total: ${valueText(Number(item.jumlah)*Number(item.estimasi_harga_satuan),"money")}; Keterangan: ${item.keterangan || "-"}; Satuan: ${item.satuan || "-"}`;
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
  return [items.length ? "Revisi oleh Penandatangan" : "Permintaan perbaikan", reason,
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
