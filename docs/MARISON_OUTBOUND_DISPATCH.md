# Durable Marison Outbound Dispatch

Dokumen ini menjelaskan rollout dan operasi outbox untuk `MRN-05`, `MRN-06`, dan
`MRN-07`. Semua langkah pengembangan pada dokumen ini ditujukan ke staging.
Production tidak boleh diaktifkan tanpa persetujuan rilis production yang
eksplisit dan kejelasan mekanisme deduplikasi dari vendor.

Status per 3 Agustus 2026: model generasi replacement dan panel antrean sudah
diterapkan serta diuji di staging tanpa membuat replacement atau mengirim
business POST. Hotfix runtime memastikan helper eligibility recovery ikut
di-import oleh handler dan dilindungi regression test. Production belum disentuh.

## Jaminan Utama

- Satu job aktif untuk setiap pasangan `surat_id` dan environment.
- Penolakan vendor HTTP 422 dapat menghasilkan generasi pengganti yang terpisah;
  job lama dan auditnya tidak diubah.
- Hanya satu worker lokal yang memegang lease aktif selama dua menit.
- Payload, body JSON, dan SHA-256 disimpan sekali sebelum POST.
- Kegagalan sebelum POST dapat dicoba maksimal tiga kali dengan backoff 15 dan
  30 detik.
- Timeout, koneksi terputus, HTTP 5xx, respons sukses tanpa referensi, atau worker
  mati setelah POST dimulai menghasilkan `outcome_unknown`.
- `outcome_unknown` tidak pernah dikirim ulang otomatis.
- Internal idempotency key tidak dikirim ke vendor sampai kontrak vendor
  mendukungnya.

## Konfigurasi

Runtime aplikasi dan worker memakai nilai berikut:

```text
MARISON_DEPLOYMENT_ENVIRONMENT=staging
MARISON_SUBMISSION_DISPATCH_ENABLED=true
MARISON_OUTBOUND_INTERNAL_TOKEN=<minimal 32 karakter>
MARISON_OUTBOUND_TIMEOUT_MS=30000
```

Database memiliki gate terpisah agar migration aman diterapkan tanpa langsung
mengaktifkan pengiriman. Gate diubah melalui RPC service-only dan setiap
perubahan dicatat di `marison_outbound_configuration_events`.

Aktifkan staging setelah aplikasi baru sehat dan sebelum worker dimulai:

```sql
select public.configure_marison_outbound(
  'staging',
  true,
  'Aktivasi staging setelah aplikasi durable outbox sehat'
);
```

Matikan enqueue dan claim lebih dahulu saat rollback operasional:

```sql
select public.configure_marison_outbound(
  'staging',
  false,
  'Penghentian worker staging untuk investigasi'
);
```

RPC tersebut hanya dapat dipanggil dengan `service_role`. Jangan memberikan
akses kepada `anon` atau `authenticated`.

## Urutan Rollout Staging

1. Pastikan tidak ada deployment lain ke staging.
2. Buat backup baru database staging dan verifikasi dengan `pg_restore --list`.
3. Terapkan migration saat profile worker belum aktif.
4. Verifikasi tabel, RLS, grants, RPC, trigger, dan gate database masih nonaktif.
5. Deploy aplikasi staging app-only. Jalur browser fire-and-forget dan POST vendor
   sinkron harus sudah tidak ada.
6. Pastikan `GET /health/ready` dan `GET /health/version` sehat.
7. Aktifkan gate database staging melalui RPC di atas.
8. Verifikasi antrean dan legacy snapshot sukses. Job dengan legacy success harus
   menjadi `succeeded` tanpa POST baru.
9. Mulai worker secara eksplisit:

```powershell
docker --context ubuntu-server compose `
  -p agenda-flow-staging `
  -f docker-compose.staging.yml `
  --env-file "D:\Koding\Agenda Flow\frontend\.env.staging" `
  --profile marison-outbound `
  up -d --no-deps agenda-marison-outbound-staging
