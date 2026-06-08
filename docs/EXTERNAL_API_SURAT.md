# SIGAP External Surat API

API read-only untuk integrasi server-to-server agar sistem eksternal dapat membaca metadata surat, pengirim, tujuan, cabang, proyek, detail isi surat, tanda tangan, dan lampiran.

## URL

```txt
Base URL : https://external.marison-testing.biz.id/api
Docs     : https://external.marison-testing.biz.id/docs
OpenAPI  : https://external.marison-testing.biz.id/openapi.json
Health   : https://external.marison-testing.biz.id/health
```

## Authentication

### 1. Generate Access Token

```http
POST /api/access-token
Content-Type: application/json
```

```json
{
  "client_id": "...",
  "client_secret": "..."
}
```

Response:

```json
{
  "message": "Access token generated successfully",
  "data": {
    "access_token": "sigap_at_...",
    "token_type": "bearer",
    "expires_in": "900"
  }
}
```

Access token berlaku 15 menit. Simpan token dalam memory cache backend partner dan minta token baru setelah kedaluwarsa.

### 2. Sign Request Data

Setiap request data wajib membawa:

```http
Authorization: Bearer <access_token>
X-Timestamp: <RFC3339 timestamp>
X-Signature: <HMAC SHA-512 hex lowercase>
```

Gunakan access token sebagai HMAC key. Canonical string:

```txt
METHOD:PATH_WITH_QUERY:ACCESS_TOKEN:BODY_SHA256:TIMESTAMP
```

Contoh Node.js:

```js
import { createHash, createHmac } from "node:crypto";

const accessToken = "sigap_at_...";
const path = "/api/surat?limit=10&status=DONE";
const timestamp = new Date().toISOString();
const bodyHash = createHash("sha256").update("").digest("hex");
const canonical = ["GET", path, accessToken, bodyHash, timestamp].join(":");
const signature = createHmac("sha512", accessToken).update(canonical).digest("hex");

const response = await fetch(`https://external.marison-testing.biz.id${path}`, {
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "X-Timestamp": timestamp,
    "X-Signature": signature,
  },
});
```

Request ditolak jika timestamp berbeda lebih dari 5 menit dari waktu server. Allowlist IP dapat diaktifkan per client.

## Endpoints

```http
GET /api/surat
GET /api/surat/:suratId
GET /api/surat/:suratId/files/document
GET /api/surat/:suratId/files/pdf
GET /api/surat/:suratId/files/attachment?attachment_id=<id>
GET /api/surat/:suratId/files/signature-pdf?signature_id=<id>
```

Filter daftar surat:

| Parameter | Keterangan |
| --- | --- |
| `department_code` | Kode departemen |
| `office_code` | Kode cabang atau kantor |
| `project_code` | Kode proyek |
| `status` | Status surat |
| `updated_since` | Timestamp perubahan minimum |
| `limit` | Default `50`, maksimum `100` |
| `cursor` | Cursor response sebelumnya |

File di-stream melalui gateway SIGAP dengan `Cache-Control: no-store`. URL Supabase tidak diberikan langsung kepada partner.

SIGAP berhenti pada approval akhir. SPK, bukti pembayaran, dan proses operasional lanjutan menjadi tanggung jawab sistem departemen.

## Create Client Credential

Jalankan dari environment operator yang memiliki service role Supabase cloud:

```powershell
node --env-file=.env.production scripts\create-external-api-client.mjs "nama-client" 203.0.113.10
```

IP opsional. Hilangkan argumen IP jika partner belum memiliki IP statis.

Output `client_id` dan `client_secret` hanya tampil sekali. Simpan di secret manager partner. Secret asli tidak disimpan di database.

## Deployment

External API berjalan sebagai container terpisah:

```powershell
docker --context ubuntu-server compose -f docker-compose.external.yml --env-file .env.production up -d --build
```

App utama dan PDF worker tidak perlu diredeploy jika perubahan hanya menyentuh folder `external-api/`.
