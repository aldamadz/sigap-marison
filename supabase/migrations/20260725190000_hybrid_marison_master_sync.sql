alter table public.master_offices
  add column if not exists marison_last_seen_at timestamptz,
  add column if not exists marison_hierarchy_confirmed boolean not null default true,
  add column if not exists marison_review_required boolean not null default false,
  add column if not exists marison_review_reasons text[] not null default '{}'::text[];

alter table public.profiles
  add column if not exists marison_last_seen_at timestamptz,
  add column if not exists marison_review_required boolean not null default false,
  add column if not exists marison_review_reasons text[] not null default '{}'::text[];

create table if not exists public.marison_sync_runs (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('staging', 'production')),
  trigger_type text not null check (trigger_type in ('manual', 'cron')),
  scope text not null check (scope in ('branches', 'directory')),
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  error_message text,
  initiated_by uuid
);

create unique index if not exists marison_sync_runs_one_active_uidx
  on public.marison_sync_runs (environment)
  where status = 'running';

create index if not exists marison_sync_runs_started_idx
  on public.marison_sync_runs (started_at desc);

create table if not exists public.marison_sync_issues (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('staging', 'production')),
  entity_type text not null check (entity_type in ('branch', 'employee')),
  external_id text not null,
  reason text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);

create unique index if not exists marison_sync_issues_open_uidx
  on public.marison_sync_issues (environment, entity_type, external_id)
  where status = 'open';

create index if not exists marison_sync_issues_status_idx
  on public.marison_sync_issues (status, entity_type, last_seen_at desc);

alter table public.marison_sync_runs enable row level security;
alter table public.marison_sync_issues enable row level security;

drop policy if exists marison_sync_runs_admin_select on public.marison_sync_runs;
create policy marison_sync_runs_admin_select
on public.marison_sync_runs for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role::text, '')) in ('admin', 'super_admin')
  )
);

drop policy if exists marison_sync_issues_admin_select on public.marison_sync_issues;
create policy marison_sync_issues_admin_select
on public.marison_sync_issues for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role::text, '')) in ('admin', 'super_admin')
  )
);

drop policy if exists marison_sync_issues_admin_update on public.marison_sync_issues;
create policy marison_sync_issues_admin_update
on public.marison_sync_issues for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role::text, '')) in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role::text, '')) in ('admin', 'super_admin')
  )
);

drop policy if exists master_offices_admin_insert on public.master_offices;
create policy master_offices_admin_insert
on public.master_offices for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role::text, '')) in ('admin', 'super_admin')
  )
);

drop policy if exists master_offices_admin_update on public.master_offices;
create policy master_offices_admin_update
on public.master_offices for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role::text, '')) in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role::text, '')) in ('admin', 'super_admin')
  )
);

comment on table public.master_offices is
  'Master kantor SIGAP dengan UUID lokal; data external dipetakan melalui marison_branch_id dan tetap dapat dilengkapi admin.';

create or replace function public.refresh_marison_office_review()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_reasons text[] := '{}'::text[];
begin
  if new.marison_branch_id is null then
    new.marison_review_required := false;
    new.marison_review_reasons := '{}'::text[];
    return new;
  end if;

  if nullif(btrim(coalesce(new.code, '')), '') is null then
    v_reasons := array_append(v_reasons, 'Kode kantor belum diisi');
  end if;
  if nullif(btrim(coalesce(new.name, '')), '') is null then
    v_reasons := array_append(v_reasons, 'Nama kantor belum diisi');
  end if;
  if coalesce(new.kedudukan, '') not in ('Pusat', 'KC', 'KCP', 'Kost') then
    v_reasons := array_append(v_reasons, 'Kedudukan kantor belum valid');
  end if;
  if new.kedudukan in ('KCP', 'Kost') and new.parent_id is null then
    v_reasons := array_append(v_reasons, 'Kantor induk belum dipilih');
  end if;
  if not coalesce(new.marison_hierarchy_confirmed, false) then
    v_reasons := array_append(v_reasons, 'Hirarki hasil deteksi nama belum dikonfirmasi');
  end if;

  new.marison_review_reasons := v_reasons;
  new.marison_review_required := cardinality(v_reasons) > 0;
  return new;
end;
$$;

drop trigger if exists refresh_marison_office_review_trg on public.master_offices;
create trigger refresh_marison_office_review_trg
before insert or update of code, name, kedudukan, parent_id, marison_branch_id, marison_hierarchy_confirmed
on public.master_offices
for each row execute function public.refresh_marison_office_review();