```

10. Verifikasi log worker tidak menampilkan token, payload, credential, atau
    response mentah.
11. Jalankan smoke test Aset, Unit, Non Unit, completion bersamaan, timeout,
    lease expiry, dan rekonsiliasi admin.

Gunakan dokumen staging baru untuk smoke test business POST. Jangan memasukkan
surat historis dengan `data_snapshot.marison_dispatch.status = failed` ke outbox
tanpa konfirmasi vendor bahwa request lama tidak diterima, karena kegagalan pada
jalur sinkron lama tidak membuktikan POST belum diproses vendor.

Menjalankan Compose tanpa `--profile marison-outbound` tidak akan memulai worker.
Ini disengaja agar migration dan aplikasi dapat diverifikasi sebelum POST vendor
diaktifkan.

## Rekonsiliasi

### Recovery Pre-POST

`failed_terminal` hanya dapat dibuka ulang melalui preflight staging oleh admin
aktif. Preflight memeriksa `post_started_at`, response, external reference, dan
seluruh identity source terkini. Job dengan kemungkinan POST tidak eligible.

Recovery memakai job existing dan `reopen_terminal_pre_post`; event rekonsiliasi
append-only mempertahankan state lama. Worker kemudian membangun payload, body,
hash, dan `payload_resolution_sources` secara atomik. Payload prepared yang sudah
ada tetap immutable.

Untuk signer yang belum valid, admin harus melengkapi Mapping Payload Staging pada
Master User. Sistem tidak membuat mapping otomatis dan tidak memakai mapping
pemohon sebagai fallback signer.

Label `attempt_count` pada UI berarti jumlah percobaan pengiriman, bukan jumlah
approval signer.

### Pengiriman Pengganti HTTP 422

HTTP 422 membuktikan vendor menerima POST tetapi menolak isi request. Setelah
data penyebab penolakan diperbaiki, admin dapat membuat job pengganti dari
`Konfigurasi > Integration > Antrean Outbound Marison`.

- Generasi pertama adalah job asli; setiap job pengganti menambah nomor generasi.
- Satu job hanya boleh mempunyai satu pengganti langsung dan hanya satu generasi
  boleh aktif untuk surat/environment yang sama.
- Idempotency key tiap generasi deterministik dan audit alasan disimpan append-only.
- Job pre-POST, `outcome_unknown`, job production, serta job yang sudah memiliki
  external reference tidak dapat memakai tindakan ini.
- Klik ganda dan permintaan bersamaan ditolak secara atomik. Konflik ditampilkan
  sebagai instruksi untuk memuat ulang antrean.

Pengiriman pengganti berbeda dari recovery pre-POST. Recovery memakai job yang
sama karena POST belum dimulai, sedangkan pengganti membuat job generasi baru
karena vendor sudah memberikan penolakan pasti.

## Override Identitas Outbound Staging

Admin dapat mengisi override NIK, ID kantor/cabang vendor, dan ID proyek vendor
melalui halaman Integrasi Marison staging. Nilai ini hanya memengaruhi payload
outbound baru; profil, master kantor, master proyek, foreign key, dan hasil sync
tidak diubah. Override disimpan bersama audit perubahan before/after yang
memask NIK. Job yang payload-nya sudah tersimpan tidak berubah ketika konfigurasi
override berubah.

Override kosong memakai nilai hasil sinkronisasi. Override tidak valid, tidak
terpetakan, atau pasangan proyek-cabang tidak cocok menghentikan build payload
sebelum POST vendor.

Untuk `outcome_unknown`, admin wajib memeriksa sistem vendor terlebih dahulu:

- **Diterima**: isi external reference dan alasan pemeriksaan.
- **Kirim ulang**: hanya setelah vendor memastikan request sebelumnya tidak
  diterima; alasan dan konfirmasi risiko duplikasi wajib diisi.

Untuk `failed_terminal` yang belum pernah melewati batas POST, admin dapat membuka
ulang job setelah konfigurasi atau data diperbaiki. Rekonsiliasi menyimpan state
teknis sebelumnya secara append-only pada
`marison_outbound_reconciliation_events`.

## Penghentian Aman

1. Nonaktifkan gate database staging.
2. Tunggu job `processing` selesai atau masuk status terukur.
3. Hentikan hanya `agenda-marison-outbound-staging`.
4. Jangan mengubah `outcome_unknown` langsung dengan SQL.
5. Jangan menghapus row outbox atau audit rekonsiliasi.

Worker PDF dan worker sinkronisasi directory Marison tidak perlu direstart untuk
perubahan outbox.
