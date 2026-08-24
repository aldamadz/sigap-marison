# Staging Migration Reconciliation

Runbook ini digunakan ketika migration lokal dan riwayat Supabase staging tidak
selaras. Prosedur ini tidak memberi izin untuk mengakses atau mengubah production.

## Guardrails

1. Gunakan issue dan branch khusus dengan target `staging`.
2. Hentikan migration/deployment staging lain selama audit berlangsung.
3. Gunakan connection string yang secara eksplisit berasal dari secret staging.
4. Verifikasi project reference staging sebelum setiap command remote.
5. Jangan gunakan `--include-all`, bulk repair, atau mengedit migration lama.
6. Jangan menampilkan DB URL, password, token, atau output yang mengandung secret.
7. Sebelum write apa pun, siapkan backup staging yang dapat dipulihkan dan minta peer review.

## 1. Local Inventory

Jalankan tanpa credential:

```powershell
npm test -- --run src/test/migration-history.test.ts
git status --short --branch
git log --oneline -10
```

Catat commit candidate, filename, timestamp, dan checksum setiap migration. Audit
staging saat ini mengharapkan satu file untuk versi `20260707113000`:
`20260707113000_save_surat_verification_draft.sql`.

File historis `20260707113000_store_recommendation_decisions_on_parent.sql`
sudah dikeluarkan dari lineage staging karena memakai timestamp yang sama. Jangan
memulihkannya dengan timestamp baru secara buta; function yang sama sudah memiliki
definisi lebih baru di `20260707124500_reopen_recommendation_revision_flow.sql`.

## 2. Verify Staging Identity

Gunakan variable yang namanya eksplisit staging dan jangan memakai linked project
yang belum diverifikasi:

```powershell
npx supabase migration list --db-url $env:STAGING_DB_URL
```

Hentikan proses jika host/project tidak sama dengan project staging yang tercatat
di `docs/FEATURE_RELEASE_MAP.md`, target tidak dapat dibuktikan, atau ditemukan
version remote yang tidak dikenal.

## 3. Capture Remote History

Lakukan read-only inventory pada `supabase_migrations.schema_migrations`. Catat:

- version lokal dan remote;
- version local-only atau remote-only;
- nama migration remote bila column tersebut tersedia;
- keberadaan version `20260707113000`.

Jangan menyimpulkan SQL tertentu sudah berjalan hanya dari keberadaan version.
Satu version historis pernah dipakai oleh dua file berbeda.

## 4. Verify Schema Effects

Bandingkan catalog dan `pg_get_functiondef` secara read-only untuk:

- `public.save_surat_verification_draft(uuid,jsonb,text)`;
- `public.complete_recommendation_task(uuid,uuid)`.

Verifikasi owner, security mode, `search_path`, dan grants. Definisi
`complete_recommendation_task` harus sesuai migration retained terbaru, bukan body
file duplicate yang sudah dihapus.

## 5. Dry Run

Setelah history dan object dipahami:

```powershell
npx supabase db push --db-url $env:STAGING_DB_URL --dry-run
```

Jangan tambahkan `--include-all`. Hentikan jika CLI meminta replay migration lama,
menemukan remote-only version, atau rencana tidak hanya memuat migration baru yang
sudah direview.

## Decision Matrix

| Kondisi | Tindakan |
| --- | --- |
| History memuat version dan schema sesuai | Tidak ada write; dokumentasikan bukti |
| History memuat version tetapi object hilang/stale | Buat migration forward-only bertimestamp baru untuk desired state |
| History tidak memuat version tetapi seluruh desired state sudah ada | Pertimbangkan satu repair metadata hanya setelah backup, bukti schema, dan peer approval |
| History tidak memuat version dan desired state belum lengkap | Jangan repair applied; buat migration forward-only |
| Ada drift lain atau provenance tidak jelas | Hentikan; audit setiap version satu per satu |

`migration repair --status applied` hanya mengubah metadata history. Command itu
tidak membuat schema yang hilang dan tidak boleh dipakai hanya untuk membuat CLI
hijau.

## Post-Write Verification

Jika write staging sudah disetujui:

1. Jalankan ulang migration list dan query history.
2. Jalankan dry run tanpa `--include-all`; tidak boleh ada rencana tak dikenal.
3. Bandingkan ulang function definitions, owner, grants, dan policies.
4. Uji save verification draft dan complete recommendation task di staging.
5. Jalankan quality gate aplikasi dan smoke test domain staging.
6. Lampirkan bukti yang sudah disanitasi ke issue/PR.

Production memerlukan audit history dan persetujuan release production tersendiri.
