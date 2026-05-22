# SIGAP External API Gateway

Gateway ini berjalan terpisah dari aplikasi SIGAP utama untuk domain:

```txt
https://external.marison-testing.biz.id
```

Endpoint publik:

- `GET /docs`
- `GET /openapi.json`
- `GET /health`

Endpoint API:

- `GET /api/surat`
- `GET /api/surat/:id`
- `GET /api/surat/:id/files/:fileType`

Semua endpoint `/api/*` wajib memakai:

```http
Authorization: Bearer <token>
X-Timestamp: <timestamp>
X-Signature: <signature>
```

Deployment:

```powershell
docker --context ubuntu-server compose -f docker-compose.external.yml --env-file .env.production up -d --build
```

Environment wajib:

```txt
SUPABASE_URL=https://xuhyodtmgwteyslhrkfx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
EXTERNAL_API_PUBLIC_URL=https://external.marison-testing.biz.id
```
