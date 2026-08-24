# API Penolakan Pengajuan

Endpoint ini menolak dokumen berdasarkan nomor pengajuan/nomor dokumen. Pemanggil
wajib login sebagai penandatangan aktif pada tahap dokumen yang sedang berjalan.

## Request

`POST /api/surat/rejections`

Gunakan session cookie SIGAP atau header `Authorization: Bearer <access-token>`.

```json
{
  "document_number": "001/UAI/PBO.1/VIII/2026",
  "reason": "Anggaran belum tersedia",
  "note": "Ajukan ulang pada periode berikutnya"
}
```

- `document_number`: wajib, maksimal 255 karakter. Alias: `request_number` atau `no_surat`.
- `reason`: wajib, maksimal 1000 karakter. Alias: `alasan`.
- `note`: opsional, maksimal 2000 karakter. Alias: `catatan`.
- Bila dua alias dikirim bersamaan, nilainya harus sama.

## Response Berhasil

```json
{
  "success": true,
  "idempotent": false,
  "document_number": "001/UAI/PBO.1/VIII/2026",
  "status": "REJECTED",
  "rejected_at": "2026-08-18T08:30:00.000Z"
}
```

Pengulangan payload yang sama mengembalikan `idempotent: true` tanpa notifikasi
atau mutasi tambahan. Keputusan berbeda terhadap dokumen yang sudah ditolak
mengembalikan HTTP 409.

## Status Error

- `400`: body, nomor, alasan, atau catatan tidak valid.
- `401`: sesi/token tidak valid.
- `403`: akun tidak aktif atau tidak berwenang.
- `404`: dokumen tidak ditemukan atau bukan tugas aktif pemanggil.
- `409`: status dokumen berubah, nomor ambigu, atau keputusan sudah berbeda.
- `503`: database sementara tidak tersedia; detail internal tidak diekspos.
