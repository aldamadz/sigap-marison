# SIGAP External Surat API — Production

Dokumen ini adalah padanan production dari
[`docs/EXTERNAL_API_SURAT.md`](./EXTERNAL_API_SURAT.md). Kontrak, alur
autentikasi, dan endpoint identik; yang berbeda hanya URL publik, variabel
lingkungan, dan prosedur deployment.

> **Kontrak sumber kebenaran**: lihat
> [`docs/EXTERNAL_SUBMISSION_DECISIONS.md`](./EXTERNAL_SUBMISSION_DECISIONS.md)
> untuk endpoint keputusan pengajuan dan
> [`external-api/openapi.mjs`](../external-api/openapi.mjs) untuk
> definisi OpenAPI yang digunakan runtime.

## 1. URL

```txt
Base URL : https://external.marisoncloud.com/api
Docs     : https://external.marisoncloud.com/docs
OpenAPI  : https://external.marisoncloud.com/openapi.json
Health   : https://external.marisoncloud.com/health
```

Jika subdomain berbeda pada saat deploy, perbarui blok di atas dan variabel
`EXTERNAL_API_PUBLIC_URL` di `.env.production` agar konsisten.

## 2. Variabel Lingkungan

Letakkan di `.env.production` (di-host, bukan di Git) sebelum menjalankan
`docker-compose.external.yml`:

```ini
# Runtime
NODE_ENV=production
PORT=80
EXTERNAL_API_PORT=3020

# URL publik (wajib)
EXTERNAL_API_PUBLIC_URL=https://external.marisoncloud.com
APP_PUBLIC_URL=https://sigap.marisoncloud.com

# Supabase production
SUPABASE_URL=https://xuhyodtmgwteyslhrkfx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-dari-secret-manager>

# Token internal facade ↔ backend (jangan diberikan ke vendor)
SUBMISSION_DECISIONS_API_TOKEN=<min-32-karakter-acak>

# Self-hosted storage production
STORAGE_MODE=self_hosted_supabase
STORAGE_SUPABASE_URL=https://<storage-project>.supabase.co
STORAGE_SUPABASE_SERVICE_ROLE_KEY=<service-role-key-storage>
STORAGE_PUBLIC_BASE_URL=https://<storage-project>.supabase.co/storage/v1/object/public

# Batas dan TTL
EXTERNAL_API_MAX_SKEW_MS=300000
EXTERNAL_API_MAX_LIMIT=100
EXTERNAL_API_ACCESS_TOKEN_TTL_SECONDS=900
```

Catatan:

- `EXTERNAL_API_PUBLIC_URL` adalah dasar signature canonical dan URL yang
  muncul pada contoh header; bila diubah, OpenAPI yang disajikan di `/docs`
  ikut berganti.
- `SUBMISSION_DECISIONS_API_TOKEN` adalah shared secret **internal** antara
  facade External API dan backend SIGAP, bukan kredensial vendor. Vendor
  memakai `client_id`/`client_secret` mereka sendiri.
- `STORAGE_*` wajib memakai storage self-hosted (bukan bucket publik) agar
  file tetap melalui gateway SIGAP.

## 3. Autentikasi

Identik dengan staging:

1. `POST /api/access-token` mengembalikan access token singkat (default
   15 menit).
2. Setiap request data membawa `Authorization: Bearer <access_token>`,
   `X-Timestamp` (RFC3339), dan `X-Signature` (HMAC SHA-512 lowercase).
3. Canonical string: `METHOD:PATH_WITH_QUERY:ACCESS_TOKEN:BODY_SHA256:TIMESTAMP`.
4. Skew maksimum 5 menit; allowlist IP per client dapat diaktifkan.
5. Replay payload identik dengan `event_id` yang sama = idempotent; payload
   berbeda dengan `event_id` yang sama = HTTP 409.

## 4. Endpoint

Sama dengan staging:

```http
GET  /api/onboarding/options
GET  /api/master/offices?type=pusat|kc|kcp
GET  /api/master/departments?scope=pusat|cabang|all
GET  /api/surat
GET  /api/surat/:suratId
GET  /api/surat/:suratId/files/document
GET  /api/surat/:suratId/files/pdf
GET  /api/surat/:suratId/files/attachment?attachment_id=<id>
GET  /api/surat/:suratId/files/signature-pdf?signature_id=<id>
POST /api/access-token
POST /api/v1/submission-decisions
```

## 5. Prosedur Deployment

### 5.1 Persiapan

