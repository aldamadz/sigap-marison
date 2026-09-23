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

_Tidak ada kandidat rilis yang belum dipromosikan._

## 3. Riwayat Rilis

### 3.1 Unified Work Calendar dan alur Surat production-safe

- **Tanggal**: 2026-09-23
- **Cabang**: `release/production-20260922`
- **PR**: [#333](https://github.com/aldamadz/frontend/pull/333)
- **Merge SHA**: `0acbdf1c738d8aa0948f86697d6c3618a23fd551`
- **Lingkup**: CAL-03 F1, F2, F3, F4A, F4B, F5, F6, F7, dan F8; form-first
  Surat, workflow kanonikal, revisi SPK Unit, PDF native, dan manajemen user
  backend production-safe.

Perubahan:

- Kalender Kerja menyediakan tampilan Hari, Minggu, Bulan, dan Tim; Quick Add,
  detail responsif, siklus hidup pekerjaan, hari kerja/libur, dashboard,
  notifikasi, dark mode, dan aksesibilitas.
- Form Surat memakai urutan Form → Kegunaan → Lokasi/Konteks → Nomor dengan
  modul Aset, Dana, Unit, dan Non Unit yang fail-closed.
- SPK Unit memvalidasi kapasitas Marison secara server-side dan menyediakan
  jalur Kembalikan ke Pemohon saat Tim Pemeriksa menemui dead-end.
- PDF worker mendeteksi PGD melalui master form kanonikal dan memuat factory
  runtime yang sama dengan test.
- Manajemen user berjalan melalui backend; production memakai email
  undangan/pemulihan, tanpa password bootstrap staging.
- Fixture akun/kegunaan `[UJI STAGING]`, mapping khusus staging, dan data uji
  staging tidak dipromosikan.

Validasi:

- CI: 176 file / 1.734 test lulus; lint, typecheck, build, dan audit hijau.
- SQL disposable: Work Calendar, workflow kanonikal, branch asset, revisi PDF,
  dan REC-03 lulus.
- Production: 15 migration diterapkan tanpa drift; app dan PDF worker memakai
  merge SHA yang sama; live/ready, aset, SPA fallback, dan auth boundary lulus.

### 3.2 Alur registrasi bertahap + editor Non Aset bergaya kartu

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
