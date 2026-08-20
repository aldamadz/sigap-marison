# SIGAP CI/CD

Dokumen ini menjelaskan pipeline CI/CD yang diterapkan di repository SIGAP.

## Branch Strategy

| Branch | Peran | Deployment |
|--------|-------|------------|
| `main` | Production source | Manual deploy via GitHub Actions |
| `staging` | Staging source | Auto-deploy ke `sigap.marison-testing.biz.id` |
| `feature/*`, `fix/*` | Pengembangan fitur/perbaikan | Tidak auto-deploy; CI quality check saja |

## Workflow GitHub Actions

### 1. CI (`ci.yml`)

- **Trigger**: Push/PR ke `main` dan `staging`
- **Jobs**: `npm ci`, `npm run quality:ci` (lint + typecheck + test + build, tanpa test SQL berbasis docker), `npm audit`
- **Tujuan**: Pastikan kode yang masuk staging/main lolos quality gate sebelum di-deploy
- Test SQL berbasis docker (`test:*sql`) tidak dijalankan di runner; jalankan `npm run quality` secara lokal untuk cakupan penuh

### 2. Deploy Staging (`deploy-staging.yml`)

- **Trigger**: Push ke branch `staging` setelah CI passing
- **Proses**:
  1. Checkout kode
  2. Setup Node.js dan install dependency
  3. Bangun Docker image dengan build arg `VITE_APP_PUBLIC_URL=https://sigap.marison-testing.biz.id`
  4. Konfigurasi Docker context SSH ke server `ubuntu-server`
  5. Buat file `.env.staging` dari secret GitHub
  6. Deploy dengan `docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --build`
  7. Smoke test ke `https://sigap.marison-testing.biz.id/health/ready`

### 3. Deploy Production (`deploy-production.yml`)

- **Trigger**: Manual (`workflow_dispatch`) dari branch `main`
- **Proses**: Sama seperti staging, tetapi:
  1. Build arg `VITE_APP_PUBLIC_URL=https://sigap.marisoncloud.com`
  2. Gunakan `docker-compose.prod.yml` dan `.env.production`
  3. Target deployment `agenda-flow-prod` di server
  4. Smoke test ke `https://sigap.marisoncloud.com/health/ready`

## Required Secrets

| Secret | Deskripsi | Contoh |
|--------|-----------|--------|
| `SSH_PRIVATE_KEY` | Private key SSH untuk akses server | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `SSH_HOST` | Hostname atau IP server | `ubuntu-server` atau `10.10.10.246` |
| `SSH_USER` | Username SSH | `root` atau `ubuntu` |
| `SSH_PORT` | Port SSH (opsional) | `22` |
| `STAGING_ENV_FILE` | Isi lengkap `.env.staging` | `SUPABASE_URL=...\nVITE_SUPABASE_URL=...` |
| `PRODUCTION_ENV_FILE` | Isi lengkap `.env.production` | `SUPABASE_URL=...\nVITE_SUPABASE_URL=...` |

## Alur Rilis

```
feature/* atau fix/*
    │
    ▼
PR ke staging ──► CI quality check ──► Auto-deploy staging ──► Smoke test staging
    │
    ▼ (setelah staging aman)
PR ke main ──► CI quality check
    │
    ▼ (ketika kamu katakan "rilis production")
workflow_dispatch production deploy ──► Smoke test production
    │
    ▼
Sinkronkan main ke staging agar kedua branch tidak menyimpang
```

## Catatan

- `.env.*` tidak boleh di-commit ke repository
- Deployment menggunakan Docker context SSH; build terjadi di server
- Setelah deployment, lakukan smoke test terhadap domain yang benar
- Jika deployment gagal, rollback dengan menjalankan ulang image sebelumnya di server