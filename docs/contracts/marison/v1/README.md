# Kontrak Outbound Marison v1

Folder ini adalah sumber kebenaran payload yang dikirim SIGAP ke sistem Marison.
Tim SIGAP dan vendor harus memakai contoh JSON di folder ini sebagai kontrak yang
sama selama integrasi v1 berlangsung.

## Payload Kanonis

- `unit-submission.example.json` untuk `POST /unit-submissions`.
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

Pada 22 Juli 2026, OpenAPI vendor staging masih mendokumentasikan payload lama
yang memakai field ringkas seperti `project_id`, `branch_id`, dan `asset_name`.
Kontrak v1 pada folder ini adalah kontrak baru yang sedang disesuaikan oleh vendor.
Jangan deploy pengiriman kontrak baru sebelum endpoint vendor menyatakan siap dan
lulus contract test bersama.

## Aturan Perubahan

1. Ubah schema, fixture, builder, dokumentasi, dan contract test dalam satu PR.
2. Minta persetujuan vendor untuk perubahan nama field, tipe, atau nesting.
3. Uji payload ke staging dan simpan response ID sebelum promosi production.
4. Jangan menambahkan fallback payload kedua pada endpoint yang sama.
5. Credential, access token, HMAC, dan storage URL asli tidak boleh masuk fixture.

`office.id`, `project.id`, `branch.id`, `unit_id`, dan NIK adalah identifier
integrasi wajib. SIGAP menghentikan dispatch dengan error terukur jika mapping
identifier tersebut belum tersedia; server tidak membuat ID dummy.
