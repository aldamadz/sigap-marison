# Staging Single-Account Fixtures — Snapshot & Cleanup Runbook (staging only)

> Jangan apply migration sebelum Tech Lead review. Jangan promosikan ke production.
> PR: #309. Issue: #308. Migration fixture: `20260919000000`.
> Tester: `system.tuyemaris@gmail.com` (boolean login verified, no secrets here).
> Dilarang membuat tabel backup di `public` atau schema lain.

## 1. Pre-apply snapshot (staging, read-only, tanpa secrets)

```sql
-- Canonical inventory (expect 8 + 1 template).
select name, request_category, scope_type, status, sort_order, is_system_template
from public.form_usages where status='active' order by sort_order, name;

select u.name, count(s.id) as steps
from public.form_usages u left join public.form_usage_steps s on s.usage_id=u.id
where u.status='active' group by u.name order by u.name;

-- Count/fingerprint sebelum apply (catat angkanya, bukan datanya).
select count(*) as usages_active from public.form_usages where status='active';
select count(*) as steps_total from public.form_usage_steps;
select count(*) as step_users from public.form_usage_step_users;
select count(*) as step_verifiers from public.form_usage_step_verifiers;
select count(*) as dept_links from public.form_usage_departments;
select count(*) as attachments from public.form_usage_attachment_requirements;
select md5(string_agg(name, '|' order by name)) as usage_fingerprint
from public.form_usages where status='active';

-- Tester readiness (booleans only).
select public.marison_payload_profile_source_valid('<tester-uuid>');
select public.marison_payload_office_source_valid('<tester-office-uuid>');
```

## 2. Backup custom-format sebelum apply (host staging Ubuntu, luar repository)

Jalankan dari host staging yang mempunyai konektivitas database. Gunakan
PostgreSQL 17 yang kompatibel. Kredensial hanya lewat libpq environment
(`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`) yang sudah terisi
dari secret staging. Jangan memberikan connection string/password di argumen
command, jangan mencetak environment, dan jangan mengaktifkan shell tracing.
Jika endpoint direct tetap gagal, gunakan koneksi pooler staging yang sudah
dikonfigurasi lewat environment yang sama, tanpa menampilkan URL/credential.

```bash
set -u
umask 077
stamp=$(date +%Y%m%d_%H%M%S)
dump="/root/staging_single_account_fixtures_preapply_${stamp}.dump"
pg_dump -Fc \
  -t public.form_usages \
  -t public.form_usage_steps \
  -t public.form_usage_step_users \
  -t public.form_usage_step_verifiers \
  -t public.form_usage_departments \
  -t public.form_usage_attachment_requirements \
  -f "$dump"
test -s "$dump"
stat -c %s "$dump"
sha256sum "$dump"
pg_restore --list "$dump" | wc -l
pg_restore --list "$dump"
```

Catat: ukuran file (`stat`), SHA-256 (`sha256sum`), jumlah object
(`pg_restore --list | wc -l`). Pastikan `test -s` lolos (dump tidak kosong).
Tidak ada tabel backup yang dibuat di database.

## 3. Migration inventory / dry-run (before apply)

Jalankan dari checkout yang linked ke project staging
(ref `wrufczusfopgvwvxsmjk`) dengan password database via environment.
Tanpa `--include-all`, tanpa repair, tanpa apply.

```bash
git fetch origin --prune
git rev-parse origin/staging
# Hanya migration berikut yang boleh pending:
git diff --name-only origin/staging...HEAD -- supabase/migrations
supabase migration list --linked
supabase db push --linked --dry-run
```

Timestamp `20260919000000` unik setelah `20260918130000`; verifikasi tidak ada
migration `20260919*` lain dari `origin/staging` sebelum apply.

## 4. Post-apply verify (staging)

Ulangi snapshot count/fingerprint section 1 dan bandingkan sebelum vs sesudah:

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
