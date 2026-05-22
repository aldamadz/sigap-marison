# SIGAP External Surat API

Dokumentasi ini untuk integrasi server-to-server agar sistem eksternal dapat membaca data surat, metadata pengirim, tujuan/cabang/proyek/departemen, detail isi surat, tanda tangan, lampiran, SPK, dan bukti transaksi.

API ini tidak menggunakan endpoint Supabase langsung. Semua akses lewat gateway eksternal SIGAP.

## Base URL

```txt
https://external.marison-testing.biz.id
```

Untuk environment lain, ganti base URL sesuai domain deployment.

Dokumentasi interaktif publik tersedia di:

```txt
https://external.marison-testing.biz.id/docs
```

OpenAPI JSON tersedia di:

```txt
https://external.marison-testing.biz.id/openapi.json
```

## Authentication

Setiap request wajib membawa tiga header:

```http
Authorization: Bearer <token>
X-Timestamp: <timestamp>
X-Signature: <signature>
```

Keterangan:

| Header | Wajib | Isi |
| --- | --- | --- |
| `Authorization` | Ya | Token client API eksternal dalam format `Bearer <token>` |
| `X-Timestamp` | Ya | Unix milliseconds, Unix seconds, atau ISO timestamp |
| `X-Signature` | Ya | HMAC-SHA256 hex dari canonical request |

Request ditolak jika timestamp berbeda lebih dari 5 menit dari waktu server.

### Canonical String

Signature dibuat dari string berikut:

```txt
METHOD
PATH_WITH_QUERY
X_TIMESTAMP
SHA256_HEX_BODY
```

Contoh untuk request:

```http
GET /api/surat?limit=10&status=DONE
X-Timestamp: 1779446400000
```

Body kosong memiliki SHA256:

```txt
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

Canonical string:

```txt
GET
/api/surat?limit=10&status=DONE
1779446400000
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

Signature:

```txt
hex(hmac_sha256(client_secret, canonical_string))
```

## JavaScript Signing Example

```js
import crypto from "node:crypto";

const baseUrl = "https://external.marison-testing.biz.id";
const token = "sigap_xxx";
const secret = "client_hmac_secret";

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sign({ method, pathWithQuery, body = "" }) {
  const timestamp = String(Date.now());
  const bodyHash = sha256Hex(body);
  const canonical = [
    method.toUpperCase(),
    pathWithQuery,
    timestamp,
    bodyHash,
  ].join("\n");

  const signature = crypto
    .createHmac("sha256", secret)
    .update(canonical)
    .digest("hex");

  return {
    Authorization: `Bearer ${token}`,
    "X-Timestamp": timestamp,
    "X-Signature": signature,
  };
}

const path = "/api/surat?limit=10&status=DONE";
const response = await fetch(`${baseUrl}${path}`, {
  method: "GET",
  headers: sign({ method: "GET", pathWithQuery: path }),
});

const json = await response.json();
console.log(json);
```

## Endpoints

### List Surat

```http
GET /api/surat
```

Query parameters:

| Param | Deskripsi |
| --- | --- |
| `department_code` | Filter kode departemen |
| `office_code` | Filter kode cabang/kantor |
| `project_code` | Filter kode proyek |
| `status` | Filter status surat |
| `updated_since` | Ambil data yang berubah sejak timestamp tertentu |
| `limit` | Jumlah data, default `50`, maksimum `100` |
| `cursor` | Cursor pagination dari response sebelumnya |

Contoh:

```http
GET /api/surat?department_code=PGD&updated_since=2026-05-01T00:00:00Z&limit=50
```

Response:

```json
{
  "data": [
    {
      "id": "dc408c7c-1490-40f8-8163-85f0bba6cafd",
      "no_surat": "001/UAI/PGD/V/2026",
      "judul_surat": "Pengajuan Barang",
      "status": "DONE",
      "pic_review_status": "SPK",
      "request_place": "Magelang",
      "request_date": "2026-05-21",
      "request_place_date": "Magelang, 21 Mei 2026",
      "requester_nik": "123456",
      "requester_name": "Nama Pengirim",
      "department_code": "PGD",
      "department_name": "Pengadaan",
      "office_code": "MGL",
      "office_name": "Magelang",
      "project_code": null,
      "project_name": null,
      "form_input_data": {
        "items": []
      },
      "detail_barang": [],
      "signatures": [],
      "attachments": [],
      "finance_reviews": [],
      "files": [
        {
          "type": "pdf",
          "file_name": "dokumen.pdf",
          "view_url": "/api/surat/dc408c7c-1490-40f8-8163-85f0bba6cafd/files/pdf"
        }
      ]
    }
  ],
  "page": {
    "limit": 50,
    "count": 1,
    "total": 1,
    "next_cursor": null
  }
}
```

