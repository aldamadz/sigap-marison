create table if not exists public.document_template_builders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  owner_department_id uuid references public.master_departments(id) on delete set null,
  active_version_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_template_builders_name_len check (char_length(name) between 3 and 120),
  constraint document_template_builders_slug_len check (char_length(slug) between 3 and 140),
  constraint document_template_builders_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists public.document_template_builder_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.document_template_builders(id) on delete cascade,
  version_number integer not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  definition jsonb not null default '{}'::jsonb,
  input_schema jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint document_template_builder_versions_unique unique (template_id, version_number),
  constraint document_template_builder_versions_definition_object check (jsonb_typeof(definition) = 'object'),
  constraint document_template_builder_versions_schema_object check (jsonb_typeof(input_schema) = 'object')
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'document_template_builders_active_version_fk'
  ) then
    alter table public.document_template_builders
      add constraint document_template_builders_active_version_fk
      foreign key (active_version_id)
      references public.document_template_builder_versions(id)
      on delete set null;
  end if;
end $$;

create index if not exists document_template_builders_status_idx
  on public.document_template_builders(status);

create index if not exists document_template_builders_owner_department_idx
  on public.document_template_builders(owner_department_id);

create index if not exists document_template_builder_versions_template_idx
  on public.document_template_builder_versions(template_id, version_number desc);

create or replace function public.set_document_template_builder_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_document_template_builder_updated_at on public.document_template_builders;
create trigger trg_document_template_builder_updated_at
before update on public.document_template_builders
for each row execute function public.set_document_template_builder_updated_at();

alter table public.document_template_builders enable row level security;
alter table public.document_template_builder_versions enable row level security;

drop policy if exists document_template_builders_select on public.document_template_builders;
create policy document_template_builders_select
on public.document_template_builders for select to authenticated
using (status = 'published' or public.is_current_user_admin());

drop policy if exists document_template_builders_admin_insert on public.document_template_builders;
create policy document_template_builders_admin_insert
on public.document_template_builders for insert to authenticated
with check (public.is_current_user_admin());

drop policy if exists document_template_builders_admin_update on public.document_template_builders;
create policy document_template_builders_admin_update
on public.document_template_builders for update to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists document_template_builders_admin_delete on public.document_template_builders;
create policy document_template_builders_admin_delete
on public.document_template_builders for delete to authenticated
using (public.is_current_user_admin());

drop policy if exists document_template_builder_versions_select on public.document_template_builder_versions;
create policy document_template_builder_versions_select
on public.document_template_builder_versions for select to authenticated
using (
  status = 'published'
  or public.is_current_user_admin()
  or exists (
    select 1
    from public.document_template_builders b
    where b.id = document_template_builder_versions.template_id
      and b.status = 'published'
  )
);

drop policy if exists document_template_builder_versions_admin_insert on public.document_template_builder_versions;
create policy document_template_builder_versions_admin_insert
on public.document_template_builder_versions for insert to authenticated
with check (public.is_current_user_admin());

drop policy if exists document_template_builder_versions_admin_update on public.document_template_builder_versions;
create policy document_template_builder_versions_admin_update
on public.document_template_builder_versions for update to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists document_template_builder_versions_admin_delete on public.document_template_builder_versions;
create policy document_template_builder_versions_admin_delete
on public.document_template_builder_versions for delete to authenticated
using (public.is_current_user_admin());

grant select on public.document_template_builders to authenticated;
grant select on public.document_template_builder_versions to authenticated;
grant insert, update, delete on public.document_template_builders to authenticated;
grant insert, update, delete on public.document_template_builder_versions to authenticated;

comment on table public.document_template_builders is
  'Template dokumen native yang dirancang admin melalui Template Builder.';

comment on table public.document_template_builder_versions is
  'Versi immutable/draft template builder. Surat produksi harus menyimpan version_id agar render lama tetap stabil.';
