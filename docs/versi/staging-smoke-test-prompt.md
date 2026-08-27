# Smoke Test Prompt — Kandidat Rilis `feature/surat-registrasi-wizard`

Gunakan prompt di bawah ini apa adanya saat menyuruh agent lain (atau
pengerjaan manual) memverifikasi hasil deploy staging sebelum rilis ke
`main`. Prompt ini mencakup tiga hal: konteks apa yang harus diverifikasi,
langkah uji yang harus dijalankan, dan format laporan yang harus
dikembalikan.

## Konteks untuk Agent Verifier

Anda akan memverifikasi branch `feature/surat-registrasi-wizard` yang
sudah di-merge ke staging melalui PR
[#233](https://github.com/aldamadz/frontend/pull/233) dan PR
[#234](https://github.com/aldamadz/frontend/pull/234). Domain staging
adalah `https://sigap.marison-testing.biz.id`. Database Supabase staging
sudah berisi matrix `Permohonan Non Unit (Pusat)` (id
`844eb436-bb15-4cea-8ce0-cdeaa33af200`) yang terhubung ke departemen
`Pengembangan Organisasi` (id
`ac610ca4-6ec1-4f68-a491-42a69c7bcbf7`).

Verifikasi yang diminta fokus pada alur registrasi surat bertahap 1 → 2 → 3
dan editor item Non Aset bergaya kartu. Setiap langkah harus lulus tanpa
error JavaScript (cek DevTools Console) dan tanpa toast merah.

## Prompt untuk Verifier

Salin prompt ini ke agent lain (atau gunakan sebagai runbook manual).

---

Kamu adalah QA engineer yang memverifikasi rilis kandidat SIGAP frontend
ke environment staging.

**Tujuan:** memastikan branch `feature/surat-registrasi-wizard` (PR #233
dan #234) dapat digunakan end-to-end di staging
(`https://sigap.marison-testing.biz.id`) tanpa regresi.

**Lingkungan yang harus diverifikasi:**

- Domain: `https://sigap.marison-testing.biz.id`
- Akun uji: Aldama Rindra Saputra (Kantor Pusat + Pengembangan
  Organisasi). Akun KC lain (mis. KC Teknik) untuk alur cabang bila
  diperlukan.
- Database staging sudah berisi proyek NKMZ7 — Nusantara Prime (mapping
  Marison lengkap, kantor Pusat).
- Matrix `Permohonan Non Unit (Pusat)` (id
  `844eb436-bb15-4cea-8ce0-cdeaa33af200`) sudah aktif dan terhubung ke
  departemen Pengembangan Organisasi.

**Langkah smoke test (jalankan berurutan, catat hasil per langkah):**

1. **Login & landing**
   - Buka `https://sigap.marison-testing.biz.id` (atau subdomain staging
     yang sesuai).
   - Login sebagai Aldama Rindra Saputra.
   - Verifikasi dashboard tampil tanpa error console.

2. **Wizard alur registrasi (Aset)**
   - Buka `/surat/registrasi` dari sidebar.
   - Pastikan stepper 1 → 2 → 3 tampil di atas form.
   - Pilih klasifikasi **Aset**.
   - Pilih Kantor, Departemen (auto), Entitas, Jenis Surat.
   - Pilih matrix "Permohonan Aset (Pusat)" atau matrix lain yang
     tersedia untuk Aldama.
   - Klik **Dapatkan Nomor Surat**.
   - Verifikasi nomor urut dihasilkan (format `001/UAI/...`).
   - Verifikasi form berpindah ke step 2 (berkas/lampiran) secara
     otomatis.

3. **Editor Non Aset bergaya kartu**
   - Kembali ke step 1 (klik step 1 di stepper), ganti klasifikasi ke
     **Non Aset**.
   - Pastikan editor item Non Aset tampil dengan tampilan kartu
     (bukan tabel grid), minimal satu baris contoh.
   - Isi nominal pada input pertama — pastikan angka berubah menjadi
     format ribuan dengan awalan `Rp` secara real-time.
   - Isi dua baris dengan nominal berbeda — pastikan total di bagian
     bawah baris adalah jumlah keduanya.
   - Klik **Dapatkan Nomor Surat** → nomor urut dihasilkan, lompat ke
     step 2.

4. **Alur Non Unit Pusat (matrix baru)**
   - Mulai sesi registrasi baru.
   - Pilih klasifikasi **Non Unit**.
   - Pada dropdown matrix/kegunaan, pastikan **Permohonan Non Unit
     (Pusat)** muncul (matrix baru, scope Pusat, departemen Pengembangan
     Organisasi).
   - Pilih proyek **NKMZ7 — Nusantara Prime**.
   - Klik **Dapatkan Nomor Surat**.
   - Verifikasi nomor urut dihasilkan (format
     `001/UAI/NKMZ7/VIII/2026` atau varian).
   - Verifikasi form berpindah ke step 2.

5. **Negative test alur Unit**
   - Mulai sesi baru, pilih klasifikasi **Unit**.
   - Pastikan tombol Unit disabled dengan label "Tidak tersedia untuk
     departemen akun Anda" karena Aldama tidak punya matrix Unit.
   - Klik tombol lain (Aset / Non Aset / Non Unit) tetap bisa.

6. **Penandatangan (step 3)**
   - Lanjutkan dari langkah 2 atau 4 di atas.
   - Pastikan daftar penandatangan minimal terisi otomatis sesuai
     matrix (Staff Departemen → Pimpinan Departemen → Mgr. HRD GA →
     Direktur Utama).
   - Submit draft → toast sukses, redirect ke inbox atau detail surat.

7. **Inbox approver**
   - Login sebagai user approver (mis. Mgr. HRD GA atau Direktur
     Utama).
   - Buka `/surat/inbox` → surat yang baru disubmit muncul.
   - Buka detail → aksi Approve/Reject berfungsi.

8. **Konsistensi backend**
   - Cek DevTools → Network tab untuk request `master_offices`,
     `form_usages`, dan `generate_new_letter_number` — semua response
     200, tidak ada 4xx/5xx.
   - Cek Supabase logs untuk staging project — tidak ada error
     berulang.
   - Cek file `docs/versi/changelog.md` tampil di repo (PR #234 merged).

**Kriteria lulus:**

- Semua 8 langkah di atas selesai tanpa error console (cek F12).
- Tidak ada toast merah seperti "Gagal Mendapatkan Nomor", "Kantor
  penerbit tidak ditemukan", atau "Matrix Belum Tersedia".
- Nomor urut dihasilkan untuk semua klasifikasi yang relevan.
- Inbox approver menampilkan surat yang baru disubmit.

**Format laporan yang harus dikembalikan:**

Tulis laporan dalam Markdown dengan struktur berikut:

```md
# Laporan Smoke Test Staging — feature/surat-registrasi-wizard

- **Tanggal**: YYYY-MM-DD HH:mm (zona waktu)
- **Verifier**: nama/handle
- **Domain**: URL staging yang diuji
- **Commit**: SHA yang dideploy

## Ringkasan
- Status keseluruhan: PASS / FAIL / PASS WITH NOTES
- Catatan singkat (1-2 kalimat).

## Hasil Per Langkah
| # | Langkah | Status | Catatan |
|---|---------|--------|---------|
| 1 | Login & landing | ✅/❌ | ... |
| 2 | Wizard alur Aset | ✅/❌ | ... |
| 3 | Editor Non Aset kartu | ✅/❌ | ... |
| 4 | Alur Non Unit Pusat | ✅/❌ | ... |
| 5 | Negative test Unit | ✅/❌ | ... |
| 6 | Penandatangan step 3 | ✅/❌ | ... |
| 7 | Inbox approver | ✅/❌ | ... |
| 8 | Konsistensi backend | ✅/❌ | ... |

## Bug/Regresi (jika ada)
- Deskripsi: ...
- Reproduksi: ...
- Saran perbaikan: ...

## Rekomendasi
- Lanjut rilis ke main / Tunda / Rollback (pilih salah satu).
```

**Jika Anda menemukan bug:** jangan mencoba memperbaiki langsung. Cukup
dokumentasikan dalam laporan dan tandai langkah yang gagal. Perbaikan
dilakukan di branch terpisah.

---

## Setelah Verifikasi Selesai

Agent yang menerima laporan kemudian:

- Jika **PASS**: merge PR #234 (changelog) ke staging, lalu minta
  agent lead untuk membuat PR `feature/surat-registrasi-wizard` →
  `main` dan sinkronkan `main` ke `staging` setelahnya.
- Jika **FAIL**: buat branch `fix/*` dari staging, perbaiki regresi,
  ulangi alur merge ke staging, jalankan smoke test ulang.
- Jika **PASS WITH NOTES**: nilai setiap "catatan" — bila hanya
  kosmetik (typo, padding), boleh tetap lanjut. Bila涉及 alur data,
  tunda rilis ke main.