create or replace function public.refresh_marison_profile_review()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_reasons text[] := '{}'::text[];
begin
  if new.marison_employee_id is null then
    new.marison_review_required := false;
    new.marison_review_reasons := '{}'::text[];
    return new;
  end if;

  if nullif(btrim(coalesce(new.full_name, '')), '') is null then
    v_reasons := array_append(v_reasons, 'Nama belum diisi');
  end if;
  if nullif(btrim(coalesce(new.nik, '')), '') is null or new.nik like 'EXT-%' then
    v_reasons := array_append(v_reasons, 'NIK belum diisi');
  end if;
  if nullif(btrim(coalesce(new.email, '')), '') is null
     or new.email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or new.email like '%@staging.test'
     or new.email like '%@invalid.local' then
    v_reasons := array_append(v_reasons, 'Email belum valid');
  elsif exists (
    select 1 from public.profiles p
    where lower(p.email) = lower(new.email)
      and p.id <> new.id
      and p.deleted_at is null
  ) then
    v_reasons := array_append(v_reasons, 'Email digunakan user lain');
  end if;
  if new.office_id is null then
    v_reasons := array_append(v_reasons, 'Kantor belum dipetakan');
  end if;
  if new.department_id is null then
    v_reasons := array_append(v_reasons, 'Departemen belum dipetakan');
  end if;
  if nullif(btrim(coalesce(new.job_title, '')), '') is null or new.job_title = 'Karyawan' then
    v_reasons := array_append(v_reasons, 'Jabatan belum dilengkapi');
  end if;
  if new.join_date is null then
    v_reasons := array_append(v_reasons, 'Tanggal masuk belum diisi');
  end if;

  new.marison_review_reasons := v_reasons;
  new.marison_review_required := cardinality(v_reasons) > 0;
  return new;
end;
$$;

drop trigger if exists refresh_marison_profile_review_trg on public.profiles;
create trigger refresh_marison_profile_review_trg
before insert or update of full_name, nik, email, office_id, department_id, job_title, join_date, marison_employee_id
on public.profiles
for each row execute function public.refresh_marison_profile_review();

update public.master_offices
set marison_hierarchy_confirmed = false
where marison_branch_id is not null;

update public.master_offices set code = code where marison_branch_id is not null;
update public.profiles set full_name = full_name where marison_employee_id is not null;

drop function if exists public.get_attention_state_for_user(uuid);
create function public.get_attention_state_for_user(p_user_id uuid)
returns table (
  approval_count bigint,
  verification_count bigint,
  revision_count bigint,
  recommendation_count bigint,
  unread_notifications bigint,
  monitoring_count bigint,
  follow_up_count bigint,
  master_office_review_count bigint,
  profile_review_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (
      select count(*)
      from public.surat_signatures ss
      join public.surat_registrasi sr on sr.id = ss.surat_id
      where ss.user_id = p_user_id
        and not coalesce(ss.is_signed, false)
        and sr.status = 'PROSES'
        and ss.step_order = sr.current_step
    )::bigint,
    (
      select count(*)
      from public.surat_signatures ss
      join public.surat_registrasi sr on sr.id = ss.surat_id
      where not coalesce(ss.is_signed, false)
        and ss.verification_required = true
        and ss.verification_status = 'pending'
        and ss.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', p_user_id::text))
        and sr.status = 'PROSES'
        and ss.step_order = sr.current_step
    )::bigint,
    (
      select count(*)
      from public.surat_revision_events sre
      where sre.status in ('open', 'awaiting_requester')
        and p_user_id = any(sre.target_user_ids)
        and sre.target_type is distinct from 'requester'
    )::bigint,
    (
      select count(*)
      from public.surat_recommendation_tasks srt
      where srt.status in ('waiting', 'claimed')
        and srt.candidate_snapshot @> jsonb_build_array(jsonb_build_object('user_id', p_user_id::text))
        and (srt.status = 'waiting' or srt.claimed_by = p_user_id)
    )::bigint,
    (
      select count(*)
      from public.notifications n
      where n.user_id = p_user_id and n.is_read is not true
    )::bigint,
    (
      select count(*)
      from public.surat_registrasi sr
      where sr.created_by = p_user_id
        and sr.status = 'DONE'
        and (sr.creator_seen_at is null or sr.updated_at > sr.creator_seen_at)
    )::bigint,
    (
      select count(*)
      from public.surat_revision_events sre
      where sre.status in ('open', 'awaiting_requester')
        and p_user_id = any(sre.target_user_ids)
        and sre.target_type = 'requester'
    )::bigint,
    (
      select
        (select count(*) from public.master_offices o where o.marison_review_required)
        + (select count(*) from public.marison_sync_issues i where i.status = 'open' and i.entity_type = 'branch')
      where exists (
        select 1 from public.profiles p
        where p.id = p_user_id
          and lower(coalesce(p.role::text, '')) in ('admin', 'super_admin')
      )
    )::bigint,
    (
      select
        (select count(*) from public.profiles p where p.marison_review_required and p.deleted_at is null)
        + (select count(*) from public.marison_sync_issues i where i.status = 'open' and i.entity_type = 'employee')
      where exists (
        select 1 from public.profiles p
        where p.id = p_user_id
          and lower(coalesce(p.role::text, '')) in ('admin', 'super_admin')
      )
    )::bigint;
$$;

revoke all on function public.get_attention_state_for_user(uuid) from public;
revoke all on function public.get_attention_state_for_user(uuid) from anon;
revoke all on function public.get_attention_state_for_user(uuid) from authenticated;
grant execute on function public.get_attention_state_for_user(uuid) to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'master_offices'
    ) then
      alter publication supabase_realtime add table public.master_offices;
    end if;
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'profiles'
    ) then
      alter publication supabase_realtime add table public.profiles;
    end if;
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'marison_sync_issues'
    ) then
      alter publication supabase_realtime add table public.marison_sync_issues;
    end if;
  end if;
end;
$$;
