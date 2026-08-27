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
