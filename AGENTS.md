# SIGAP Development and Release Policy

Dokumen ini adalah instruksi wajib untuk seluruh AI coding agent yang bekerja di
repository SIGAP. Baca dokumen ini sebelum membuat branch, mengubah kode,
menjalankan migration, melakukan commit, membuka PR, atau melakukan deployment.
Setelah itu baca `docs/FEATURE_RELEASE_MAP.md` untuk mengetahui status fitur,
dependensi, drift environment, dan prosedur penarikan fitur dari production.

## Aturan Utama

1. `main` merepresentasikan kode production.
2. `staging` merepresentasikan gabungan fitur yang sedang diuji di staging.
3. Fitur dan perbaikan baru dikerjakan dalam branch tersendiri, bukan langsung di
   `main` atau `staging`.
4. Jika pengguna tidak menyebut environment, anggap targetnya adalah **staging**.
5. Jangan mengubah database, secrets, deployment, atau aplikasi production tanpa
   permintaan production yang eksplisit dari pengguna.
6. Jangan merge seluruh branch `staging` ke `main` untuk merilis satu fitur.

## Pemetaan Environment

| Environment | Git branch | Domain | Supabase |
| --- | --- | --- | --- |
| Staging | `staging` | `sigap.marison-testing.biz.id` | Gunakan konfigurasi `.env.staging` |
| Production | `main` | `sigap.marisoncloud.com` | Gunakan konfigurasi `.env.production` |

File `.env*`, token, password, API key, dan secret tidak boleh di-commit atau
ditampilkan dalam log, komentar PR, maupun jawaban kepada pengguna.

## Keputusan Default Agent

Gunakan tabel ini tanpa perlu meminta pengguna mengulang environment:

| Permintaan pengguna | Tindakan default |
| --- | --- |
| Membuat fitur baru | Branch `feature/<nama-singkat>`; PR ke `staging`; deploy staging |
| Memperbaiki bug | Branch `fix/<nama-singkat>`; PR ke `staging`; deploy staging |
| Commit atau push tanpa menyebut production | Push branch fitur/perbaikan; target PR `staging` |
| Deploy tanpa menyebut environment | Deploy ke staging |
| Menjalankan migration tanpa menyebut environment | Terapkan hanya ke Supabase staging |
| Merilis fitur tertentu | PR branch fitur/perbaikan tersebut ke `main` |
| Deploy production | Hanya jika pengguna secara eksplisit menyebut production atau rilis production |
| Hotfix production | Branch `hotfix/<nama-singkat>` dari `main`, PR ke `main`, lalu sinkronkan ke `staging` |

Kalimat seperti "kerjakan", "perbaiki", "buatkan", "commit", "push", atau
"deploy" tanpa kata `production` bukan izin untuk menyentuh production.

## Alur Fitur dan Perbaikan

1. Pastikan worktree dan branch aktif sebelum mulai. Jangan menghapus perubahan
   pengguna yang sudah ada.
2. Temukan Feature ID pekerjaan pada `docs/FEATURE_RELEASE_MAP.md`. Tambahkan ID
   baru pada peta tersebut jika fitur belum terdaftar.
3. Untuk pekerjaan independen, buat branch `feature/*` atau `fix/*` dari `main`.
4. Satu branch dan satu PR hanya untuk satu fitur atau satu kelompok perubahan
   yang tidak dapat dipisahkan.
5. Push branch pekerjaan ke GitHub dan buka PR menuju `staging` untuk pengujian.
6. Jangan hapus branch setelah masuk staging. Commit perbaikan hasil pengujian ke
   branch yang sama, lalu sinkronkan lagi ke staging.
7. Ketika pengguna menyatakan fitur itu siap dirilis, buka PR dari branch fitur
   yang sama menuju `main`. Dengan cara ini fitur lain di staging tidak ikut rilis.
8. Setelah rilis production berhasil, sinkronkan `main` kembali ke `staging` agar
   kedua branch tidak menyimpang.

Jika suatu fitur bergantung pada fitur lain yang belum ada di production, agent
wajib menjelaskan dependensinya sebelum membuka PR ke `main`. Jangan diam-diam
membawa seluruh isi staging ke production.

## Database Migration

1. Setiap perubahan schema harus menggunakan file migration baru dengan timestamp
   unik. Jangan mengedit migration yang sudah pernah diterapkan.
2. Migration harus aman dijalankan ulang bila memungkinkan dan kompatibel dengan
   versi aplikasi yang sedang berjalan selama proses promosi.
3. Saat pengembangan, migration hanya diterapkan ke Supabase staging.
4. Terapkan migration ke Supabase production hanya sebagai bagian dari rilis
   production yang diminta secara eksplisit.
5. Uji perubahan database dan alur aplikasi end-to-end di staging sebelum promosi.
6. Jika riwayat migration lokal dan remote berbeda, hentikan deployment migration,
   audit perbedaannya, dan jangan menggunakan `--include-all` atau repair secara
   buta.

## Commit, PR, dan Deployment

1. Gunakan commit yang terfokus dan pesan commit yang menjelaskan hasil perubahan.
2. Jalankan test, typecheck, lint, dan build yang relevan sebelum push. Laporkan
   kegagalan yang sudah ada secara terpisah dari regresi akibat perubahan baru.
3. Jangan push langsung ke `main` atau `staging` untuk pekerjaan fitur rutin.
   Gunakan PR agar perubahan dan status rilis dapat dilacak di GitHub.
4. PR ke `staging` berarti kandidat pengujian, bukan persetujuan production.
5. PR ke `main` berarti kandidat rilis production dan harus hanya memuat fitur yang
   secara eksplisit dipilih pengguna.
6. Deployment branch `staging` hanya menuju staging. Deployment branch `main`
   hanya menuju production.
7. Setelah deployment, lakukan smoke test terhadap domain dan environment yang
   benar. Jangan menyimpulkan deployment berhasil hanya dari status container.

## Kondisi Repository Saat Ini

Branch remote `staging` sudah tersedia dan menjadi target integrasi PR untuk
pengujian. Workflow CI/deployment berbasis branch belum tersedia. Sampai workflow
tersebut dibuat dan diverifikasi, deployment tetap dilakukan secara manual dengan
pemetaan environment di atas. Keberadaan commit pada `staging` tidak membuktikan
bahwa runtime staging sudah menggunakan commit tersebut; selalu verifikasi image,
container, domain, dan smoke test setelah deployment.