1. Pastikan image `agenda-flow-external-api:production` sudah di-build dan
   di-push ke registry internal yang dapat diakses dari `ubuntu-server`.
2. Verifikasi `EXTERNAL_API_PUBLIC_URL` dan `APP_PUBLIC_URL` cocok dengan
   sertifikat TLS yang aktif pada subdomain production.
3. Simpan `SUPABASE_SERVICE_ROLE_KEY` dan `SUBMISSION_DECISIONS_API_TOKEN`
   di secret manager host; **jangan** di-commit ke Git.

### 5.2 Menjalankan

```powershell
docker --context ubuntu-server compose -f docker-compose.external.yml --env-file .env.production up -d --build
```

### 5.3 Smoke Test Wajib

Jalankan dari workstation yang memiliki akses jaringan ke production:

```powershell
# 1. Health
curl.exe -fsSL https://external.marisoncloud.com/health

# 2. OpenAPI dapat diunduh dan valid
Invoke-WebRequest -Uri https://external.marisoncloud.com/openapi.json -OutFile openapi-prod.json
# Validasi minimal: ada path /api/access-token dan /api/v1/submission-decisions

# 3. Access token dapat diminta
$token = (Invoke-WebRequest -Uri https://external.marisoncloud.com/api/access-token `
    -Method POST -ContentType "application/json" `
    -Body '{"client_id":"smoke-test","client_secret":"..."}' `
    -UseBasicParsing).Content

# 4. /api/onboarding/options mengembalikan 200 dengan access token
# 5. /api/surat tanpa token mengembalikan 401
```

Setiap langkah harus lulus sebelum layanan dibuka untuk consumer.

## 6. Pemantauan

- Cek log container `agenda-flow-external-api` untuk error 5xx berulang.
- Pantau `/health` dari monitoring eksternal (wajib 200).
- Cross-check `SUPABASE_URL` dan `STORAGE_SUPABASE_URL` agar tidak
  tertukar dengan project staging.

## 7. Penarikan / Disable

Untuk menonaktifkan sementara tanpa menghapus image:

```powershell
docker --context ubuntu-server compose -f docker-compose.external.yml --env-file .env.production stop agenda-external-api
```

Data tidak terhapus; service hanya tidak menerima request baru. Jalankan
`up -d` lagi untuk mengaktifkan kembali.

Untuk menghapus permanen, hapus image dan baris service dari compose,
lalu audit seluruh consumer yang masih menyimpan `client_id` aktif.
Consumer yang masih hidup harus di-migrasi ke endpoint baru atau
dinonaktifkan kontraknya.

## 8. Perbedaan dengan Staging

| Aspek | Staging | Production |
| --- | --- | --- |
| Base URL | `external.marison-testing.biz.id` | `external.marisoncloud.com` |
| App URL referensi | `sigap.marison-testing.biz.id` | `sigap.marisoncloud.com` |
| Image tag | `agenda-flow-external-api:staging` | `agenda-flow-external-api:production` |
| Supabase project | `wrufczusfopgvwvxsmjk` | `xuhyodtmgwteyslhrkfx` |
| Klien kredensial | Data uji internal | Didaftarkan via `create-external-api-client.mjs` setelah production siap |
| OpenAPI vendor | Terkadang satu versi di belakang staging | Wajib versi terbaru sesuai kontrak final |

Seluruh perbedaan di atas **wajib** tercermin di `.env.production` dan
`docker-compose.external.yml` sebelum deploy.

## 9. TODO Sebelum Rilis Pertama

Item berikut harus diselesaikan sebelum URL production dapat diumumkan ke
konsumen:

- [ ] Tentukan subdomain final (saat ini placeholder:
      `external.marisoncloud.com`) dan perbarui dokumen ini.
- [ ] Konfirmasi sertifikat TLS untuk subdomain production sudah terpasang.
- [ ] Buat image `agenda-flow-external-api:production` di CI atau manual
      dari `main` setelah PR wizard rilis.
- [ ] Isi `.env.production` di `ubuntu-server` dengan nilai-nilai pada
      bagian 2.
- [ ] Daftarkan minimal satu `client_id`/`client_secret` untuk
      smoke-test menggunakan `node --env-file=.env.production
      scripts\create-external-api-client.mjs "smoke-test"`.
- [ ] Jalankan smoke test pada bagian 5.3.
- [ ] Dokumentasikan hasil smoke test di PR atau issue terpisah.
- [ ] Setelah lulus, umumkan URL ke konsumen dan hapus item TODO dari
      dokumen ini.
