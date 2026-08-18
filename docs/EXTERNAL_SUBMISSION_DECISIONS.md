# Keputusan Pengajuan dari Sistem Departemen

## Endpoint

`POST /api/v1/submission-decisions`

Autentikasi machine-to-machine memakai `Authorization: Bearer <token>` yang cocok
dengan `SUBMISSION_DECISIONS_API_TOKEN`. Token minimal 32 karakter dan tidak boleh
ditaruh di query string, payload, log, atau repository.

```json
{
  "event_id": "b03a2bcd-83ea-4ff8-8bb9-02829192ed85",
  "document_number": "041/UAI/MKT.1/VIII/2026",
  "decision": "revision_required",
  "reason": "Jumlah barang perlu disesuaikan.",
  "decided_at": "2026-08-18T14:00:00+07:00"
}
```

Hanya lima field tersebut yang diterima. `note`, `revision_scope`,
`affected_items`, dan `external_reference` ditolak. `event_id` merupakan kunci
idempotensi: replay payload identik mengembalikan sukses idempotent, sedangkan
payload berbeda dengan `event_id` yang sama menghasilkan HTTP 409.

## Prasyarat

- Nomor dokumen harus unik di SIGAP.
- Dokumen harus final.
- Harus ada dispatch environment aktif berstatus `succeeded`, sudah melewati
  batas POST, dan mempunyai response atau external reference.
- Dokumen rekomendasi anak tidak dapat diputuskan langsung; gunakan nomor induk.

## Keputusan

`rejected` membuat dokumen terminal dengan label **Ditolak sistem departemen**.
Alasan disimpan pada snapshot keputusan, ditampilkan di Status Pengajuan, dan
dikirim ke pemohon serta pihak yang pernah menandatangani. Approval, PDF, dan
payload dispatch lama tidak diubah.

`revision_required` membuat generation revisi baru, menyimpan snapshot dokumen,
tanda tangan, dan lampiran lama secara immutable, lalu membuka task pemohon di
**Tindak Lanjut**. Nomor dokumen dipertahankan.

## Routing Revisi

- Unit: pemohon hanya mengubah jumlah dan catatan opsional. Proyek, kantor,
  identitas, nomor, serta alokasi dikunci. Bila jumlah berbeda, task kembali ke
  pemeriksa sampai jumlah alokasi tepat.
- Aset dengan rekomendasi: task dan nomor rekomendasi lama dibuka kembali. Draft
  memakai data rekomendasi terakhir; rekomendasi wajib disubmit dan disetujui
  ulang sebelum approval induk dimulai.
- Aset tanpa rekomendasi, Non Unit, dan Non Aset: pemohon memperbaiki form lama,
  lalu approval dimulai ulang.
- Tanda tangan generasi lama tetap di history. Tanda tangan aktif direset; pemohon
  yang juga signer pertama biasa dapat disetujui otomatis.

Setelah revisi final, trigger membuat dispatch generasi berikutnya dengan payload
dan PDF current. Dispatch lama tetap immutable.
