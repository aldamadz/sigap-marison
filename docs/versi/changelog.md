# Changelog

Riwayat perubahan rilis SIGAP frontend. Versi ditulis berurutan dari yang
paling baru. Setiap entri mencantumkan lingkup perubahan, PR terkait, dan
tanggal rilis efektif di production.

Konvensi penomoran mengikuti Kalender Semu: `YYYY.MM.DD` dengan akhiran
`.patchN` bila ada rilis korektif pada hari yang sama. Branch rilis di Git
mengikuti pola `release/YYYY-MM-DD`.

## 1. Sumber Kebenaran

- Branch `main` merepresentasikan kode production.
- Branch `staging` merepresentasikan kandidat yang sedang diuji.
- Tanggal rilis dicatat saat branch `main` di-merge, bukan saat deployment
  container.

## 2. Rilis Mendatang

### 2.1 Alur registrasi bertahap + editor Non Aset bergaya kartu

- **Status**: PR #233 (staging), menanti deploy & smoke test
- **Tanggal target**: menyusul hasil verifikasi staging
- **Cabang**: `feature/surat-registrasi-wizard`

Perubahan:

- Alur registrasi bertahap 1 → 2 → 3 dengan stepper pada halaman
  `/surat/registrasi` (klasifikasi, berkas, penandatangan).
- Editor item Non Aset bergaya kartu dengan input nominal `Rp` berformat
  ribuan secara live.
- Komponen `NominalInput` mendukung prop `align` (`left` | `right`).
- Driver tes `surat-form-driver` memilih kandidat label terpendek agar
  tidak salah menabrak subjudul stepper.
- Tambahan uji untuk lampiran, draf, multi-item, penandatangan minimal,
  signers/usage cascade.

Validasi:

- `tsc --noEmit`: hijau
- `vitest run`: 118 file / 766 tes lulus
- PR: https://github.com/aldamadz/frontend/pull/233

### 2.2 Unified Work Calendar (CAL-03 F1–F7) — changelog gabungan staging

- **Status**: kandidat staging, menanti keputusan rilis production
- **Tanggal target**: menyusul instruksi rilis eksplisit dari pemilik produk
- **Lingkup**: seluruh fase CAL-03 F1 sampai F7 digabung dalam satu entri
- **Dokumentasi**: [`CAL-03_WORK_CALENDAR.md`](./CAL-03_WORK_CALENDAR.md)

Perubahan:

- **F1**: fondasi Unified Work Calendar — workspace Hari/Minggu/Bulan, quick
  entry, empat status pekerjaan, dan overdue turunan (bukan status tersimpan).
- **F2**: skema database dan repository Supabase `work_calendar_entries`
  beserta RLS kepemilikan.
- **F3**: cutover route resmi `/calendar`, RPC anggota tim, dan repository
  profil; kalender agenda lama tidak lagi menjadi entry point.
- **F4A**: koreksi ketepatan filter Tim, keterbacaan dark mode, label aksi
  tambah kontekstual, dan Team Overview skala Direktur (paginasi + agregat
  server-side).
- **F4B**: detail entri responsif (side sheet desktop/tablet, dialog layar
  penuh mobile) di Hari/Minggu/Bulan/Tim dan Quick Add dari area tanggal kosong
  Minggu/Bulan.
- **F5**: siklus hidup pekerjaan — satu pekerjaan = satu baris, aksi
  "Lanjutkan hari ini"/"Ubah jadwal"/"Terhambat"/"Selesai" hanya PATCH baris
  yang sama, histori peristiwa server-side, tenggat `due_date`, warna penanda
  statis aksesibel, dan timeline peristiwa di panel detail.
- **F6**: hari & jam kerja diturunkan dari konfigurasi KPI existing (read-only,
  default Senin–Jumat 08:00–17:00), tabel `holidays` (libur nasional/cuti
  bersama) dengan impor terkurasi, dan pembeda visual nonkerja/libur berlabel.
- **F7**: ringkasan pekerjaan hari ini & tertunda di dashboard
  (`get_work_calendar_dashboard_entries`), notifikasi lonceng berbasis tabel
  `notifications` bersama dengan badge angka dan ikon kategori
  (`generate_work_calendar_notifications` untuk tenggat terlewati, pengingat
  tindak lanjut, dan eskalasi atasan; dedupe unik, batching satu
  notifikasi/kategori/hari, debounce 6 jam, eskalasi berbasis hari kerja), serta
  integrasi `work_calendar_events` ke modul Aktivitas Terbaru
  (`get_my_recent_work_calendar_events`).
- **F8**: penutupan produk — manual Kalender Kerja di `docs/`, changelog
  gabungan ini, dan audit aksesibilitas ringan termasuk Dark Mode; tanpa fitur
  atau kolom database baru.

Migration (staging saja):

- `20260915072607_work_calendar_entries.sql`
- `20260915093000_work_calendar_team_members.sql`
- `20260916170000_work_calendar_team_overview.sql`
- `20260916171000_work_calendar_team_overview_scale.sql`
- `20260917120000_work_calendar_lifecycle.sql`
- `20260918090000_work_calendar_holidays.sql`
- `20260918120000_work_calendar_notifications.sql`

Validasi staging:

- Migration F1–F7 diterapkan dan diverifikasi pada Supabase staging.
- Fungsi F7 (`generate_work_calendar_notifications`,
  `get_work_calendar_dashboard_entries`, `get_my_recent_work_calendar_events`)
  tersedia dengan hak akses yang benar.
- Bundle staging memuat kode F7; health `live`/`ready`/`version` merespons dan
  SHA rilis sesuai.
- `tsc --noEmit`, `vitest run`, `test:work-calendar-sql`, `lint`, `build`, dan
  `npm audit --audit-level=high` hijau.

Catatan: entri ini **belum** menjadi rilis production. Riwayat rilis resmi pada
bagian 3 baru diisi saat branch fitur dipromosikan ke `main` atas instruksi
eksplisit.

## 3. Riwayat Rilis

_Belum ada rilis resmi yang tercatat. Entri pertama akan ditambahkan saat
rilis produksi pertama._

## 4. Skema Penambahan Entri

Saat branch fitur dipromosikan ke `main`, tambahkan entri baru di bagian 3
dengan format:

```md
### 3.N Judul singkat

- **Tanggal**: YYYY-MM-DD
- **Cabang**: release/YYYY-MM-DD
- **PR**: [#NNN](https://github.com/aldamadz/frontend/pull/NNN)
- **Lingkup**: ringkasan 1-2 kalimat

Perubahan:

- daftar poin-poin hasil

Validasi:

- tsc, vitest, smoke test hasil
```

Setelah entri ditulis, kosongkan atau pindahkan entri dari bagian 2 ke
bagian 3, dan perbarui peta fitur di `docs/FEATURE_RELEASE_MAP.md` bila
status fitur berubah.
