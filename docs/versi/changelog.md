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

### 2.1 Unified Work Calendar (CAL-03 F1-F8)

- **Status**: kandidat rilis production 2026-09-22
- **Cabang**: `release/production-20260922`
- **Issue**: [#332](https://github.com/aldamadz/frontend/issues/332)
- **Lingkup**: F1, F2, F3, F4A, F4B, F5, F6, F7, dan F8.

Kalender Kerja mencakup tampilan Hari, Minggu, Bulan, dan Tim; detail responsif,
Quick Add, siklus hidup pekerjaan, hari kerja dan hari libur, dashboard,
notifikasi, dokumentasi, serta audit aksesibilitas dan Dark Mode. Migration yang
dipromosikan dibatasi pada tujuh migration `work_calendar_*`; fixture dan
konfigurasi khusus staging tidak termasuk paket production.

## 3. Riwayat Rilis

### 3.1 Alur registrasi bertahap + editor Non Aset bergaya kartu

- **Tanggal**: 2026-08-27
- **Cabang**: `codex/release-wizard-production`
- **PR**: [#237](https://github.com/aldamadz/frontend/pull/237)
- **Lingkup**: wizard registrasi tiga tahap, editor item Non Aset bergaya kartu,
  dan perlindungan linkage draft terhadap perubahan konfigurasi.

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
- `vitest run`: 118 file / 767 tes lulus
- Smoke staging: pengajuan `011/UAI/PBO.1/VIII/2026` berhasil dan muncul
  pada inbox approver tahap kedua.
- PR sumber: [#232](https://github.com/aldamadz/frontend/pull/232) dan
  [#233](https://github.com/aldamadz/frontend/pull/233)

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