### Detail Surat

```http
GET /api/surat/:id
```

Contoh:

```http
GET /api/surat/dc408c7c-1490-40f8-8163-85f0bba6cafd
```

Response:

```json
{
  "data": {
    "id": "dc408c7c-1490-40f8-8163-85f0bba6cafd",
    "no_surat": "001/UAI/PGD/V/2026",
    "judul_surat": "Pengajuan Barang",
    "data_snapshot": {},
    "form_input_data": {},
    "signatures": [],
    "attachments": [],
    "finance_reviews": [],
    "files": []
  }
}
```

### File Preview / Download

File tidak diberikan sebagai URL Supabase. Response data menyediakan `view_url`, lalu sistem eksternal memanggil URL itu dengan header auth/signature yang sama.

```http
GET /api/surat/:id/files/document
GET /api/surat/:id/files/pdf
GET /api/surat/:id/files/spk
GET /api/surat/:id/files/attachment?attachment_id=<id>
GET /api/surat/:id/files/signature-pdf?signature_id=<id>
GET /api/surat/:id/files/payment?finance_review_id=<id>
```

Contoh:

```http
GET /api/surat/dc408c7c-1490-40f8-8163-85f0bba6cafd/files/attachment?attachment_id=0fd0...
```

Response sukses berupa stream file dengan header:

```http
Content-Type: application/pdf
Content-Disposition: inline; filename="dokumen.pdf"
Cache-Control: no-store
```

## Error Response

```json
{
  "error": "Unauthorized"
}
```

Kode umum:

| Status | Arti |
| --- | --- |
| `200` | Berhasil |
| `401` | Token, timestamp, atau signature tidak valid |
| `403` | IP tidak diizinkan |
| `404` | Endpoint, surat, atau file tidak ditemukan |
| `413` | Request body terlalu besar |
| `500` | Error server |

## Creating API Client Credentials

Jalankan dari server/operator environment yang memiliki `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY`.

```powershell
$env:SUPABASE_URL="https://xuhyodtmgwteyslhrkfx.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
node scripts\create-external-api-client.mjs "nama-client" 203.0.113.10
```

Output:

```json
{
  "client": {
    "id": "...",
    "name": "nama-client",
    "allowed_ips": ["203.0.113.10"],
    "created_at": "2026-05-22T00:00:00.000Z"
  },
  "authorization": "Bearer sigap_xxx",
  "hmac_secret": "xxx",
  "note": "Simpan token dan hmac_secret sekarang. Token asli tidak disimpan di database."
}
```

Token asli hanya tampil sekali. Simpan di secret manager milik partner dan SIGAP operator.

## Integration Notes

- API ini ditujukan untuk backend-to-backend, bukan dipanggil langsung dari browser.
- Endpoint `/docs` dan `/openapi.json` publik, tetapi semua endpoint `/api/*` wajib memakai token, timestamp, dan signature.
- Partner boleh melakukan filtering lanjutan di sistem mereka sendiri.
- Gunakan `updated_since` untuk sinkronisasi berkala.
- Gunakan `next_cursor` sampai bernilai `null`.
- Jangan cache file karena endpoint file memakai `Cache-Control: no-store`.
- Semua akses API dicatat di `external_api_audit_logs`.

## Deployment

Gateway eksternal adalah service Docker terpisah dari aplikasi SIGAP utama.

```powershell
docker --context ubuntu-server compose -f docker-compose.external.yml --env-file .env.production up -d --build
```

Pastikan `.env.production` berisi:

```txt
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
EXTERNAL_API_PUBLIC_URL=https://external.marison-testing.biz.id
EXTERNAL_API_PORT=3020
```

Arahkan reverse proxy atau Cloudflare Tunnel `external.marison-testing.biz.id` ke port `3020` di server deployment.
