# SEC-02: Review PRD Keamanan SIGAP

Tanggal: 23 Oktober 2026, Asia/Jakarta. Penulis: [Codex]. Issue: #748.

## Kesimpulan

**Perlu revisi sebelum implementasi.** Arah hardening relevan, tetapi beberapa
asumsi baseline salah, rancangan CSP belum cukup untuk aplikasi ini, dan metrik
rating/header belum membuktikan keamanan data. Ini review, bukan sertifikasi
keamanan atau laporan penetration test.

Dokumen yang dibandingkan: `C:/Users/Aldama/Downloads/PRD-sigap-security.md`,
versi 1.0 tanggal 23 Oktober 2026. Dokumen asli tidak diubah.

## Cakupan dan Bukti

- Source production/main: `ba813c92d7eaef0ea808a071f7f41597dd6bf6e2`.
- Runtime production pada pemeriksaan: SHA yang sama; runtime staging:
  `3a27afac9eb498c7408ac18b40bd5d62a7f8dfac`.
- Pemeriksaan source, header GET publik, konfigurasi Cloudflare read-only,
  anotasi GitHub check, dan npm audit lockfile yang sama dengan runtime aplikasi.
- Production sudah memakai infrastruktur Proxmox; DB/Auth self-hosted terpisah
  dari aplikasi dan storage. Staging masih memakai DB/Auth Supabase Cloud.
- Tidak menjalankan brute force, pemindaian aktif, exploit, restore database,
  perubahan WAF/CSP/ACL, deployment, atau pengiriman dokumen ke vendor.
- Pembacaan kode membuktikan kontrol terkonfigurasi, bukan bahwa seluruh jalur
  telah lulus uji serangan. Cakupan audit image/OS, MFA, RLS/IDOR dan jaringan
  belum lengkap dalam review ini.

## Temuan Berprioritas

### P1: Nonce bukan pengganti langsung seluruh inline style

PRD baris 47, 55, 68 dan 113-132 menjadikan nonce solusi tunggal dan menyebut
React hydration. SIGAP adalah SPA Vite dengan `createRoot`, bukan SSR hydration.
Header CSP saat ini memang mengizinkan inline CSS, tetapi script sudah tidak
mengizinkan `unsafe-inline`. Temuan inline CSS sendiri belum membuktikan XSS.

Nonce dapat mengizinkan elemen `style`/`script`, bukan atribut `style`. Namun
penulisan properti DOM individual seperti `element.style.display` juga berbeda
dari `setAttribute`/`cssText`; tidak tepat menyimpulkan seluruh React style prop
pasti rusak. Audit browser diperlukan untuk chart, theme, Radix, animasi,
progress, dialog, halaman login, upload dan PDF.

