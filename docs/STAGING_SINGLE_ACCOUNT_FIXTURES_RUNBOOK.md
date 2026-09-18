# Staging Single-Account Fixtures — Snapshot & Cleanup Runbook (staging only)

> Jangan apply migration sebelum Tech Lead review. Jangan promosikan ke production.
> PR: #309. Issue: #308. Migration fixture: `20260919000000`.
> Tester: `system.tuyemaris@gmail.com` (boolean login verified, no secrets here).

## 1. Pre-apply snapshot (staging, read-only)

```sql
-- Canonical inventory (expect 8 + 1 template).
select name, request_category, scope_type, status, sort_order, is_system_template
from public.form_usages where status='active' order by sort_order, name;

select u.name, count(s.id) as steps
from public.form_usages u left join public.form_usage_steps s on s.usage_id=u.id
where u.status='active' group by u.name order by u.name;

-- Tester readiness (booleans only).
select public.marison_payload_profile_source_valid('<tester-uuid>');
select public.marison_payload_office_source_valid('<tester-office-uuid>');
```

Backup config tables (staging backup tool, contoh):

```sql
create table public._backup_form_usages_20260919 as table public.form_usages;
create table public._backup_form_usage_steps_20260919 as table public.form_usage_steps;
create table public._backup_form_usage_step_users_20260919 as table public.form_usage_step_users;
create table public._backup_form_usage_step_verifiers_20260919 as table public.form_usage_step_verifiers;
create table public._backup_form_usage_departments_20260919 as table public.form_usage_departments;
create table public._backup_form_usage_attachments_20260919 as table public.form_usage_attachment_requirements;
```

## 2. Migration inventory / dry-run (before apply)

```powershell
git fetch origin --prune
git rev-parse origin/staging
# Hanya migration berikut yang boleh pending:
git diff --name-only origin/staging...HEAD -- supabase/migrations
npx supabase migration list --db-url $env:STAGING_DB_URL
npx supabase db push --db-url $env:STAGING_DB_URL --dry-run
# Jangan gunakan --include-all atau repair. Jangan apply.
```

Timestamp `20260919000000` unik setelah `20260918130000`; verifikasi tidak ada
migration `20260919*` lain dari `origin/staging` sebelum apply.

## 3. Apply (hanya setelah approval eksplisit)

Apply via pipeline/migration staging yang disetujui, bukan via file test ad hoc.
Jangan deploy app, jangan restart worker, jangan vendor POST, jangan buat surat nyata.

## 4. Post-apply verify (staging)

```sql
-- 9 canonical tidak berubah (8 + 1 template, tanpa prefix).
select count(*) from public.form_usages
where status='active' and name not like '[UJI STAGING]%';
-- 9 fixture aktif dengan prefix dan deskripsi akun uji.
select name from public.form_usages
where status='active' and name like '[UJI STAGING]%' order by name;
select count(*) from public.form_usages
where status='active' and name like '[UJI STAGING]%'
  and description ilike '%system.tuyemaris@gmail.com%';
-- Semua select/verifier fixture hanya tester (ganti <tester-uuid>).
select count(*) from public.form_usage_step_users u
join public.form_usage_steps s on s.id=u.usage_step_id
join public.form_usages f on f.id=s.usage_id
where f.name like '[UJI STAGING]%' and u.user_id <> '<tester-uuid>';
```

Tester manusia kemudian submit dari fixture; setiap inbox tahap harus kembali ke tester.

## 5. Cleanup (setelah testing selesai)

Jangan menjalankan `supabase/tests/staging_single_account_fixtures_removal.sql`
secara ad hoc. Buat migration forward-only baru dengan timestamp unik berisi
body file tersebut, review, lalu apply ke staging only:

```sql
update public.form_usages set status='archived', updated_at=clock_timestamp()
where name like '[UJI STAGING]%' and status='active';
```

Verifikasi canonical 9 tetap active dan fixture 0 active. Jangan promosikan
fixture maupun cleanup ke production.
