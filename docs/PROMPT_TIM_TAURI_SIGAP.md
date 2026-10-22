# Prompt Tim Tauri: Integrasi Akun dan Notifikasi SIGAP Staging

Implementasikan integrasi SIGAP pada aplikasi desktop Tauri2 Windows/macOS
yang sudah ada. Jangan membuat aplikasi SIGAP desktop terpisah. Admin aplikasi
tetap melalui web. Ikuti pola repository aplikasi kalian dan baca kontrak
`DESKTOP_STAGING_CONTRACT.md` yang menyertai prompt ini sebelum coding.

## Target

- Hanya staging: `https://sigap.marison-testing.biz.id`.
- Public client ID `sigap-desktop-staging`; tidak ada client secret.
- Akun SIGAP menjadi identitas login. Jangan minta/menyimpan password SIGAP di
  aplikasi, jangan akses Supabase langsung, jangan gunakan cookie sesi web.
- Nama perangkat otomatis dari hostname OS. Gunakan installation UUID persisten
  per pengguna OS sebagai identitas instalasi; hostname bukan identifier unik.

## Login

1. Implementasikan pairing dari Rust: verifier random + S256, panggil
   `POST /api/desktop/pairings`, tampilkan kode8 digit yang diterima dan buka
   `verification_uri` di browser sistem. User login SIGAP dan menyetujui
   perangkat dengan memasukkan kode dari aplikasinya.
2. Poll `POST /api/desktop/token` setiap minimal5 detik memakai `device_code`
   dan verifier asli. Tangani pending202, slow_down429, ditolak/kedaluwarsa401.
3. Token hanya hidup di Rust. Simpan refresh token di Windows Credential Manager
   / macOS Keychain melalui integrasi yang terawat; jangan plaintext, localStorage,
   frontend store, log atau telemetry. Access token cukup di memori Rust.
4. Refresh single-flight dan rotasi atomik; reuse token mencabut sesi. Jika respons
   refresh hilang/tidak pasti, minta login ulang, bukan retry token lama.
5. Ambil `/api/desktop/me` untuk identitas. Jangan mencocokkan user berdasarkan
   nama/email perangkat. Logout mencabut sesi desktop dan membersihkan credential
   lokal serta cache akun; sesi web tidak diutak-atik.

## Notifikasi

- Rust polling `/api/desktop/notifications` dengan interval30 detik, jitter,
  backoff dan reconnect; hanya satu loop per akun walaupun beberapa window.
- Implementasikan pagination dan seen-ID persisten per origin/user. Sinkronisasi
  pertama menjadi baseline, tidak membanjiri popup lama. Catch-up offline tidak
  boleh membuang halaman yang belum diproses atau menampilkan duplikat.
- Gunakan plugin notifikasi native Tauri, minta izin OS dan tampilkan status izin
  ditolak/offline/sesi berakhir. Izin ditolak tidak merusak inbox dalam aplikasi.
- Popup layar terkunci default generik; detail dapat diaktifkan pengguna.
- Membaca inbox tidak otomatis menandai dibaca. `/notifications/:id/read` hanya
  ketika pengguna membuka/membaca notifikasi. Cegah akses ID milik akun lain.
- Klik membuka origin staging + `path` tervalidasi di browser sistem, bukan HTML
  dari notifikasi. `path:null` cukup buka dashboard. Tidak membawa token di URL.
- Tetap menerima saat tray/menu bar jika proses hidup. Jelaskan bahwa aplikasi
  yang benar-benar ditutup tidak menerima popup; jangan menjanjikan push OS
  ketika aplikasi mati karena WNS/APNs belum disiapkan.

## Keamanan dan Batas

- Jangan mengubah CORS SIGAP, role admin, approval, data surat atau production.
- Token desktop hanya profile/inbox/mark-read, bukan akses penuh SIGAP.
- Semua network ber-credential melalui Rust HTTPS exact-origin; jangan ikuti
  redirect lintas origin. Batasi IPC/capabilities pada bundled UI, tanpa grant
  untuk halaman web remote. Tidak perlu deep link atau local listener untuk
  alur pairing ini.
- Jika admin web aplikasi kalian juga memerlukan SSO SIGAP, ajukan kontrak
  terpisah; endpoint admin di kontrak ini hanya untuk web SIGAP same-origin.
- Jangan membuat endpoint/field berdasarkan asumsi; cocokkan dengan kontrak
  terlampir. Laporkan mismatch, jangan bypass validasi atau menyisipkan key.

## Acceptance dan Hasil

Uji Windows dan macOS dari paket terpasang: login berhasil/ditolak/kedaluwarsa,
kode salah, refresh normal/reuse/network timeout, logout, ganti akun, nama device,
password SIGAP berubah, izin notifikasi ditolak/diizinkan, offline catch-up,
pagination>50, restart aplikasi, multi-window tanpa duplikasi, klik notifikasi,
dan pencabutan akses dari Settings/Konfigurasi SIGAP. Jangan memakai production.

Serahkan perubahan terfokus, tes terdampak, panduan build/signing, screenshot
login/inbox/status koneksi, bukti native popup kedua OS dan daftar batas yang
belum diuji. Jangan mengklaim lulus native popup hanya dari tes browser.

## Status Backend Staging

2026-10-22 [Codex]: AUTH-09 aktif pada runtime
`cb56ddceca371a25078040d667141dc496ac35d0`. Ketujuh endpoint dan halaman
persetujuan/pencabutan perangkat sudah diuji melalui domain staging. Mulai
pairing baru untuk pengujian; kode lama kedaluwarsa setelah5 menit atau sekali
ditukar. `/me` dan `/notifications` membalas401 tanpa Bearer token perangkat,
bukan404. Jangan memakai token Supabase/web untuk endpoint desktop.
