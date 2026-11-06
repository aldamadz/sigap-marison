# Keputusan Pengajuan dari Sistem Departemen

## Autentikasi

1. Minta access token melalui `POST /api/access-token` menggunakan `client_id`
   dan `client_secret`.
2. Access token berlaku singkat, default 15 menit, dan tidak disimpan permanen.
3. Request keputusan wajib membawa `Authorization: Bearer <access_token>`,
   `X-Timestamp`, dan `X-Signature`.
4. Client wajib memiliki scope `submission:decide`.

Canonical signature:

`METHOD:PATH_WITH_QUERY:ACCESS_TOKEN:BODY_SHA256:TIMESTAMP`

`BODY_SHA256` dihitung dari byte raw request body yang benar-benar dikirim.
`X-Signature` adalah HMAC SHA-512 lowercase hexadecimal menggunakan access token
sebagai key. Timestamp harus RFC3339 dan berada dalam toleransi lima menit.

`SUBMISSION_DECISIONS_API_TOKEN` tetap digunakan hanya di jaringan internal antara
facade External API dan backend SIGAP. Token tersebut tidak diberikan kepada
consumer/vendor.

## Endpoint Keputusan

`POST /api/v1/submission-decisions`

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

Client credentials membuktikan identitas sistem pemanggil. `event_id` tetap wajib
karena menangani retry dan duplikasi keputusan pada tingkat bisnis.

## Prasyarat

- Nomor dokumen harus unik di SIGAP.
- Dokumen harus final.
- Harus ada dispatch environment aktif berstatus `succeeded`, sudah melewati
  batas POST, dan mempunyai response atau external reference.
- Pengecualian pemulihan Dana PGD: callback resmi yang lolos autentikasi dapat
  mengonfirmasi penerimaan ketika generasi terakhir berstatus `failed_terminal`
  atau `outcome_unknown`, sudah POST, dan payload beku masih cocok dengan nomor
  serta versi final dokumen. Dokumen yang berubah setelah payload dibuat,
  tanda tangan belum lengkap/lebih baru, keputusan sebelum POST/di masa depan,
  pengiriman aktif, belum POST, salah environment, serta form KEU tetap ditolak.
  Unit tetap memerlukan bukti penerimaan/ID vendor sesuai kontrak revisinya.
- Dokumen rekomendasi anak tidak dapat diputuskan langsung; gunakan nomor induk.

Pemulihan tersebut menyimpan bukti append-only di
`external_submission_decision_receipts`, mengikat event keputusan dengan dispatch,
environment, nomor, generasi, status lama, hash payload, dan waktu pencatatan.
Callback, keputusan, bukti, notifikasi dan pembukaan revisi adalah satu transaksi;
gagal di tahap berikutnya tidak meninggalkan bukti palsu. Replay identik tidak
menggandakan audit. Tabel hanya dapat dibaca service, bukan pemohon.
Status, response, ID vendor, serta payload/hash dispatch gagal lama tidak diubah.
Tidak ada ID vendor rekaan, pengiriman ulang, atau pembuatan keputusan otomatis
saat migration diterapkan. External perlu mengulangi callback resminya setelah
rilis; penolakan final dan permintaan revisi tetap mempunyai perilaku berbeda.

Setelah revisi diperbaiki dan seluruh persetujuan selesai, migration
`20261106093000` mengizinkan generasi baru dari bukti callback tersebut. Bukti
harus terikat ke event revisi yang sudah resolved, history dan generation aktif.
Pengulangan completion tidak membuat generasi tambahan. Bukti callback tidak
mengizinkan reopen/retry dispatch lama atau replacement tanpa revisi yang sah;
guard database tetap berlaku walaupun aksi dipanggil langsung melalui RPC.

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