Source: [entry SPA](../../src/main.tsx), [chart style element](../../src/components/ui/chart.tsx),
[CSP Fastify](../../backend/src/app.ts), [CSP helper](../../backend/src/lib/http.ts).
Vite menyediakan `html.cspNonce`, tetapi placeholder tetap harus diganti dengan
nilai acak baru pada setiap respons HTML dan cocok dengan header. Nonce tetap
hasil build bukan rancangan yang aman. Cache HTML, transformasi respons dan
header harus satu kontrak; asset ber-hash tetap dapat immutable.
Lihat [dokumentasi Vite](https://v6.vite.dev/guide/features#content-security-policy-csp)
dan [perbedaan style attribute](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src-attr).

**Koreksi:** mulai dengan report-only dan inventaris runtime, tentukan kombinasi
stylesheet eksternal/hash/nonce berdasarkan kebutuhan, lalu enforce setelah
acceptance. Jangan menambah izin inline script yang sebenarnya tidak dibutuhkan.
Sertakan CSP halaman maintenance origin dan Cloudflare, bukan hanya SPA.

### P1: Audit dependency sudah ada, eksekusi otomatis justru terblokir

PRD baris 30 dan bagian 5.2 menyatakan belum ada scanning otomatis. Workflow
[Quality Gate](../../.github/workflows/quality.yml) sudah menjalankan
`npm audit --audit-level=high` untuk PR/push, dan workflow deploy juga memiliki
audit. Tidak ditemukan konfigurasi Dependabot pada baseline yang diperiksa.

Check GitHub `120285607432` tidak mulai karena pembayaran/spending limit akun,
bukan karena test aplikasi gagal. Konfigurasi workflow bukan bukti check berjalan.
Prioritasnya pulihkan kapasitas CI, lalu putuskan pembaruan dependency terjadwal
dan alert; menambah tool tanpa memperbaiki eksekusi tidak menutup celah proses.

Audit read-only tanggal ini, bukan klaim bebas seluruh CVE:

| Cakupan npm | Critical | High | Moderate | Low |
| --- | --- | --- | --- | --- |
| Seluruh dependency lockfile | 0 | 0 | 4 | 1 |
| Dependency runtime (`--omit=dev`) | 0 | 0 | 0 | 1 |

Moderate mencakup rantai Vitest dan postcss-selector-parser; low runtime Fastify
memiliki [advisory resmi](https://github.com/advisories/GHSA-389g-gv7q-r4x8).
Belum ada patch baru dalam review ini. Nama `vendor-react`, `vendor-query`, dst.
di PRD adalah nama chunk [Vite](../../vite.config.ts), bukan paket untuk di-update.
Gunakan nama/versi paket nyata, lockfile, runtime image dan exploitability terpisah.

### P1: Kerahasiaan file dan otorisasi perlu masuk ruang lingkup

PRD menyebut data internal rahasia, tetapi lebih banyak mengukur header/rating.
Pemeriksaan perbaikan gambar sebelumnya membuktikan foto rekomendasi pada bucket
publik dapat diambil tanpa cookie. Itu perilaku yang sudah ada, bukan bukti bahwa
semua file seharusnya privat atau temuan bypass baru. Nama path yang sukar ditebak
bukan otorisasi.

**Koreksi:** tetapkan klasifikasi foto/lampiran, siapa yang boleh melihatnya,
dan bedakan tautan internal, snapshot penandatangan, arsip, serta capability URL
yang memang diperlukan vendor. Uji lintas akun/kantor, anonimus, revoke/expiry,
cache privat dan PDF historis. Bila file diklasifikasikan internal-only, akses
publik tanpa sesi menjadi gap yang harus ditutup. Jangan mengubah ACL sebelum
menyepakati model ini karena dapat memutus rekomendasi/PDF dan integrasi Marison.

Tambahkan inventaris/rotasi secret dan bukti restore DB/Auth/storage yang
konsisten. Status rotasi secret pascainsiden output operator sebelumnya belum
diverifikasi. RTO/RPO adalah target sampai dibuktikan melalui restore drill.

### P2: Baseline TLS dan cakupan WAF perlu dicatat, bukan ditebak

API Cloudflare zone production melaporkan plan Free, `ssl=full`,
`min_tls_version=1.0`, `always_use_https=off`, dan NEL aktif. GET HTTP SIGAP tetap
merespons **308 ke HTTPS**, sehingga flag terakhir bukan bukti situs menyajikan
konten aplikasi melalui HTTP. Negosiasi TLS 1.0 tidak diuji dalam review ini.

Mode Full tidak memvalidasi sertifikat origin seperti Full (strict). Sebelum
mengubahnya, audit jalur origin/Tunnel yang efektif, sertifikat, host override,
dan semua hostname yang terpengaruh. Zone dipakai aplikasi lain; jangan melakukan
perubahan zone-wide secara buta. Evaluasi minimum TLS 1.2 dengan kebutuhan klien.
Lihat [Full](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full/)
dan [Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/).

Tidak ditemukan custom rule khusus SIGAP pada entrypoint zone yang dibaca;
custom skip rule yang ada terbatas pada aplikasi lain. Entrypoint zone untuk
rate limiting tidak ditemukan. Ini bukan kesimpulan seluruh WAF mati:
[Free Managed Ruleset tersedia secara default](https://developers.cloudflare.com/waf/get-started/).
Efektivitas managed rules, policy account/inheritance dan security events belum
dibuktikan penuh. Status bot protection tidak dapat dipastikan dari query ini.

Origin sudah membatasi `/api/auth/login` menjadi 8 request/15 menit per identitas
(fallback IP), dan OTP 30/15 menit: [auth routes](../../backend/src/routes/auth.routes.ts).
Global rate limit tidak aktif untuk semua endpoint. Uji distribusi proses,
trusted proxy dan batas per-IP/per-identitas terpisah sebelum menyatakan cukup.
Jangan menjalankan brute force production sebagai acceptance.

**Koreksi:** ganti target "5+ rules" dengan abuse cases, kemampuan plan dan
false-positive budget. Batasi rule ke hostname/path SIGAP; jangan memasang browser
challenge pada API, SSE, capability PDF atau request server-to-server vendor.
WAF tidak menggantikan validasi upload, authorization, MIME/content checks atau
penyimpanan non-executable di backend.

### P2: Header tambahan tidak boleh dijadikan checklist universal

`Expect-CT` di PRD baris 195 sudah deprecated; hapus requirement ini, bukan
menjadikannya pekerjaan baru. [Dokumentasi MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Expect-CT).

`COEP: require-corp` dapat memblokir resource lintas origin yang belum menyediakan
CORP/CORS. `COOP: same-origin` mengubah hubungan window/opener. Keduanya perlu
alasan kebutuhan, bukan sekadar menaikkan skor. Uji gambar storage, preview/PDF,
tab unduhan, login/pairing desktop dan jalur vendor sebelum promosi.
Lihat [COEP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy)
dan [COOP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy).

### P2: CSP reporting dan rollback belum mempunyai batas aman

`report-to csp-endpoint` di PRD perlu pemetaan `Reporting-Endpoints`; endpoint
harus menerima format modern `application/reports+json` dan, bila digunakan,
legacy `application/csp-report`. Lihat [report-to](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/report-to).

Report adalah input tidak tepercaya dan dapat berisi URL/query sensitif.
Tetapkan body/batch limit, rate limit, sanitasi/token redaction, deduplikasi,
retensi, pembatasan pembaca log dan anggaran storage. Endpoint tanpa login boleh
dibutuhkan browser, tetapi tidak boleh menjadi sarana menyimpan input tak terbatas.

PRD baris 334 menawarkan fallback otomatis `unsafe-inline` bila nonce gagal.
**Koreksi:** rollback eksplisit ke policy/deployment terakhir yang tervalidasi,
pertahankan baseline script policy, dan laporkan kegagalan. Jangan diam-diam
melonggarkan policy per respons. Report-only baru dipasang sebagai tambahan,
bukan menghapus CSP enforce yang saat ini sudah melindungi aplikasi.

### P3: NEL, security.txt dan ukuran keberhasilan perlu dikoreksi

- NEL Cloudflare adalah mekanisme telemetri browser yang memang memakai header
  publik, bukan otomatis kebocoran secret. Evaluasi privasi/retensi sesuai
  kebijakan, bukan menonaktifkannya karena endpoint terlihat.
  [Dokumentasi Cloudflare](https://developers.cloudflare.com/network-error-logging/).
- `/.well-known/security.txt` saat audit benar-benar HTTP 404. Publikasikan
  setelah contact mailbox memiliki penanggung jawab; alamat `security@...` dan
  halaman policy/acknowledgments di PRD belum dibuktikan siap. `Contact` dan
  `Expires` wajib; contoh harus sesuai [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116).
- Rating B+/A tidak menyebut scanner, waktu, konfigurasi atau bukti baseline.
  Jangan mengklaim rating aktual/sertifikasi enterprise dari jumlah header.
- Target kurang dari 10 CSP report/hari tidak membedakan serangan, extension,
  regression dan traffic. Ukur pelanggaran aplikasi sah yang dapat direproduksi,
  coverage flow, deteksi/triase dan dampak performa dengan volume traffic.
- T1-T7 berjumlah **15 hari**, bukan 8. Ditambah T8 menjadi **22 hari** jika
  dijalankan serial dengan satuan sama; monitoring 7 hari harus dibedakan dari
  hari kerja. Total 200 person-hours tidak otomatis berarti 8 minggu/5 orang.
  Pisahkan effort, ketersediaan orang, paralelisme dan ketergantungan.

## Urutan yang Disarankan untuk Revisi PRD

| Tahap | Hasil yang diminta sebelum melanjutkan |
| --- | --- |
| A. Baseline | CI dapat berjalan; inventaris dependency/image, klasifikasi file, secret dan jalur TLS diverifikasi. |
| B. Observabilitas | Contact nyata, security.txt, CSP collector terbatas, report-only tambahan dan log redacted. |
| C. CSP | Desain SPA/static nonce/hash sesuai hasil browser; satu kontrak header, HTML dan cache; maintenance tetap bekerja. |
| D. Proteksi terukur | WAF/rate limit spesifik SIGAP, upload/authz tests, false-positive checks dan selective rollout. |
| E. Pembuktian | Restore drill, scoped pentest, tindak lanjut temuan dan laporan dengan bukti runtime. |

Setiap perubahan tetap branch terpisah, staging lebih dahulu dan production
hanya setelah persetujuan eksplisit. Review ini tidak menyetujui implementasi
atau mengubah jadwal delapan minggu menjadi komitmen rilis.

## Acceptance yang Perlu Ditambahkan

- Login/logout/reset/OTP, sesi tidak aktif, lintas kantor, admin terdelegasi dan
  pairing/revoke perangkat tidak memperoleh akses lebih luas.
- Rekomendasi beserta foto, clipboard, upload, Excel, chart, theme, dialog,
  realtime/SSE, PDF parsial/final dan file vendor tetap berjalan di browser target.
- Jika dipilih nonce, dua respons HTML memiliki nonce berbeda dan setiap respons
  cocok dengan header; cache tidak mencampur nonce atau membocorkan data pengguna.
- Dependensi aplikasi, development tools dan image/OS dilaporkan terpisah dengan
  severity, dampak, versi perbaikan, owner dan tenggat. Tidak ada klaim 0 CVE global.
- Uji restore membuktikan konsistensi database/auth, object storage, PDF dan audit;
  tidak mengirim ulang outbound atau mengubah keputusan persetujuan.
- Catat dan tangani drift source/konfigurasi Caddy aktif sebelum recovery drill;
  jangan reload source yang belum cocok dengan runtime pada shared proxy.
- Ukur p95 baseline dan sesudah, error rate, false positives, biaya report/log,
  waktu triase dan keberhasilan rollback; uptime/RTO/RPO harus punya bukti.

## Status Akhir

Review dan pencocokan baseline **selesai**. Implementasi hardening **belum
dimulai**. Tidak ada deployment, migration, patch dependency, perubahan secret,
ACL, WAF, CSP atau konfigurasi TLS yang dilakukan dalam tugas SEC-02 ini.
