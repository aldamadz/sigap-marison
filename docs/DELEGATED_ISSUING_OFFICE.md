# Hak Akses Kantor Pengajuan

Feature: AUTH-08 / SUR-25. Issue: #539. Target awal: staging.

Admin membuka `/admin/configuration/access`, mencari pengguna aktif non-admin,
lalu memilih kantor tambahan dan menyimpan hak akses. Kantor profil selalu
tersedia; izin tambahan tidak mengganti profil, departemen, jabatan, atau role.
Versi ini menyediakan satu kemampuan: `submission.issue_for_office`. Kemampuan
admin lainnya tidak otomatis diberikan dan belum menjadi pilihan pada halaman ini.

Pemohon memilih **Kantor Pengajuan** sebelum formulir dan kegunaan:

| Pilihan | Proyek | Penandatangan dan nomor |
| --- | --- | --- |
| KC | KC tersebut dan seluruh KCP turunannya | Aturan kantor KC yang dipilih |
| KCP | Hanya KCP tersebut | Aturan KCP dan BM KC induknya |

Izin KC tidak memberikan izin menerbitkan atas nama setiap KCP di bawahnya.
Nama pemohon tetap pengguna yang melakukan pengajuan. Hak menandatangani atau
menyetujui tidak berubah. Ketentuan form, proyek external, dan penomoran tetap
menggunakan jalur kanonikal.

Mengganti kantor sebelum nomor dipesan membersihkan form, kegunaan, proyek, dan
pilihan pejabat agar konteks lama tidak terbawa. Setelah nomor dipesan, kantor
terkunci di UI maupun database. Pengguna harus membatalkan draft dan membuat
pengajuan baru untuk memakai kantor lain; kebijakan reuse nomor tetap berlaku.

Pencabutan izin memblokir pemesanan nomor dan pengiriman pengajuan baru untuk
kantor tersebut. Surat yang telah dikirim, tanda tangan, dan riwayat sebelumnya
tidak diubah. Perubahan izin memiliki audit grant/revoke beserta pelaku dan waktu.

## Rilis

Migration `20261012140000_delegated_issuing_office.sql` harus diterapkan sebelum
aplikasi baru. Migration menambah tabel/RPC/guard; tidak memindahkan karyawan
atau mengubah surat lama. Patch fungsi lama memeriksa anchor dan berhenti jika
implementasi remote tidak dikenali. Jangan menjalankan repair/include-all.

Acceptance SQL disposable menggunakan:

```text
node scripts/test-letter-number-reuse-sql.mjs --delegated-offices
```

Meliputi pemesanan dan pengiriman RPC asli, cakupan KC/KCP, izin dicabut, akun
nonaktif/asing/anon, immutability kantor, dan nomor urut sama pada dua kantor.
Uji database disposable bukan bukti deployment atau acceptance browser live.

Rollback aplikasi mempertahankan migration agar riwayat audit tidak hilang.
Untuk menonaktifkan delegasi, admin mencabut kantor tambahan melalui RPC/halaman
yang sama; jangan menghapus tabel atau mengubah surat historis. Production hanya
dipromosikan setelah permintaan eksplisit dan penerimaan staging.
