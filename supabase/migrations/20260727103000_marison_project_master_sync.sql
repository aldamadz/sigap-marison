alter table public.master_projects
  add column if not exists marison_project_id bigint,
  add column if not exists marison_project_code text,
  add column if not exists marison_synced_at timestamptz,
  add column if not exists marison_last_seen_at timestamptz,
  add column if not exists marison_review_required boolean not null default false,
  add column if not exists marison_review_reasons text[] not null default '{}'::text[];

create unique index if not exists master_projects_marison_project_id_uidx
  on public.master_projects (marison_project_id)
  where marison_project_id is not null;

create index if not exists master_projects_office_idx
  on public.master_projects (office_id);

alter table public.marison_sync_runs
  drop constraint if exists marison_sync_runs_scope_check;

alter table public.marison_sync_runs
  add constraint marison_sync_runs_scope_check
  check (scope in ('branches', 'directory', 'projects'));

alter table public.marison_sync_issues
  drop constraint if exists marison_sync_issues_entity_type_check;

alter table public.marison_sync_issues
  add constraint marison_sync_issues_entity_type_check
  check (entity_type in ('branch', 'employee', 'project'));

drop policy if exists master_projects_admin_insert on public.master_projects;
create policy master_projects_admin_insert
on public.master_projects for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role::text, '')) in ('admin', 'super_admin')
  )
);

drop policy if exists master_projects_admin_update on public.master_projects;
create policy master_projects_admin_update
on public.master_projects for update
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

create or replace function public.refresh_marison_project_review()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_reasons text[] := '{}'::text[];
begin
  if new.marison_project_id is null then
    new.marison_review_required := false;
    new.marison_review_reasons := '{}'::text[];
    return new;
  end if;

  if 'Branch proyek external belum tersedia' = any(coalesce(new.marison_review_reasons, '{}'::text[])) then
    v_reasons := array_append(v_reasons, 'Branch proyek external belum tersedia');
  end if;

  if nullif(btrim(coalesce(new.code, '')), '') is null then
    v_reasons := array_append(v_reasons, 'Kode proyek belum diisi');
  end if;
  if nullif(btrim(coalesce(new.name, '')), '') is null then
    v_reasons := array_append(v_reasons, 'Nama proyek belum diisi');
  end if;
  if new.office_id is null then
    v_reasons := array_append(v_reasons, 'Kantor proyek belum dipetakan');
  elsif not exists (
    select 1
    from public.master_offices o
    where o.id = new.office_id
      and o.marison_branch_id is not null
  ) then
    v_reasons := array_append(v_reasons, 'Kantor proyek belum memiliki ID branch external');
  end if;

  new.marison_review_reasons := v_reasons;
  new.marison_review_required := cardinality(v_reasons) > 0;
  return new;
end;
$$;

drop trigger if exists refresh_marison_project_review_trg on public.master_projects;
create trigger refresh_marison_project_review_trg
before insert or update of code, name, office_id, marison_project_id
on public.master_projects
for each row execute function public.refresh_marison_project_review();

comment on table public.master_projects is
  'Master proyek SIGAP dengan UUID lokal; data external dipetakan melalui marison_project_id dan tetap dapat dilengkapi admin.';

update public.master_projects
set code = code
where marison_project_id is not null;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'master_projects'
    ) then
      alter publication supabase_realtime add table public.master_projects;
    end if;
  end if;
end;
$$;
