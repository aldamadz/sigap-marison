# Kontrak Outbound Marison OpenAPI 1.0.0

Folder ini adalah sumber kebenaran payload yang dikirim SIGAP ke sistem Marison.
Tim SIGAP dan vendor harus memakai contoh JSON di folder ini sebagai kontrak yang
sama selama integrasi v1 berlangsung.

## Payload Kanonis

- `unit-submission.example.json` untuk `POST /unit-submissions`.
- `non-unit-submission.example.json` untuk `POST /non-unit-submissions`.
- `asset-purchase-request.example.json` untuk `POST /asset-purchase-requests`.

Nama field, struktur object/array, dan tipe data tidak boleh diubah diam-diam.
Perubahan yang tidak kompatibel harus dibuat sebagai kontrak versi baru, misalnya
`v2`, lalu dijadwalkan bersama vendor. Field lama tidak dihapus dari v1 hanya
karena SIGAP mengubah model internalnya.

## Quality Gate

`src/test/marison-outbound-contract.test.mjs` memvalidasi kedua contoh dengan
schema strict. Test akan gagal jika field diganti, field asing ditambahkan,
struktur item berubah, atau nilai total tidak sama dengan jumlah item.

Validator yang sama dijalankan sebelum request keluar dari server. Payload tidak
akan dikirim jika data wajib belum lengkap atau bentuknya menyimpang dari kontrak.

## Status Integrasi

Pada 25 Juli 2026, dokumentasi OpenAPI staging dan production sama-sama memakai
versi `1.0.0`. Fixture di folder ini mengikuti schema yang dipublikasikan oleh
masing-masing endpoint `/docs`, termasuk nama field lampiran `name` dan bentuk
ringkas identifier `project_id` serta `branch_id`.

## Aturan Perubahan

1. Ubah schema, fixture, builder, dokumentasi, dan contract test dalam satu PR.
2. Minta persetujuan vendor untuk perubahan nama field, tipe, atau nesting.
3. Uji payload ke staging dan simpan response ID sebelum promosi production.
4. Jangan menambahkan fallback payload kedua pada endpoint yang sama.
5. Credential, access token, HMAC, dan storage URL asli tidak boleh masuk fixture.

`project_id`, `branch_id`, `unit_id`, `non_unit_id`, dan NIK adalah identifier
integrasi. SIGAP menghentikan dispatch dengan error terukur jika identifier wajib
belum tersedia; server tidak membuat ID dummy.
